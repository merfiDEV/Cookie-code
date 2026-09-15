/**
 * Индикатор мета-информации под ответом AI:
 *   ⏱ 9.2s · ~308 tok · Затронуто # file.txt
 *
 * Время измеряется локально (от появления нового AI-сообщения до его завершения).
 * Токены — дельта accumulated_token_usage за этот ответ (серверные);
 * fallback — грубая оценка: длина текста / 4.
 * Затронуто — список файлов, затронутых за этот ответ (write/edit) — только успешные.
 * Данные сохраняются в localStorage (переживают Ctrl+R).
 */

const META_CLASS = 'cuckoo-response-meta';
const ATTR_MARKED = 'data-cuckoo-meta-marked';
const STORAGE_KEY = 'cuckoo-response-meta';

let t = (k) => k;
try { ({ t } = require('../i18n/i18n')); } catch (_) {}

let state = null;
try { state = require('./state'); } catch (_) { state = { showProducedFiles: true }; }

let estimateTokens = (s) => (s ? Math.ceil(s.length / 4) : 0);
try { ({ estimateTokens } = require('./token-estimator')); } catch (_) {}

// Активные замеры: messageEl -> { start }
let activeTimers = new WeakMap();

// Последняя серверная дельта токенов (из token-interceptor) и момент её прихода.
// Если дельта пришла во время замера ответа — используем её вместо локальной оценки.
let lastServerDelta = { value: 0, at: 0 };
let serverDeltaListenerBound = false;

/**
 * Подписаться на событие cuckoo:token-update (однократно).
 */
function bindServerDeltaListener() {
  if (serverDeltaListenerBound) return;
  serverDeltaListenerBound = true;
  try {
    window.addEventListener('cuckoo:token-update', (e) => {
      try {
        const d = e && e.detail ? e.detail : {};
        if (typeof d.delta === 'number' && d.delta > 0) {
          lastServerDelta = { value: d.delta, at: performance.now() };
        }
      } catch (_) {}
    });
  } catch (_) {}
}

// Подтверждённые файлы по сообщению: messageEl -> Array<{path, op, status}>
let confirmedMap = new WeakMap();

// Глобальный флаг вкл/выкл блока «Затронуто»
let producedEnabled = true;
try {
  if (state && typeof state.showProducedFiles === 'boolean') producedEnabled = state.showProducedFiles !== false;
} catch (_) {}

/**
 * Включить/выключить отображение блока «Затронуто».
 * При выключении скрывает уже отрендеренные чипы, при включении — показывает и ресканит.
 * @param {boolean} on
 */
function setEnabled(on) {
  producedEnabled = on !== false;
  try { if (state) state.showProducedFiles = producedEnabled; } catch (_) {}
  if (typeof document === 'undefined') return;
  const metas = document.querySelectorAll('.' + META_CLASS);
  for (const meta of metas) {
    const produced = meta.querySelector('.cuckoo-response-meta-produced');
    const sep = meta.querySelector('.cuckoo-response-meta-sep-files');
    if (!produced) continue;
    if (producedEnabled) {
      produced.style.display = '';
      if (sep) sep.style.display = '';
    } else {
      produced.style.display = 'none';
      if (sep) sep.style.display = 'none';
    }
  }
  // При включении — попробуем восстановить из стораджа для сообщений без чипов
  if (producedEnabled) {
    try { restoreFromStorage(); } catch (_) {}
  }
}

function isProducedEnabled() {
  if (typeof producedEnabled === 'boolean') return producedEnabled;
  try { if (state && typeof state.showProducedFiles === 'boolean') return state.showProducedFiles !== false; } catch (_) {}
  return true;
}

/**
 * Стабильный ключ сообщения между перезагрузками (текст + длина).
 */
function getMessageKey(messageEl) {
  try {
    const md = messageEl.querySelector('.ds-markdown');
    if (!md) return null;
    const norm = String(md.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    return norm + '|' + norm.length;
  } catch (_) {
    return null;
  }
}

function readMetaStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function writeMetaStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    // Обновляем кеш — следующий read вернёт свежие данные
    cachedStore = store;
    cachedStoreTime = Date.now();
  } catch (_) {}
}

/**
 * Запустить замер для нового AI-сообщения (если ещё не замерялось).
 */
