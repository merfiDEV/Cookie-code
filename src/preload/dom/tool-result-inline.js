/**
 * Инлайн-отображение результатов tool-вызовов внутри карточек инструментов.
 *
 * Результат выполнения ```cuckoo-блока больше не нужно искать в отдельных
 * сообщениях чата: он прикрепляется ПРЯМО в карточку вызова (.cuckoo-tool-block):
 *
 *   ▾  Bash · dir /b
 *      [код вызова]
 *      ─────────────────────
 *      ✓ РЕЗУЛЬТАТ
 *      [сырой вывод инструмента]   ← прокручиваемый <pre>
 *
 * Секция результата видна, когда карточка развёрнута (data-expanded="true");
 * в свёрнутом состоянии остаётся скрытой. Для ошибок/отказов карточка
 * разворачивается автоматически (как и прежний механизм markToolBlockError).
 *
 * Сопоставление «блок ↔ результат» — по нормализованному префиксу кода
 * (тот же подход, что в markToolBlockError). Результаты сохраняются в
 * localStorage (cuckoo-results), поэтому после перезагрузки страницы
 * секции восстанавливаются при следующем decorate().
 *
 * Сообщение для AI (【JS 执行结果汇总】…) как и прежде уходит в чат и
 * скрывается stealth-режимом — пользователь видит результат только здесь.
 */
const { t } = require('../i18n/i18n');

const STYLE_ID = 'cuckoo-tool-result-style';
const RESULT_CLASS = 'cuckoo-tool-result';
const STORE_KEY = 'cuckoo-results';
const MAX_STORED = 40;        // максимум записей в localStorage
const MAX_STORED_LEN = 4000;  // обрезка вывода при сохранении (символы)

/**
 * Очередь результатов, ожидающих появления своей карточки в DOM.
 * Ключ — нормализованный префикс кода (первые 60 символов).
 */
const pendingResults = new Map();

function normCode(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function codeKey(code) {
  return normCode(code).slice(0, 60);
}

/**
 * Статус результата: success | error | denied.
 * @param {{success?:boolean, denied?:boolean}} result
 * @returns {string}
 */
function statusOf(result) {
  if (result && result.denied === true) return 'denied';
  if (result && result.success) return 'success';
  return 'error';
}

/**
 * Сырой вывод результата (без служебных пометок — только сам результат).
 * @param {{success?:boolean, output?:string, data?:*, error?:string}} result
 * @returns {string}
 */
function outputOf(result) {
  if (!result) return '';
  if (result.success) {
    if (typeof result.output === 'string') return result.output;
    const data = result.data !== undefined ? result.data : result.output;
    if (typeof data === 'string') return data;
    try { return JSON.stringify(data, null, 2); } catch (_) { return String(data); }
  }
  return String(result.error || '');
}

function statusIcon(status) {
  if (status === 'success') return '✓';
  if (status === 'denied') return '⛔';
  return '⚠';
}

function statusLabel(status) {
  if (status === 'success') return t('toolResult.success');
  if (status === 'denied') return t('toolResult.denied');
  return t('toolResult.error');
}

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    // результат виден только в развёрнутой карточке
    '.' + RESULT_CLASS + ' { margin-top: 8px; border-top: 1px solid rgba(128,128,160,.25); padding-top: 6px; }' +
    '.cuckoo-tool-block[data-expanded="false"] .cuckoo-tool-result { display: none !important; }' +
    '.cuckoo-tool-result-bar { font-size: 11px; font-weight: 600; letter-spacing: .4px; text-transform: uppercase; opacity: .9; margin-bottom: 4px; }' +
    '.cuckoo-tool-result[data-status="success"] .cuckoo-tool-result-bar { color: #34d399; }' +
    '.cuckoo-tool-result[data-status="error"] .cuckoo-tool-result-bar { color: #f87171; }' +
    '.cuckoo-tool-result[data-status="denied"] .cuckoo-tool-result-bar { color: #fbbf24; }' +
    '.cuckoo-tool-result-content { margin: 0; padding: 8px 10px; background: rgba(128,128,160,.08); ' +
    'border: 1px solid rgba(128,128,160,.18); border-radius: 8px; ' +
    'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; ' +
    'white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow: auto; color: inherit; }';
  document.head.appendChild(style);
}

