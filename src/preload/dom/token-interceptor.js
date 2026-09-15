/**
 * Перехватчик серверных токенов DeepSeek.
 *
 * DeepSeek в ответе POST https://chat.deepseek.com/api/v0/chat/completion
 * (стрим `data: {...}`) возвращает служебные поля с расходом токенов:
 *   - `accumulated_token_usage` (накопительно по диалогу, в основном входной промпт),
 *   - `usage.total_tokens` / `usage.prompt_tokens` / `usage.completion_tokens`.
 *
 * Модуль патчит window.fetch и XMLHttpRequest, безопасно (через safe())
 * извлекает эти значения и рассылает событие:
 *
 *   window.dispatchEvent(new CustomEvent('cuckoo:token-update', {
 *     detail: { total, delta, prompt, completion, source }
 *   }))
 *
 *   total  — накопленное серверное значение (accumulated_token_usage | usage.total_tokens)
 *   delta  — разница с предыдущим total (сколько токенов «стоил» последний ответ)
 *   source — 'accumulated' | 'usage' — откуда взято значение
 *
 * Все DOM/网络-операции обёрнуты в safe(): при смене API/вёрстки модуль
 * не бросает исключение наружу, а просто не применяется.
 */

const { safe } = require('./safe');

const COMPLETION_URL_PART = '/api/v0/chat/completion';
const EVENT_NAME = 'cuckoo:token-update';
const LOG_PREFIX = '[Cookie Code][tokens]';

// Последнее известное накопленное значение (по всему приложению).
let lastTotal = 0;
// Флаг, что перехват уже установлен (защита от повторной установки).
let installed = false;

/**
 * Попытаться вытащить объект usage из произвольного JSON-объекта ответа.
 * Поддерживает как поле accumulated_token_usage, так и вложенный usage.
 * @param {object} obj
 * @returns {{total:number, prompt:number, completion:number, source:string}|null}
 */
function extractUsage(obj) {
  if (!obj || typeof obj !== 'object') return null;

  // === Реальный формат DeepSeek (SSE completion) ===
  // Кадр-снимок (WIP): {"v":{"response":{"accumulated_token_usage":50, ...}}}
  // Финальный кадр:       {"p":"response","o":"BATCH","v":[{"p":"accumulated_token_usage","v":82}, ...]}

  // 1a) Патч-операции BATCH: v — массив [{p:"accumulated_token_usage", v:<n>}, ...].
  if (Array.isArray(obj.v)) {
    for (let i = obj.v.length - 1; i >= 0; i--) {
      const op = obj.v[i];
      if (op && typeof op === 'object' && op.p === 'accumulated_token_usage') {
        const n = pickNumber(op, ['v', 'value']);
        if (n != null) return { total: n, prompt: 0, completion: 0, source: 'accumulated' };
      }
    }
  }

  // 1b) Кадр-снимок: v.response.accumulated_token_usage.
  const snapResp = obj.v && typeof obj.v === 'object' && !Array.isArray(obj.v) ? obj.v.response : null;
  if (snapResp && typeof snapResp === 'object') {
    const n = pickNumber(snapResp, ['accumulated_token_usage']);
    if (n != null) return { total: n, prompt: 0, completion: 0, source: 'accumulated' };
  }

  // 2) accumulated_token_usage в корне (число либо объект) — на случай смены формата.
  const acc = obj.accumulated_token_usage;
  if (typeof acc === 'number' && Number.isFinite(acc)) {
    return { total: acc, prompt: 0, completion: 0, source: 'accumulated' };
  }
  if (acc && typeof acc === 'object') {
    const t = pickNumber(acc, ['total_tokens', 'total', 'value']);
    if (t != null) return { total: t, prompt: pickNumber(acc, ['prompt_tokens']) || 0, completion: pickNumber(acc, ['completion_tokens']) || 0, source: 'accumulated' };
  }

  // 3) usage.total_tokens — резервный источник (OpenAI-подобный формат).
  const usage = obj.usage;
  if (usage && typeof usage === 'object') {
    const t = pickNumber(usage, ['total_tokens', 'total']);
    if (t != null) return { total: t, prompt: pickNumber(usage, ['prompt_tokens']) || 0, completion: pickNumber(usage, ['completion_tokens']) || 0, source: 'usage' };
  }

  return null;
}

/**
 * Достать первое числовое поле из объекта по списку имён.
 * @param {object} obj
 * @param {string[]} keys
 * @returns {number|null}
 */
function pickNumber(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Применить найденный usage: посчитать дельту и разослать событие.
 * @param {{total:number, prompt:number, completion:number, source:string}} usage
 */
function publish(usage) {
  if (!usage || !Number.isFinite(usage.total)) return;
  const delta = usage.total - lastTotal;
  // Игнорируем «нулевые» и отрицательные дельты (сброс/смена сессии).
  if (delta < 0) {
    lastTotal = usage.total;
    return;
  }
  lastTotal = usage.total;
  // Нулевую дельту (стартовый кадр-снимок) не рассылаем — полезны только реальные приросты.
  if (delta === 0) return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: { total: usage.total, delta, prompt: usage.prompt, completion: usage.completion, source: usage.source },
    }));
  } catch (_) { /* CustomEvent недоступен — молча */ }
  try {
    console.log(LOG_PREFIX + ' server tokens: total=' + usage.total + ' delta=' + delta + ' src=' + usage.source);
  } catch (_) {}
}