function startTimer(messageEl) {
  if (!messageEl) return;
  bindServerDeltaListener();
  if (activeTimers.has(messageEl)) return;
  activeTimers.set(messageEl, { start: performance.now() });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortFileName(filePath) {
  try {
    const norm = String(filePath).replace(/\\/g, '/');
    const parts = norm.split('/').filter(Boolean);
    // Убираем букву диска (D:) из отображения
    const filtered = parts.length > 0 && /^[A-Za-z]:$/.test(parts[0]) ? parts.slice(1) : parts;
    if (filtered.length === 0) return filePath;
    if (filtered.length <= 2) return filtered.join('/');
    return filtered.slice(-2).join('/');
  } catch (_) { return filePath; }
}

/**
 * Нормализовать запись файла к объекту {path, op, status}
 * Старый формат — string, новый — {path, op, status}
 * @param {any} entry
 * @returns {{path:string, op:string, status:string}}
 */
function normalizeFileEntry(entry) {
  if (typeof entry === 'string') {
    return { path: entry, op: 'unknown', status: 'pending' };
  }
  if (entry && typeof entry.path === 'string') {
    return {
      path: String(entry.path),
      op: entry.op || 'unknown',
      status: entry.status || 'pending'
    };
  }
  return null;
}

function denormalizeForStore(files) {
  // Храним как объекты {path, op, status} — обратно совместимо со string[]
  return files;
}

/**
 * Извлечь файлы из куска кода (строки) с операцией.
 * @param {string} code
 * @returns {Array<{path:string, op:string}>}
 */
function extractFilesFromCode(code) {
  const out = [];
  const seen = new Set();
  if (!code || typeof code !== 'string') return out;
  const re1 = /await\s+(write|edit|writeFile|editFile|deleteFile)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = re1.exec(code)) !== null) {
    const op = (m[1] || 'unknown').trim();
    const raw = (m[2] || '').trim();
    if (!raw || raw.length > 500 || raw.includes('...')) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push({ path: raw, op });
  }
  // JSON style fallback внутри того же блока, если есть write/edit маркер
  if (/await\s+(write|edit|writeFile|editFile|deleteFile)\s*\(/.test(code)) {
    const re2 = /["']file_path["']\s*:\s*["'`]([^"'`]+)["'`]/g;
    while ((m = re2.exec(code)) !== null) {
      const raw = (m[1] || '').trim();
      if (!raw || raw.length > 500 || raw.includes('...')) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      out.push({ path: raw, op: 'write' });
    }
  }
  return out;
}

/**
 * Извлечь список файлов, затронутых в этом ответе.
 * Ищет вызовы write/edit/writeFile/editFile/deleteFile в <pre> блоках.
 * Поддерживает как JS API `await write("path", ...)` так и JSON `file_path`.
 * Возвращает массив объектов {path, op, status} — для тестов и рантайма.
 * Для обратной совместимости также экспортируется string[] версия через extractAffectedFilesPaths.
 * @param {Element} messageEl
 * @returns {Array<{path:string, op:string, status:string}>}
 */
