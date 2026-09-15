/**
 * Self-diagnostics интеграции с провайдером (DeepSeek).
 *
 * Проверяет, что ключевые селекторы вёрстки находятся на текущей странице
 * и что провайдерские методы возвращают осмысленные значения. Если DeepSeek
 * обновит вёрстку — селекторы отвалятся, и пользователь это увидит до того,
 * как упрётся в непонятное «ничего не работает».
 *
 * Использование:
 *   const report = await runDiagnostics();   // { checks: [...], summary: {...} }
 *   const text   = formatReportText(report); // для копирования/логирования
 */
const { getProviderByUrl } = require('../../providers');
const { estimateTokens } = require('./token-estimator');

/**
 * @typedef {'ok'|'warn'|'fail'|'skip'} CheckStatus
 * @typedef {{ id: string, label: string, status: CheckStatus, detail: string }} CheckResult
 */

/**
 * Обёртка: выполняет fn() и возвращает результат либо помечает проверку как failed.
 * Никогда не бросает — диагностика должна доходить до конца.
 */
function tryCheck(id, label, fn) {
  let status = 'ok';
  let detail = '';
  try {
    const r = fn();
    if (r && typeof r === 'object' && ('status' in r || 'detail' in r)) {
      status = r.status || 'ok';
      detail = String(r.detail || '');
    } else {
      detail = String(r == null ? '' : r);
    }
  } catch (err) {
    status = 'fail';
    detail = (err && err.message) || String(err);
  }
  return { id, label, status, detail };
}

/**
 * Обрезать строку для отчёта.
 */
function truncate(s, n) {
  const str = String(s == null ? '' : s);
  return str.length > n ? str.slice(0, n) + '…' : str;
}

/**
 * Прогнать все проверки провайдера.
 * @returns {Promise<{ok: boolean, checks: CheckResult[], summary: {ok:number, warn:number, fail:number, skip:number}, generatedAt: string, url: string, providerId: string|null, platform: string}>}
 */