/**
 * Распарсить тело SSE-стрима (строка) и вернуть последний найденный usage.
 * Формат строк: "data: {...}\n" (иногда с \n\n-разделителями).
 * @param {string} text
 * @returns {{total:number, prompt:number, completion:number, source:string}|null}
 */
function parseSseText(text) {
  if (!text || typeof text !== 'string') return null;
  let found = null;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    const parsed = safeJson(payload);
    if (!parsed) continue;
    const usage = extractUsage(parsed);
    if (usage) found = usage;
  }
  return found;
}

/**
 * safe JSON.parse без исключений.
 * @param {string} s
 * @returns {object|null}
 */
function safeJson(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}

/**
 * Является ли URL запросом completion DeepSeek.
 * @param {string} url
 * @returns {boolean}
 */
function isCompletionUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.indexOf(COMPLETION_URL_PART) !== -1;
}

/**
 * Установить приём серверных токенов.
 *
 * ВАЖНО: preload работает в изолированном мире (contextIsolation: true) и НЕ
 * видит window.fetch сайта — патчить его здесь бесполезно. Реальный перехват
 * ставится в основном мире (src/main/token-interceptor-inject.js) и присылает
 * данные через window.postMessage({__cuckoo:'token-update', ...}).
 *
 * Здесь мы только слушаем message и ретранслируем в внутреннее событие
 * cuckoo:token-update. Патчи fetch/XHR оставлены как резерв на случай, если
 * contextIsolation выключат.
 *
 * Идемпотентно: повторный вызов ничего не делает.
 */
function install() {
  if (installed) return;
  installed = true;

  // Основной канал: postMessage из main world.
  safe('token-interceptor.listenMessage', () => {
    window.addEventListener('message', (e) => {
      try {
        const d = e && e.data;
        if (!d || d.__cuckoo !== 'token-update') return;
        if (typeof d.total !== 'number' || !Number.isFinite(d.total)) return;
        const delta = typeof d.delta === 'number' ? d.delta : 0;
        const usage = { total: d.total, delta, prompt: 0, completion: 0, source: d.source || 'accumulated' };
        // publish ожидает total и сам считает дельту от lastTotal; чтобы не
        // считать дважды, синхронизируем lastTotal из main world.
        lastTotal = d.total - delta;
        publish(usage);
      } catch (_) {}
    });
  });

  // Резерв: патчи в самом preload (сработают только без contextIsolation).
  safe('token-interceptor.patchFetch', () => patchFetch());
  safe('token-interceptor.patchXhr', () => patchXhr());
}

/**
 * Патч window.fetch: перехватываем только запросы completion,
 * клонируем ответ и читаем тело как текст (SSE).
 */
function patchFetch() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const originalFetch = window.fetch;

  window.fetch = function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const p = originalFetch.apply(this, arguments);
    if (!isCompletionUrl(url)) return p;

    return p.then((response) => {
      safe('token-interceptor.fetchRead', () => {
        // Клонируем, чтобы не «съесть» тело у вызывающего кода.
        const clone = response.clone();
        clone.text().then((body) => {
          const usage = parseSseText(body);
          if (usage) publish(usage);
        }).catch(() => {});
      });
      return response;
    });
  };
}

/**
 * Патч XMLHttpRequest.open/send: запоминаем URL, по завершении читаем responseText.
 */
function patchXhr() {
  if (typeof window === 'undefined' || typeof window.XMLHttpRequest !== 'function') return;
  const XHR = window.XMLHttpRequest;
  const originalOpen = XHR.prototype.open;
  const originalSend = XHR.prototype.send;

  XHR.prototype.open = function patchedOpen(method, url) {
    try { this.__cuckooUrl = url; } catch (_) {}
    return originalOpen.apply(this, arguments);
  };

  XHR.prototype.send = function patchedSend() {
    try {
      const url = this.__cuckooUrl || '';
      if (isCompletionUrl(url)) {
        this.addEventListener('load', () => {
          safe('token-interceptor.xhrRead', () => {
            const body = this.responseText;
            const usage = parseSseText(body);
            if (usage) publish(usage);
          });
        });
      }
    } catch (_) {}
    return originalSend.apply(this, arguments);
  };
}

module.exports = {
  install,
  // Экспортируем внутренности для тестов.
  _extractUsage: extractUsage,
  _parseSseText: parseSseText,
  _isCompletionUrl: isCompletionUrl,
  _publish: publish,
  _resetTotal: () => { lastTotal = 0; },
  _setLastTotal: (v) => { lastTotal = v; },
  _getLastTotal: () => lastTotal,
  EVENT_NAME,
};