function extractFileEntries(messageEl) {
  const files = [];
  const seen = new Set();
  try {
    const pres = messageEl.querySelectorAll('pre');
    for (const pre of pres) {
      const code = pre.textContent || '';
      if (!code) continue;
      const entries = extractFilesFromCode(code);
      for (const e of entries) {
        if (seen.has(e.path)) continue;
        seen.add(e.path);
        files.push({ path: e.path, op: e.op, status: 'pending' });
      }
    }
    // Fallback: если <pre> ещё не отрендерился, ищем прямо в тексте сообщения
    if (files.length === 0) {
      try {
        const md = messageEl.querySelector('.ds-markdown');
        const text = md ? (md.textContent || '') : (messageEl.textContent || '');
        if (text) {
          const reText = /await\s+(write|edit|writeFile|editFile|deleteFile)\s*\(\s*["'`]([^"'`]+)["'`]/g;
          let m;
          while ((m = reText.exec(text)) !== null) {
            const op = (m[1] || 'unknown').trim();
            const raw = (m[2] || '').trim();
            if (!raw || raw.length > 500 || raw.includes('...')) continue;
            if (seen.has(raw)) continue;
            seen.add(raw);
            files.push({ path: raw, op, status: 'pending' });
            if (files.length >= 20) break;
          }
        }
      } catch (_) {}
    }
    // Fallback: JSON toolCall формат вне <pre> (если AI использует JSON вместо cuckoo)
    if (files.length === 0) {
      try {
        const md = messageEl.querySelector('.ds-markdown');
        const text = md ? (md.textContent || '') : (messageEl.textContent || '');
        if (text && /"(write|edit|file_write|file_edit)"/.test(text) && text.includes('file_path')) {
          const reJson1 = /"toolName"\s*:\s*"(write|edit|file_write|file_edit|writeFile|editFile)"[^}]*?"file_path"\s*:\s*"([^"]+)"/g;
          const reJson2 = /"file_path"\s*:\s*"([^"]+)"[^}]*?"toolName"\s*:\s*"(write|edit|file_write|file_edit)"/g;
          let m;
          while ((m = reJson1.exec(text)) !== null) {
            const op = (m[1] || 'write').trim();
            const raw = (m[2] || '').trim();
            if (!raw || raw.length > 500 || raw.includes('...')) continue;
            if (seen.has(raw)) continue;
            seen.add(raw);
            files.push({ path: raw, op, status: 'pending' });
          }
          while ((m = reJson2.exec(text)) !== null) {
            const raw = (m[1] || '').trim();
            const op = (m[2] || 'write').trim();
            if (!raw || raw.length > 500 || raw.includes('...')) continue;
            if (seen.has(raw)) continue;
            seen.add(raw);
            files.push({ path: raw, op, status: 'pending' });
          }
          if (files.length === 0) {
            const reAny = /"file_path"\s*:\s*"([^"]+)"/g;
            while ((m = reAny.exec(text)) !== null) {
              const raw = (m[1] || '').trim();
              if (!raw || raw.length > 500 || raw.includes('...')) continue;
              if (seen.has(raw)) continue;
              const ctx = text.slice(Math.max(0, m.index - 200), m.index + 200);
              if (!/(write|edit|file_write|file_edit)/.test(ctx)) continue;
              seen.add(raw);
              files.push({ path: raw, op: 'write', status: 'pending' });
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}
  return files.slice(0, 20);
}

/**
 * Обратная совместимость: вернуть только пути как string[].
 * Используется старыми вызовами и тестами на дедуп/лимит.
 * @param {Element} messageEl
 * @returns {string[]}
 */
function extractAffectedFiles(messageEl) {
  const entries = extractFileEntries(messageEl);
  return entries.map(e => e.path);
}

/**
 * Записать подтверждённые файлы для сообщения (из реальных успешных вызовов).
 * Вызывается из observer после выполнения tool.
 * @param {Element} messageEl
 * @param {Array<{path:string, op:string, status:string}>} files
 */
function setProducedFiles(messageEl, files) {
  if (!messageEl) return;
  const normalized = (Array.isArray(files) ? files : []).map(normalizeFileEntry).filter(Boolean).slice(0, 20);
  confirmedMap.set(messageEl, normalized);
  // Обновляем UI если мета уже отрендерена
  try {
    const meta = messageEl.querySelector('.' + META_CLASS);
    if (meta) {
      // Удаляем старую мету и перерисуем с подтверждёнными данными
      const secondsEl = meta.querySelector('.cuckoo-response-meta-item span');
      // Пытаемся достать seconds/tokens из текущей меты или из стора
      let seconds = '0.0';
      let tokens = 0;
      try {
        const key = getMessageKey(messageEl);
        const store = readMetaStore();
        const rec = key ? store[key] : null;
        if (rec) {
          seconds = rec.seconds != null ? String(rec.seconds) : seconds;
          tokens = rec.tokens != null ? rec.tokens : tokens;
        }
      } catch (_) {}
      // Снимаем маркировку чтобы render пересоздал
      messageEl.removeAttribute(ATTR_MARKED);
      meta.remove();
      renderMetaPanel(messageEl, seconds, tokens, normalized);
      // Обновляем сторадж
      try {
        const key = getMessageKey(messageEl);
        if (key) {
          const store = readMetaStore();
          const rec = store[key] || {};
          rec.files = normalized;
          if (!rec.seconds) rec.seconds = parseFloat(seconds) || 0;
          if (!rec.tokens) rec.tokens = tokens;
          store[key] = rec;
          writeMetaStore(store);
        }
      } catch (_) {}
    } else {
      // Мета ещё не создана — сохраним для finishTimer/restore
      // finishTimer проверит confirmedMap
    }
  } catch (_) {}
}

/**
 * Записать результаты выполнения JS-блоков (batch) — вызывается из observer.
 * @param {Element} messageEl
 * @param {Array<{code:string, result:{success?:boolean, denied?:boolean, error?:string}}>} results
 */
function recordExecutionResults(messageEl, results) {
  if (!messageEl || !Array.isArray(results) || results.length === 0) return;
  const toConfirm = [];
  const seen = new Set();
  for (const item of results) {
    if (!item || typeof item.code !== 'string') continue;
    const entries = extractFilesFromCode(item.code);
    // Если в коде нет файлового вызова, но результат success — пропускаем
    if (entries.length === 0) continue;
    const status = item.result && item.result.denied ? 'denied' : (item.result && item.result.success ? 'success' : 'error');
    // Только успешные считаем «затронутыми» — по требованию фильтровать success:true
    // Но храним и error для отображения красным (опционально). Фильтруем denied/error как не успешные для основного списка,
    // но сохраняем чтобы UI мог показать ошибку если нужно.
    for (const e of entries) {
      if (seen.has(e.path)) continue;
      seen.add(e.path);
      // Если статус не success, не добавляем в «затронуто» (только успешные)
      if (status !== 'success') continue;
      toConfirm.push({ path: e.path, op: e.op, status });
    }
  }
  if (toConfirm.length > 0) {
    // Мерджим с уже подтверждёнными
    const existing = confirmedMap.get(messageEl) || [];
    const mergedMap = new Map(existing.map(f => [f.path, f]));
    for (const f of toConfirm) {
      if (!mergedMap.has(f.path)) mergedMap.set(f.path, f);
      else {
        // Обновляем статус если был pending
        const prev = mergedMap.get(f.path);
        if (prev.status === 'pending') mergedMap.set(f.path, f);
      }
    }
    const merged = Array.from(mergedMap.values()).slice(0, 20);
    setProducedFiles(messageEl, merged);
  }
}

/**
 * Записать одиночный JSON tool-вызов (write/edit/delete) — вызывается из observer для file_* tools.
 * @param {Element} messageEl
 * @param {string} toolName
 * @param {{file_path?:string}} params
 * @param {{success?:boolean, denied?:boolean}} result
 */
function recordSingleToolCall(messageEl, toolName, params, result) {
  if (!messageEl || !params || typeof params.file_path !== 'string') return;
  const filePath = String(params.file_path).trim();
  if (!filePath || filePath.length > 500 || filePath.includes('...')) return;
  const status = result && result.denied ? 'denied' : (result && result.success ? 'success' : 'error');
  if (status !== 'success') return; // показываем только успешные
  const opMap = { file_write: 'write', file_edit: 'edit', file_delete: 'deleteFile' };
  const op = opMap[toolName] || toolName;
  const allowedOps = ['write', 'edit', 'writeFile', 'editFile', 'deleteFile', 'file_write', 'file_edit', 'file_delete'];
  if (!allowedOps.includes(toolName) && !allowedOps.includes(op)) return;
  const entry = { path: filePath, op, status };
  const existing = confirmedMap.get(messageEl) || [];
  const mergedMap = new Map(existing.map(f => [f.path, f]));
  if (!mergedMap.has(entry.path)) mergedMap.set(entry.path, entry);
  else {
    const prev = mergedMap.get(entry.path);
    if (prev.status === 'pending') mergedMap.set(entry.path, entry);
  }
  setProducedFiles(messageEl, Array.from(mergedMap.values()).slice(0, 20));
}

/**
 * Отрисовать мета-панель.
 */
function renderMetaPanel(messageEl, seconds, tokensEstimate, files) {
  if (!messageEl) return;
  if (messageEl.getAttribute(ATTR_MARKED) === '1') return;
  const markdown = messageEl.querySelector('.ds-markdown');
  const anchor = markdown || messageEl;
  if (!anchor.parentElement) return;
  if (messageEl.querySelector('.' + META_CLASS)) {
    messageEl.setAttribute(ATTR_MARKED, '1');
    return;
  }

  // Если есть подтверждённые файлы для этого сообщения — приоритет им
  let effectiveFiles = files;
  try {
    const confirmed = confirmedMap.get(messageEl);
    if (Array.isArray(confirmed) && confirmed.length > 0) {
      effectiveFiles = confirmed;
    }
  } catch (_) {}

  // Нормализуем к объектам
  const normalized = (Array.isArray(effectiveFiles) ? effectiveFiles : []).map(normalizeFileEntry).filter(Boolean).slice(0, 20);
  // Фильтруем только успешные для отображения (pending тоже показываем, т.к. ещё не подтверждено но уже спарсено)
  // Показываем все, но denied/error можно подсветить
  const toRender = normalized;
  const hasFiles = toRender.length > 0 && isProducedEnabled();

  const meta = document.createElement('div');
  meta.className = META_CLASS;
  // i18n с фолбэком на русский, если t() недоступен
  let timeTitle = 'Время ответа';
  let tokensTitle = 'Токены ответа (серверные, при недоступности — оценка chars / 4)';
  let producedLabel = 'Затронуто';
  let producedTitle = 'Файлы, затронутые за этот ответ';
  try {
    const tt = t('meta.time.title'); if (tt && tt !== 'meta.time.title') timeTitle = tt;
    const tk = t('meta.tokens.title'); if (tk && tk !== 'meta.tokens.title') tokensTitle = tk;
    const pl = t('meta.produced'); if (pl && pl !== 'meta.produced') producedLabel = pl;
    const pt = t('meta.produced.title'); if (pt && pt !== 'meta.produced.title') producedTitle = pt;
  } catch (_) {}
  let html =
    '<span class="cuckoo-response-meta-item" title="' + escapeHtml(timeTitle) + '">' +
    '  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '    <circle cx="8" cy="8" r="6.375" stroke="currentColor" stroke-width="1.25"/>' +
    '    <path d="M8 4.4V8.3L10.7 9.85" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>' +
    '  </svg>' +
    '  <span>' + seconds + 's</span>' +
    '</span>' +
    '<span class="cuckoo-response-meta-sep">·</span>' +
    '<span class="cuckoo-response-meta-item" title="' + escapeHtml(tokensTitle) + '">' +
    '  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '    <path d="M2.25 7.95A5.75 2.4 0 0 0 13.75 7.95" stroke="currentColor" stroke-width="1.25"/>' +
    '    <path d="M8 13.5V14.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>' +
    '  </svg>' +
    '  <span>~' + tokensEstimate + ' tok</span>' +
    '</span>';

  if (hasFiles) {
    html +=
      '<span class="cuckoo-response-meta-sep cuckoo-response-meta-sep-files">·</span>' +
      '<span class="cuckoo-response-meta-produced" title="' + escapeHtml(producedTitle) + '">' +
      '  <span class="cuckoo-response-meta-produced-label">' + escapeHtml(producedLabel) + '</span>';
    for (const f of toRender) {
      const short = shortFileName(f.path);
      const status = f.status || 'pending';
      const opTitle = f.op !== 'unknown' ? f.op + ': ' + f.path : f.path;
      html += '<span class="cuckoo-produced-chip" data-path="' + escapeHtml(f.path) + '" data-op="' + escapeHtml(f.op) + '" data-status="' + escapeHtml(status) + '" title="' + escapeHtml(opTitle) + '" tabindex="0" role="button">' +
              '<span class="cuckoo-produced-chip-hash">#</span>' +
              '<span class="cuckoo-produced-chip-name">' + escapeHtml(short) + '</span>' +
              '</span>';
    }
    html += '</span>';
  }

  meta.innerHTML = html;

  // Клики по чипам → открыть файл в системе (как file-chip)
  if (hasFiles) {
    const chips = meta.querySelectorAll('.cuckoo-produced-chip');
    for (const chip of chips) {
      const rawPath = chip.getAttribute('data-path') || '';
      const onActivate = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (!window.electronAPI || typeof window.electronAPI.openPath !== 'function') {
            console.warn('[Cookie Code] openPath not available');
            return;
          }
          let target = rawPath.replace(/\//g, '\\');
          const isAbs = /^[A-Za-z]:[\\/]/.test(target) || /^\\\\/.test(target);
          if (!isAbs) {
            let projectDir = null;
            try {
              const stateInner = require('./state');
              projectDir = stateInner.currentProjectDir || null;
            } catch (_) {}
            if (projectDir) {
              const sep = projectDir.includes('\\') ? '\\' : '/';
              const rel = target.replace(/^\.\\/, '').replace(/^\.\.\\/, '');
              target = projectDir.replace(/[\\/]+$/, '') + sep + rel.replace(/^[\\/]+/, '');
            } else {
              console.warn('[Cookie Code] Produced chip: no projectDir to resolve ' + rawPath);
              return;
            }
          }
          window.electronAPI.openPath(target).then((res) => {
            if (res && !res.success) console.warn('[Cookie Code] Produced chip open failed: ' + (res.error || 'unknown'));
          }).catch((err) => console.warn('[Cookie Code] Produced chip error: ' + err.message));
        } catch (err) {
          console.warn('[Cookie Code] Produced chip error: ' + err.message);
        }
      };
      chip.addEventListener('click', onActivate);
      chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') onActivate(e); });
    }
  }

  anchor.parentElement.insertBefore(meta, anchor.nextSibling);
  messageEl.setAttribute(ATTR_MARKED, '1');
}

/**
 * Завершить замер и отрисовать мету.
 */
function finishTimer(messageEl) {
  if (!messageEl) return;
  if (messageEl.getAttribute(ATTR_MARKED) === '1') return;

  const rec = activeTimers.get(messageEl);
  const elapsedMs = rec ? (performance.now() - rec.start) : 0;
  activeTimers.delete(messageEl);

  const markdown = messageEl.querySelector('.ds-markdown');
  const text = markdown ? (markdown.textContent || '') : '';
  // Токены ответа: приоритет — серверная дельта accumulated_token_usage,
  // если она пришла во время этого замера (после rec.start).
  // Иначе — локальная оценка (CJK 0.6 / ASCII 0.3).
  let tokensEstimate = estimateTokens(text);
  try {
    if (lastServerDelta.value > 0 && (!rec || lastServerDelta.at >= rec.start)) {
      tokensEstimate = lastServerDelta.value;
    }
  } catch (_) {}
  const seconds = (elapsedMs / 1000).toFixed(1);
  // Проверяем подтверждённые файлы (если уже есть успешные выполнения)
  let files = null;
  try {
    const confirmed = confirmedMap.get(messageEl);
    if (Array.isArray(confirmed) && confirmed.length > 0) {
      files = confirmed;
    } else {
      // Парсим как объекты
      files = extractFileEntries(messageEl);
    }
  } catch (_) {
    files = extractFileEntries(messageEl);
  }

  renderMetaPanel(messageEl, seconds, tokensEstimate, files);

  // Сохраняем — переживёт Ctrl+R
  try {
    const key = getMessageKey(messageEl);
    if (key) {
      const store = readMetaStore();
      store[key] = { seconds: parseFloat(seconds), tokens: tokensEstimate, files: files };
      writeMetaStore(store);
    }
  } catch (_) {}
}

/**
 * Проверить, что элемент — это AI-сообщение (не user).
 */
function isAIMessage(el) {
  if (!el || !el.classList) return false;
  if (!el.classList.contains('ds-message')) return false;
  if (el.classList.contains('d29f3d7d')) return false;
  return true;
}

/**
 * Найти последнее AI-сообщение.
 */
function findLatestAIMessage() {
  const all = document.querySelectorAll('.ds-message');
  for (let i = all.length - 1; i >= 0; i--) {
    if (isAIMessage(all[i])) return all[i];
  }
  return null;
}

/**
 * Восстановить мета-панели из localStorage (после reload).
 */
// Кеш localStorage — чтобы не парсить JSON каждые 500ms
let cachedStore = null;
let cachedStoreTime = 0;
const STORE_CACHE_TTL = 2000;

function getCachedStore() {
  const now = Date.now();
  if (cachedStore && (now - cachedStoreTime) < STORE_CACHE_TTL) return cachedStore;
  cachedStore = readMetaStore();
  cachedStoreTime = now;
  return cachedStore;
}

function invalidateStoreCache() {
  cachedStore = null;
  cachedStoreTime = 0;
}

function restoreFromStorage() {
  const store = getCachedStore();
  if (!store || Object.keys(store).length === 0) return;
  const all = document.querySelectorAll('.ds-message');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (!isAIMessage(el)) continue;
    if (el.getAttribute(ATTR_MARKED) === '1') continue;
    const key = getMessageKey(el);
    if (!key) continue;
    const rec = store[key];
    if (!rec) continue;
    try {
      // Поддержка старого формата string[] и нового {path, op, status}[]
      let files = null;
      if (Array.isArray(rec.files)) {
        files = rec.files.map(normalizeFileEntry).filter(Boolean);
      } else {
        files = null;
      }
      let fresh = null;
      try { fresh = extractFileEntries(el); } catch (_) { fresh = []; }
      // Если в сторе пусто, но в DOM есть — дополняем
      if (!files || files.length === 0) {
        if (fresh && fresh.length > 0) {
          // Фильтруем только если нет подтверждённых — пока pending
          files = fresh;
          rec.files = fresh;
          try { writeMetaStore(store); } catch (_) {}
        } else {
          files = fresh || [];
        }
      } else if (fresh && fresh.length > files.length) {
        // В DOM появилось больше файлов, чем было сохранено (поздний рендер) — обновляем если нет подтверждённых
        const hasConfirmed = files.some(f => f.status === 'success');
        if (!hasConfirmed) {
          files = fresh;
          rec.files = fresh;
          try { writeMetaStore(store); } catch (_) {}
        }
      }
      // Если есть подтверждённые в confirmedMap — приоритет им
      try {
        const confirmed = confirmedMap.get(el);
        if (Array.isArray(confirmed) && confirmed.length > 0) files = confirmed;
      } catch (_) {}
      renderMetaPanel(el, rec.seconds, rec.tokens, files || []);
    } catch (_) {}
  }
}

/**
 * Watcher: стартуем таймеры для новых сообщений + восстанавливаем старые из storage.
 */
let watchStarted = false;
function startWatch() {
  if (watchStarted) return;
  watchStarted = true;
  window.__cuckooMetaWatchStarted = true;

  const run = () => {
    try {
      restoreFromStorage();
      const all = document.querySelectorAll('.ds-message');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (!isAIMessage(el)) continue;
        if (el.getAttribute(ATTR_MARKED) === '1') continue;
        if (activeTimers.has(el)) continue;
        if (!el.querySelector('.ds-markdown')) continue;
        startTimer(el);
      }
    } catch (_) {}
  };

  // Debounce — не чаще раза в 500ms, чтобы не спамить localStorage.
  let debounceTimer = null;
  const runDebounced = () => {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      run();
    }, 500);
  };

  if (document.body) {
    const mo = new MutationObserver(runDebounced);
    mo.observe(document.body, { childList: true, subtree: true });
    run();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      const mo = new MutationObserver(runDebounced);
      mo.observe(document.body, { childList: true, subtree: true });
      run();
    }, { once: true });
  }
  console.log('[meta] watch started (debounced mutation)');
}

/**
 * Очистить сохранённые мета-данные.
 */
function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[Cookie Code] Мета-данные очищены');
  } catch (err) {
    console.error('[Cookie Code] Не удалось очистить мета-данные:', err.message);
  }
}

/**
 * Сброс внутренних карт для тестов (WeakMap не итерируется — пересоздаём).
 */
function resetForTests() {
  activeTimers = new WeakMap();
  confirmedMap = new WeakMap();
  lastServerDelta = { value: 0, at: 0 };
  cachedStore = null;
  cachedStoreTime = 0;
  producedEnabled = true;
  try { if (state) state.showProducedFiles = true; } catch (_) {}
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  try { localStorage.removeItem('cuckoo-results'); } catch (_) {}
}

module.exports = {
  startTimer,
  finishTimer,
  findLatestAIMessage,
  isAIMessage,
  startWatch,
  clearStorage,
  resetForTests,
  extractAffectedFiles,
  extractFileEntries,
  extractFilesFromCode,
  renderMetaPanel,
  shortFileName,
  normalizeFileEntry,
  setEnabled,
  isProducedEnabled,
  setProducedFiles,
  recordExecutionResults,
  recordSingleToolCall,
  getMessageKey,
};
