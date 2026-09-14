/**
 * Индикатор мета-информации под ответом AI:
 *   ⏱ 9.2s · ~308 tok · Produced # file.txt
 *
 * Время измеряется локально (от появления нового AI-сообщения до его завершения).
 * Токены — грубая оценка: длина текста / 4.
 * Produced — список файлов, затронутых за этот ответ (write/edit).
 * Данные сохраняются в localStorage (переживают Ctrl+R).
 */

const META_CLASS = 'cuckoo-response-meta';
const ATTR_MARKED = 'data-cuckoo-meta-marked';
const STORAGE_KEY = 'cuckoo-response-meta';

let t = (k) => k;
try { ({ t } = require('../i18n/i18n')); } catch (_) {}

// Активные замеры: messageEl -> { start }
const activeTimers = new WeakMap();

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
 * Извлечь список файлов, затронутых в этом ответе.
 * Ищет вызовы write/edit/writeFile/editFile/deleteFile в <pre> блоках.
 * Поддерживает как JS API `await write("path", ...)` так и JSON `file_path`.
 * @param {Element} messageEl
 * @returns {string[]}
 */
function extractAffectedFiles(messageEl) {
  const files = [];
  const seen = new Set();
  try {
    const pres = messageEl.querySelectorAll('pre');
    for (const pre of pres) {
      const code = pre.textContent || '';
      if (!code) continue;
      // JS style: await write("..."), await edit("...", ...), etc.
      const re1 = /await\s+(write|edit|writeFile|editFile|deleteFile)\s*\(\s*["'`]([^"'`]+)["'`]/g;
      let m;
      while ((m = re1.exec(code)) !== null) {
        const raw = (m[2] || '').trim();
        if (!raw || raw.length > 500 || raw.includes('...')) continue;
        if (seen.has(raw)) continue;
        seen.add(raw);
        files.push(raw);
      }
      // JSON style fallback: "file_path": "..." - только если в блоке есть write/edit
      if (/await\s+(write|edit|writeFile|editFile|deleteFile)\s*\(/.test(code)) {
        const re2 = /["']file_path["']\s*:\s*["'`]([^"'`]+)["'`]/g;
        while ((m = re2.exec(code)) !== null) {
          const raw = (m[1] || '').trim();
          if (!raw || raw.length > 500 || raw.includes('...')) continue;
          if (seen.has(raw)) continue;
          seen.add(raw);
          files.push(raw);
        }
      }
    }
    // Также проверяем inline <code> с путями? Не нужно — pre покрывает cuckoo блоки.
    // Fallback: если <pre> ещё не отрендерился, ищем прямо в тексте сообщения
    if (files.length === 0) {
      try {
        const md = messageEl.querySelector('.ds-markdown');
        const text = md ? (md.textContent || '') : (messageEl.textContent || '');
        if (text) {
          const reText = /await\s+(write|edit|writeFile|editFile|deleteFile)\s*\(\s*["'`]([^"'`]+)["'`]/g;
          let m;
          while ((m = reText.exec(text)) !== null) {
            const raw = (m[2] || '').trim();
            if (!raw || raw.length > 500 || raw.includes('...')) continue;
            if (seen.has(raw)) continue;
            seen.add(raw);
            files.push(raw);
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
            const raw = (m[2] || '').trim();
            if (!raw || raw.length > 500 || raw.includes('...')) continue;
            if (seen.has(raw)) continue;
            seen.add(raw);
            files.push(raw);
          }
          while ((m = reJson2.exec(text)) !== null) {
            const raw = (m[1] || '').trim();
            if (!raw || raw.length > 500 || raw.includes('...')) continue;
            if (seen.has(raw)) continue;
            seen.add(raw);
            files.push(raw);
          }
          // Если всё ещё пусто, но есть file_path рядом с write/edit — берём любые file_path
          if (files.length === 0) {
            const reAny = /"file_path"\s*:\s*"([^"]+)"/g;
            while ((m = reAny.exec(text)) !== null) {
              const raw = (m[1] || '').trim();
              if (!raw || raw.length > 500 || raw.includes('...')) continue;
              if (seen.has(raw)) continue;
              // Проверяем что рядом есть маркер записи
              const ctx = text.slice(Math.max(0, m.index - 200), m.index + 200);
              if (!/(write|edit|file_write|file_edit)/.test(ctx)) continue;
              seen.add(raw);
              files.push(raw);
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}
  // Ограничиваем количество, чтобы UI не разъезжался
  return files.slice(0, 20);
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

  const safeFiles = Array.isArray(files) ? files.slice(0, 20) : [];
  const hasFiles = safeFiles.length > 0;

  const meta = document.createElement('div');
  meta.className = META_CLASS;
  // i18n с фолбэком на русский, если t() недоступен
  let timeTitle = 'Время ответа';
  let tokensTitle = 'Оценка количества токенов (chars / 4)';
  let producedLabel = 'Produced';
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
    for (const f of safeFiles) {
      const short = shortFileName(f);
      html += '<span class="cuckoo-produced-chip" data-path="' + escapeHtml(f) + '" title="' + escapeHtml(f) + '" tabindex="0" role="button">' +
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
              const state = require('./state');
              projectDir = state.currentProjectDir || null;
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
  const tokensEstimate = Math.max(0, Math.round(text.length / 4));
  const seconds = (elapsedMs / 1000).toFixed(1);
  const files = extractAffectedFiles(messageEl);

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
      // Поддержка старого формата без files или когда files пустой, но в DOM уже есть блоки
      let files = Array.isArray(rec.files) ? rec.files : null;
      let fresh = null;
      try { fresh = extractAffectedFiles(el); } catch (_) { fresh = []; }
      if (!files || files.length === 0) {
        if (fresh && fresh.length > 0) {
          files = fresh;
          rec.files = fresh;
          try { writeMetaStore(store); } catch (_) {}
        } else {
          files = fresh || [];
        }
      } else if (fresh && fresh.length > files.length) {
        // В DOM появилось больше файлов, чем было сохранено (поздний рендер) — обновляем
        files = fresh;
        rec.files = fresh;
        try { writeMetaStore(store); } catch (_) {}
      }
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

module.exports = { startTimer, finishTimer, findLatestAIMessage, isAIMessage, startWatch, clearStorage, extractAffectedFiles, renderMetaPanel };