/**
 * Сохранить результат в localStorage (переживает перезагрузку страницы).
 * @param {string} key
 * @param {string} status
 * @param {string} output
 */
function persistResult(key, status, output) {
  try {
    const raw = localStorage.getItem(STORE_KEY) || '[]';
    const arr = JSON.parse(raw);
    const list = Array.isArray(arr) ? arr.filter((x) => x && x.k !== key) : [];
    list.push({ k: key, s: status, o: String(output || '').slice(0, MAX_STORED_LEN) });
    while (list.length > MAX_STORED) list.shift();
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch (_) { /* приватный режим/битый JSON — не критично */ }
}

function loadStoredResults() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (item && item.k && !pendingResults.has(item.k)) {
        pendingResults.set(item.k, { status: item.s || 'success', output: item.o || '' });
      }
    }
  } catch (_) { /* битый JSON — пропускаем */ }
}

/**
 * Встроить секцию результата в карточку.
 * @param {Element} block — .cuckoo-tool-block
 * @param {{status:string, output:string}} res
 */
function injectResult(block, res) {
  const section = document.createElement('div');
  section.className = RESULT_CLASS;
  section.setAttribute('data-status', res.status);

  const bar = document.createElement('div');
  bar.className = 'cuckoo-tool-result-bar';
  bar.textContent = statusIcon(res.status) + ' ' + statusLabel(res.status);

  const pre = document.createElement('pre');
  pre.className = 'cuckoo-tool-result-content';
  pre.textContent = res.output || '—';

  section.appendChild(bar);
  section.appendChild(pre);

  // Прежний механизм ошибок добавляет .cuckoo-tool-error-msg — убираем,
  // чтобы текст ошибки не дублировался (иконку ⚠ в заголовке оставляем).
  const legacy = block.querySelector('.cuckoo-tool-error-msg');
  if (legacy && legacy.parentElement) legacy.parentElement.removeChild(legacy);

  block.appendChild(section);

  if (res.status !== 'success') {
    // ошибка/отказ — разворачиваем карточку, как делает markToolBlockError
    block.setAttribute('data-expanded', 'true');
    const md = block.querySelector('.md-code-block');
    if (md) md.style.display = 'block';
    const chev = block.querySelector('.cuckoo-tool-chevron');
    if (chev) chev.textContent = '▾';
  }
}

/**
 * Применить все накопленные результаты к текущим карточкам.
 * Вызывается из markToolBlockResult и после каждой decorate().
 */
function applyPendingResults() {
  if (typeof document === 'undefined') return;
  loadStoredResults();
  if (pendingResults.size === 0) return;
  ensureStyles();

  const blocks = document.querySelectorAll('.cuckoo-tool-block');
  for (const block of blocks) {
    if (block.getAttribute && block.getAttribute('data-has-result') === '1') continue;
    const pre = block.querySelector('pre');
    if (!pre) continue;
    const blockCode = normCode(pre.textContent);
    if (!blockCode) continue;
    for (const [key, res] of pendingResults) {
      if (!blockCode.includes(key)) continue;
      injectResult(block, res);
      if (block.setAttribute) block.setAttribute('data-has-result', '1');
      pendingResults.delete(key);
      break;
    }
  }
}

/**
 * Запомнить результат выполнения и прикрепить его к карточке вызова.
 * @param {string} code — код ```cuckoo-блока (как в handleJsToolScript)
 * @param {{success?:boolean, denied?:boolean, output?:string, error?:string}} result
 * @returns {boolean}
 */
function markToolBlockResult(code, result) {
  const key = codeKey(code);
  if (!key) return false;
  pendingResults.set(key, { status: statusOf(result), output: outputOf(result) });
  persistResult(key, statusOf(result), outputOf(result));
  try { applyPendingResults(); } catch (_) {}
  return true;
}

/**
 * Сброс накопленных очередей (для тестов).
 */
function resetForTests() {
  pendingResults.clear();
}

module.exports = {
  statusOf,
  outputOf,
  markToolBlockResult,
  applyPendingResults,
  resetForTests,
  RESULT_CLASS,
  STORE_KEY,
  MAX_STORED_LEN,
};