async function runDiagnostics() {
  const url = (typeof location !== 'undefined' && location.href) || '';
  let provider = null;
  try {
    provider = getProviderByUrl(url);
  } catch (err) {
    provider = null;
  }

  const platform = provider
    ? (navigator.platform || navigator.userAgentData?.platform || 'unknown')
    : 'unknown';

  if (!provider) {
    return {
      ok: false,
      url,
      providerId: null,
      platform,
      generatedAt: new Date().toISOString(),
      checks: [
        {
          id: 'provider',
          label: 'Provider для текущего URL',
          status: 'fail',
          detail: 'Провайдер не распознан. URL: ' + truncate(url, 120),
        },
      ],
      summary: { ok: 0, warn: 0, fail: 1, skip: 0 },
    };
  }

  const checks = [];

  // 1. findInput
  checks.push(tryCheck('findInput', 'findInput — поле ввода', () => {
    const el = provider.findInput();
    if (!el) return { status: 'fail', detail: 'textarea не найден — селекторы устарели?' };
    const tag = (el.tagName || '').toLowerCase();
    const testid = el.getAttribute && (el.getAttribute('data-testid') || el.getAttribute('data-test-id'));
    const ph = el.getAttribute && el.getAttribute('placeholder');
    return { status: 'ok', detail: '<' + tag + '>' + (testid ? ' data-testid="' + testid + '"' : '') + (ph ? ' placeholder="' + truncate(ph, 40) + '"' : '') };
  }));

  // 2. findSendButton
  // Важно: пока идёт генерация, DeepSeek заменяет кнопку «отправить» на «стоп».
  // В этом случае findSendButton закономерно вернёт null — это не ошибка.
  checks.push(tryCheck('findSendButton', 'findSendButton — кнопка отправки', () => {
    const btn = provider.findSendButton();
    if (btn) {
      const label = (btn.getAttribute && (btn.getAttribute('aria-label') || btn.getAttribute('title'))) || '';
      return { status: 'ok', detail: 'button' + (label ? ' («' + truncate(label, 40) + '»)' : '') };
    }
    // Не нашли — проверяем, не идёт ли сейчас генерация.
    let generating = false;
    try {
      generating = typeof provider.isResponseComplete === 'function' && !!provider.isResponseComplete();
    } catch (_) {}
    if (generating) {
      return {
        status: 'skip',
        detail: 'идёт генерация — кнопка отправки заменена на «стоп» (норма)',
      };
    }
    // Дополнительно: поле ввода пустое → DeepSeek прячет кнопку отправки.
    let inputEmpty = false;
    try {
      const input = typeof provider.findInput === 'function' ? provider.findInput() : null;
      const val = input && typeof input.value === 'string' ? input.value.trim() : '';
      const ce = input && input.isContentEditable ? (input.textContent || '').trim() : '';
      inputEmpty = !val && !ce;
    } catch (_) {}
    if (inputEmpty) {
      return {
        status: 'warn',
        detail: 'поле ввода пустое — кнопка отправки может быть скрыта (проверьте после ввода текста)',
      };
    }
    return { status: 'fail', detail: 'кнопка отправки не найдена, хотя поле ввода не пустое' };
  }));

  // 3. isResponseComplete
  checks.push(tryCheck('isResponseComplete', 'isResponseComplete — детектор завершения ответа', () => {
    if (typeof provider.isResponseComplete !== 'function') {
      return { status: 'skip', detail: 'метод не определён у провайдера' };
    }
    const val = !!provider.isResponseComplete();
    // Сейчас может быть false если нет активного ответа — это нормально.
    return { status: 'ok', detail: 'возвращает ' + val + ' (для активной генерации ожидается true)' };
  }));

  // 4. getMessageCandidates
  checks.push(tryCheck('getMessageCandidates', 'getMessageCandidates — контейнеры AI-сообщений', () => {
    if (typeof provider.getMessageCandidates !== 'function') {
      return { status: 'skip', detail: 'метод не определён' };
    }
    const list = provider.getMessageCandidates() || [];
    if (!list.length) return { status: 'warn', detail: '.ds-message не найден — вёрстка изменилась или чат пуст' };
    return { status: 'ok', detail: 'найдено ' + list.length + ' сообщений' };
  }));

  // 5. extractUserInfo
  checks.push(tryCheck('extractUserInfo', 'extractUserInfo — пользователь в сайдбаре', () => {
    if (typeof provider.extractUserInfo !== 'function') {
      return { status: 'skip', detail: 'метод не определён' };
    }
    const info = provider.extractUserInfo() || '';
    if (!info) return { status: 'warn', detail: 'пусто (не залогинен или селектор устарел)' };
    return { status: 'ok', detail: '"' + truncate(info, 40) + '"' };
  }));

  // 6. extractSessionId
  checks.push(tryCheck('extractSessionId', 'extractSessionId — id текущей сессии', () => {
    if (typeof provider.extractSessionId !== 'function') {
      return { status: 'skip', detail: 'метод не определён' };
    }
    const sid = provider.extractSessionId(url);
    if (!sid) return { status: 'warn', detail: 'не удалось извлечь из URL: ' + truncate(url, 100) };
    return { status: 'ok', detail: truncate(url, 80) + ' → ' + sid };
  }));

  // 7. getConversationText
  checks.push(tryCheck('getConversationText', 'getConversationText — текст диалога для токенов', () => {
    if (typeof provider.getConversationText !== 'function') {
      return { status: 'skip', detail: 'метод не определён' };
    }
    const txt = provider.getConversationText() || '';
    if (!txt) return { status: 'warn', detail: 'вернул пусто (селектор .ds-message устарел или чат пуст)' };
    const tokens = estimateTokens(txt);
    return { status: 'ok', detail: 'символов: ' + txt.length + ', ~' + tokens + ' tok' };
  }));

  // 8. getCodeBlockLanguage (проверяем на первом pre)
  checks.push(tryCheck('getCodeBlockLanguage', 'getCodeBlockLanguage — язык code-блока', () => {
    if (typeof provider.getCodeBlockLanguage !== 'function') {
      return { status: 'skip', detail: 'метод не определён' };
    }
    const pre = document.querySelector('pre');
    if (!pre) return { status: 'warn', detail: 'pre-блоков на странице нет — нечего проверять' };
    const lang = provider.getCodeBlockLanguage(pre) || '';
    return { status: 'ok', detail: 'язык первого pre: "' + (lang || '(пусто)') + '"' };
  }));

  // 9. matchesUrl
  checks.push(tryCheck('matchesUrl', 'matchesUrl — распознавание URL провайдера', () => {
    if (typeof provider.matchesUrl !== 'function') {
      return { status: 'skip', detail: 'метод не определён' };
    }
    const m = provider.matchesUrl(url);
    return { status: m ? 'ok' : 'warn', detail: 'matchesUrl → ' + m };
  }));

  // 10. homeUrlPattern
  checks.push(tryCheck('homeUrlPattern', 'homeUrlPattern — regex домашней страницы', () => {
    if (!provider.homeUrlPattern) return { status: 'skip', detail: 'паттерн не задан' };
    const isHome = provider.homeUrlPattern.test(url);
    return { status: 'ok', detail: 'текущий URL ' + (isHome ? 'совпадает' : 'не совпадает') + ' с homeUrlPattern' };
  }));

  // 11. Наличие критичных DOM-узлов DeepSeek
  checks.push(tryCheck('dom.ds-message', 'DOM — контейнер .ds-message', () => {
    const n = document.querySelectorAll('.ds-message').length;
    if (!n) return { status: 'warn', detail: '.ds-message не найден в DOM' };
    return { status: 'ok', detail: 'узлов: ' + n };
  }));

  checks.push(tryCheck('dom.ds-markdown', 'DOM — .ds-markdown (markdown-контент)', () => {
    const n = document.querySelectorAll('.ds-markdown').length;
    if (!n) return { status: 'warn', detail: '.ds-markdown не найден' };
    return { status: 'ok', detail: 'узлов: ' + n };
  }));

  // 12. language provider (optional)
  checks.push(tryCheck('provider.lang', 'Провайдер — определения метаданных', () => {
    const parts = [];
    if (provider.id) parts.push('id=' + provider.id);
    if (provider.name) parts.push('name=' + provider.name);
    if (provider.homeUrl) parts.push('homeUrl=' + truncate(provider.homeUrl, 60));
    return { status: 'ok', detail: parts.join(', ') || 'нет метаданных' };
  }));

  const summary = { ok: 0, warn: 0, fail: 0, skip: 0 };
  for (const c of checks) summary[c.status] = (summary[c.status] || 0) + 1;

  return {
    ok: summary.fail === 0,
    url,
    providerId: provider.id || null,
    platform,
    generatedAt: new Date().toISOString(),
    checks,
    summary,
  };
}

const STATUS_ICON = { ok: '✅', warn: '⚠️', fail: '❌', skip: '•' };

/**
 * Преобразовать отчёт в plain-text для копирования в issue.
 */
function formatReportText(report) {
  const lines = [];
  lines.push('Cookie Code — диагностика интеграции');
  lines.push('Дата:      ' + report.generatedAt);
  lines.push('Провайдер: ' + (report.providerId || '(не распознан)'));
  lines.push('URL:       ' + report.url);
  lines.push('Platform:  ' + report.platform);
  lines.push('Итог:      ' +
    '✅ ' + report.summary.ok +
    '  ⚠️ ' + report.summary.warn +
    '  ❌ ' + report.summary.fail +
    '  • ' + report.summary.skip);
  lines.push('');
  for (const c of report.checks) {
    const icon = STATUS_ICON[c.status] || '•';
    lines.push(icon + ' ' + c.label);
    if (c.detail) lines.push('    ' + c.detail);
  }
  return lines.join('\n');
}

module.exports = { runDiagnostics, formatReportText };
