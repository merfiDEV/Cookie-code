/**
 * Декорация блоков \`\`\`cuckoo ... \`\`\` в AI-ответах DeepSeek.
 * Оборачивает код в раскрывающийся блок в стиле dsh-web-dev:
 *   ▼  {Иконка}  {Название инструмента}   [файл или краткая сводка]
 *
 * Работает поверх DOM DeepSeek (реплика .ds-message > .ds-markdown).
 * При перерисовке React observer вызывает decorate() повторно — идемпотентно.
 */

const BLOCK_CLASS = 'cuckoo-tool-block';
const WRAPPED_ATTR = 'data-cuckoo-tool-wrapped';

/**
 * SVG-иконки в стиле Lucide/Feather (16×16, stroke=currentColor).
 */
const ICONS = {
  read:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
  write:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  edit:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  glob:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  grep:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  bash:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  pwsh:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="6 8 10 12 6 16"/><line x1="12" y1="16" x2="16" y2="16"/></svg>',
  delete:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  todo:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  fetch:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  mcp:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/></svg>',
  browser:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
  skill:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 14.7 7.1 17.2l.9-5.5-4-3.9 5.5-.8z"/></svg>',
  mysql:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
  citytime: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  js:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
};

/**
 * Определение инструмента по первой строке JS-кода.
 * Возвращает { id, label, icon, file } — что показать в заголовке.
 */
function detectTool(code) {
  const firstLine = (code.split('\n').find(l => l.trim()) || '').trim();

  // Пытаемся найти самую частую функцию из набора инструментов
  const patterns = [
    { id: 'read',   re: /await\s+read\s*\(|await\s+readLines\s*\(/,  label: 'Read' },
    { id: 'write',  re: /await\s+write\s*\(/,                            label: 'Write' },
    { id: 'edit',   re: /await\s+edit\s*\(/,                             label: 'Edit' },
    { id: 'glob',   re: /await\s+glob\s*\(/,                             label: 'Glob' },
    { id: 'grep',   re: /await\s+grep\s*\(/,                             label: 'Grep' },
    { id: 'bash',   re: /await\s+bash\s*\(/,                             label: 'Bash' },
    { id: 'pwsh',   re: /await\s+pwsh\s*\(/,                             label: 'PowerShell' },
    { id: 'delete', re: /await\s+deleteFile\s*\(/,                       label: 'Delete' },
    { id: 'todo',   re: /await\s+todoWrite\s*\(/,                        label: 'Todo' },
    { id: 'fetch',  re: /await\s+webFetch\s*\(/,                         label: 'WebFetch' },
    { id: 'citytime', re: /await\s+cityTime\s*\(/,                      label: 'CityTime' },
    { id: 'mcp',    re: /await\s+mcpCall\s*\(/,                          label: 'MCP' },
    { id: 'browser',re: /await\s+(openBrowserWindow|injectJS)\s*\(/,     label: 'Browser' },
    { id: 'skill',  re: /await\s+(skillList|skillLoad|skillExecute)\s*\(/, label: 'Skill' },
    { id: 'mysql',  re: /await\s+mysql\s*\(/,                            label: 'MySQL' },
  ];
  for (const p of patterns) {
    if (p.re.test(code)) {
      return { id: p.id, label: p.label, icon: ICONS[p.id] || ICONS.js, file: extractFileHint(code, p.id) };
    }
  }
  return { id: 'js', label: 'JS', icon: ICONS.js, file: '' };
}

/**
 * Краткая подсказка «файла» для заголовка (первый строковый аргумент).
 */
function extractFileHint(code, toolId) {
  try {
    const m = code.match(/await\s+\w+\s*\(\s*["'\`]([^"'\`]+)["'\`]/);
    if (m && m[1]) {
      const s = m[1];
      // Обрезаем длинные пути — оставляем последние 2 сегмента
      const parts = s.split(/[\\/]/);
      if (parts.length > 2) return parts.slice(-2).join('/');
      return s;
    }
  } catch (_) {}
  return '';
}

/**
 * Обернуть все ещё не обработанные .md-code-block (язык cuckoo) в наш контейнер.
 * @param {HTMLElement} scope — корень реплики (.ds-markdown)
 */
function decorate(scope) {
  if (!scope) return;
  const codeBlocks = scope.querySelectorAll('.md-code-block');
  codeBlocks.forEach((block) => {
    if (block.getAttribute(WRAPPED_ATTR) === '1') return;
    // Определяем язык
    let lang = block.getAttribute('data-language') || '';
    if (!lang) {
      const banner = block.querySelector('.md-code-block-banner');
      if (banner) {
        const spans = banner.querySelectorAll('span');
        for (const s of spans) {
          if (s.closest('button')) continue;
          const t = (s.textContent || '').trim().toLowerCase();
          if (/^[a-z]+$/.test(t)) { lang = t; break; }
        }
      }
    }

    // Извлекаем код
    const pre = block.querySelector('pre code') || block.querySelector('pre');
    const code = pre ? (pre.textContent || '') : '';
    if (!code.trim()) return;
    // Решаем, «наш» ли это блок:
    // - язык в баннере `cuckoo` (некоторые рендереры оставляют как есть), ИЛИ
    // - язык `js`/`javascript` и в коде есть вызовы tool-функций (await read/write/edit/...).
    // DeepSeek показывает `cuckoo` как `js`, потому что языка cuckoo у него нет.
    const TOOL_CALL_RE = /await\s+(read|readLines|write|edit|glob|grep|bash|pwsh|todoWrite|deleteFile|webFetch|cityTime|mcpCall|openBrowserWindow|injectJS|mysql|skillList|skillLoad|skillExecute)\s*\(/;
    const hasToolCall = TOOL_CALL_RE.test(code);
    const langIsCuckoo = lang === 'cuckoo';
    const langIsJs = lang === 'js' || lang === 'javascript' || !lang;
    if (!langIsCuckoo && !(langIsJs && hasToolCall)) return;

    // Собираем контейнер
    const meta = detectTool(code);
    const wrapper = document.createElement('div');
    wrapper.className = BLOCK_CLASS;
    wrapper.setAttribute('data-tool-id', meta.id);
    wrapper.setAttribute('data-expanded', 'false');

    const header = document.createElement('div');
    header.className = 'cuckoo-tool-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.innerHTML =
      '<span class="cuckoo-tool-chevron">▸</span>' +
      '<span class="cuckoo-tool-icon">' + meta.icon + '</span>' +
      '<span class="cuckoo-tool-label">' + escapeHtml(meta.label) + '</span>' +
      (meta.file ? '<span class="cuckoo-tool-sep">·</span><span class="cuckoo-tool-file">' + escapeHtml(meta.file) + '</span>' : '');

    // Скрываем встроенный баннер DeepSeek (копировать/скачать)
    const nativeBanner = block.querySelector('.md-code-block-banner-wrap');
    if (nativeBanner) nativeBanner.style.display = 'none';

    // Переносим блок в обёртку
    block.parentNode.insertBefore(wrapper, block);
    wrapper.appendChild(header);
    wrapper.appendChild(block);
    block.setAttribute(WRAPPED_ATTR, '1');
    block.style.display = 'none'; // по умолчанию свёрнуто

    // Обработчик клика
    header.addEventListener('click', () => {
      const expanded = wrapper.getAttribute('data-expanded') === 'true';
      wrapper.setAttribute('data-expanded', expanded ? 'false' : 'true');
      block.style.display = expanded ? 'none' : '';
      const chev = header.querySelector('.cuckoo-tool-chevron');
      if (chev) chev.textContent = expanded ? '▸' : '▾';
    });
  });

  // Если есть отложенные ошибки — применить их к свежеобёрнутым блокам.
  try { applyPendingErrors(); } catch (_) {}
  // Если есть отложенные результаты — прикрепить их к свежеобёрнутым блокам
  // (инлайн-результат внутри карточки, см. tool-result-inline.js).
  try { require('./tool-result-inline').applyPendingResults(); } catch (_) {}
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Запустить собственный MutationObserver, который:
 * - следит за появлением новых .md-code-block в чате,
 * - автоматически оборачивает те, что содержат вызовы tool-функций.
 * Нужен потому, что основной observer.js вызывает decorate() однократно
 * и может «промахнуться» при перерисовке React.
 */
let watchStarted = false;
function startWatch() {
  if (watchStarted) return;
  watchStarted = true;
  window.__cuckooWatchStarted = true;

  // Debounce-обёртка: не чаще раза в 400ms, чтобы не дёргать DOM при каждом mutation.
  // Hot-path обрабатывает только последний .ds-markdown — стримится всегда снизу.
  // Старые ответы декорируются один раз при первичном прогоне (runAll на старте ниже).
  let debounceTimer = null;
  let firstRunDone = false;
  const runAll = () => {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      try {
        if (!firstRunDone) {
          // Первый прогон — по всей истории (после reload нужно декорировать старое).
          firstRunDone = true;
          const scopes = document.querySelectorAll('.ds-markdown');
          scopes.forEach((s) => { try { decorate(s); } catch (_) {} });
          return;
        }
        // Дальше — все ответы, в которых есть ещё не обёрнутые tool-блоки.
        // (DeepSeek лениво догружает историю, поэтому «только последний»
        //  оставлял старые сообщения сырыми.)
        const scopes = document.querySelectorAll('.ds-markdown');
        scopes.forEach((s) => {
          const hasRaw = s.querySelector('.md-code-block:not([data-cuckoo-tool-wrapped="1"])');
          if (hasRaw) { try { decorate(s); } catch (_) {} }
        });
      } catch (_) {}
    }, 400);
  };

  if (document.body) {
    const mo = new MutationObserver(runAll);
    mo.observe(document.body, { childList: true, subtree: true });
    runAll();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      const mo = new MutationObserver(runAll);
      mo.observe(document.body, { childList: true, subtree: true });
      runAll();
    }, { once: true });
  }

  console.log('[Cookie Code] tool-render watch started (debounced mutation)');
}

// Очередь ошибок, которые нужно «навесить» на блоки, когда они появятся в DOM.
// Ключ — нормализованный префикс кода, значение — текст ошибки.
const pendingErrors = new Map();

function markToolBlockError(code, errorText) {
  if (!code) return;
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const key = norm(code).slice(0, 60);
  if (!key) return;

  // Запоминаем: как только блок с таким кодом появится — пометим.
  pendingErrors.set(key, String(errorText || '执行失败'));

  // Сохраняем в localStorage — переживёт Ctrl+R (перезагрузку страницы).
  try {
    const raw = localStorage.getItem('cuckoo-errors') || '{}';
    const store = JSON.parse(raw);
    store[key] = String(errorText || '执行失败');
    localStorage.setItem('cuckoo-errors', JSON.stringify(store));
  } catch (_) {}

  console.log('[Cookie Code] tool-render: ошибка поставлена в очередь:', key, '→', String(errorText || '').slice(0, 80));

  // И пробуем применить прямо сейчас (вдруг блок уже в DOM).
  applyPendingErrors();
}

/**
 * Применить все накопленные ошибки к текущим tool-блокам.
 * Вызывается при каждой обёртке (decorate) и через polling.
 */
function applyPendingErrors() {
  // Подтягиваем сохранённые из localStorage (после перезагрузки страницы).
  try {
    const raw = localStorage.getItem('cuckoo-errors');
    if (raw) {
      const store = JSON.parse(raw);
      for (const k of Object.keys(store)) {
        if (!pendingErrors.has(k)) pendingErrors.set(k, store[k]);
      }
    }
  } catch (_) {}

  if (pendingErrors.size === 0) return;
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const blocks = document.querySelectorAll('.' + BLOCK_CLASS);
  for (const block of blocks) {
    const pre = block.querySelector('pre');
    if (!pre) continue;
    const blockCode = norm(pre.textContent);
    for (const [key, errText] of pendingErrors) {
      if (!blockCode.includes(key)) continue;
      // Помечаем
      block.classList.add('cuckoo-tool-error');
      block.setAttribute('data-error', '1');
      const header = block.querySelector('.cuckoo-tool-header');
      if (header && !header.querySelector('.cuckoo-tool-error-icon')) {
        const errIcon = document.createElement('span');
        errIcon.className = 'cuckoo-tool-error-icon';
        errIcon.textContent = '⚠';
        errIcon.title = errText;
        header.appendChild(errIcon);
      }
      block.setAttribute('data-expanded', 'true');
      const md = block.querySelector('.md-code-block');
      if (md) md.style.display = 'block';
      const chev = header && header.querySelector('.cuckoo-tool-chevron');
      if (chev) chev.textContent = '▾';
      if (!block.querySelector('.cuckoo-tool-error-msg')) {
        const errBlock = document.createElement('div');
        errBlock.className = 'cuckoo-tool-error-msg';
        errBlock.textContent = errText;
        block.appendChild(errBlock);
      }
      pendingErrors.delete(key); // применили — больше не нужно
      break;
    }
  }
}

module.exports = { decorate, detectTool, startWatch, markToolBlockError, applyPendingErrors };
