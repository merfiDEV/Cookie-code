/**
 * Стилизация абсолютных файловых путей в ответах AI как «чипов» с иконкой.
 *
 * DeepSeek рендерит `C:\Users\...\file.txt` как обычный inline <code>
 * (фон rgb(44,44,46), radius 6px). Модуль:
 *   1. находит <code> внутри .ds-markdown-paragraph (ответы AI, не пользователя);
 *   2. проверяет, что текст — абсолютный путь Windows (C:\..., D:\...) или UNC \\server\share\...;
 *   3. заменяет содержимое на <span class="cuckoo-file-chip"> с SVG-иконкой и путём;
 *   4. вешает click → window.electronAPI.openPath(path) — открыть в системе;
 *   5. держит MutationObserver для новых ответов.
 *
 * Все операции с DOM обёрнуты в safe(): при изменении вёрстки DeepSeek
 * модуль просто пропускает шаг и пишет предупреждение в консоль.
 */

const { safe } = require('./safe');

/** Метка — «элемент уже превращён в чип». */
const PATCHED_ATTR = 'data-cuckoo-file-chip';

/** Класс чипа. */
const CHIP_CLASS = 'cuckoo-file-chip';

/** Стили чипа. Инжектятся один раз. */
const STYLE_ID = 'cuckoo-file-chip-style';
const STYLE_CSS =
  '.' + CHIP_CLASS + ' {' +
    'display: inline-flex; align-items: center; gap: 4px;' +
    'padding: 1px 6px 1px 4px;' +
    'background: rgb(44, 44, 46);' +
    'border: 1px solid rgba(128,128,160,.18);' +
    'border-radius: 6px;' +
    'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;' +
    'font-size: 13px; line-height: 20px;' +
    'color: inherit; cursor: pointer;' +
    'transition: background .12s ease, border-color .12s ease;' +
    'vertical-align: baseline;' +
  '}' +
  '.' + CHIP_CLASS + ':hover {' +
    'background: rgba(96, 165, 250, .18);' +
    'border-color: rgba(96, 165, 250, .45);' +
  '}' +
  '.' + CHIP_CLASS + ' svg {' +
    'width: 12px; height: 12px; flex: 0 0 12px;' +
    'stroke: currentColor; fill: none;' +
    'stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;' +
    'opacity: .75;' +
  '}' +
  '.' + CHIP_CLASS + ':hover svg { opacity: 1; }' +
  '.' + CHIP_CLASS + ' .' + CHIP_CLASS + '__path {' +
    'white-space: nowrap;' +
  '}';

/** SVG-иконка «файл». */
const FILE_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
  '</svg>';

/**
 * Проверка: текст — путь к файлу, пригодный для чипа.
 *
 * Поддерживаем:
 *   1. Абсолютные Windows: C:\folder\file.ext, D:\a\b.txt
 *   2. UNC: \\server\share\folder\file.ext
 *   3. Относительные: src/main/ipc.js, ./file.txt, ../dir/a.md
 *      (разрешаются в абсолютный путь через state.currentProjectDir при клике)
 *
 * Отсеиваем:
 *   - плейсхолдеры «...»;
 *   - корни диска без файла (C:\, D:\folder\);
 *   - версии типа «1.2.3» и просто числа (нет слеша);
 *   - URL (http://, https://);
 *   - слишком короткие/длинные строки;
 *   - расширение длиннее 12 символов.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isFilePath(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 5 || t.length > 500) return false;

  // Плейсхолдер «...» — не открываем.
  if (t.includes('...')) return false;

  // URL / email — не файл.
  if (/^[a-z]+:\/\//i.test(t)) return false;
  if (t.includes('@') && !t.startsWith('.') && !t.startsWith('/') && !/[\\/]/.test(t.split('@')[0])) {
    // Похоже на email/ссылку — не считаем
    // Но если есть слеш до @ — маловероятно. Оставим простую эвристику.
  }
  if (/^[^\\/]+@[^\\/]+\.[a-z]{2,}$/i.test(t)) return false;

  // UNC: \\server\share\folder\file.ext
  if (/^\\\\[^\\]+\\[^\\]+\\[^\\]+\\[^\\]+\\.[^\\]{1,50}$/.test(t)) {
    return true;
  }

  // Абсолютный Windows: C:\folder\file.ext
  if (/^[A-Za-z]:[\\/]/.test(t)) {
    const norm = t.replace(/\\/g, '/');
    const parts = norm.split('/').filter(Boolean);
    // диск + минимум 2 сегмента (папка + файл)
    if (parts.length < 3) return false;
    const last = parts[parts.length - 1];
    return /^[^\\/:*?"<>|]+\.[A-Za-z0-9]{1,12}$/.test(last);
  }

  // Относительный путь: содержит / или \, минимум один сегмент, последний — файл с расширением
  if (!/[\\/]/.test(t)) return false;
  // Исключим строки, начинающиеся с одиночного слеша (не Windows-путь)
  const cleaned = t.replace(/^\.\//, '').replace(/^\.\.\//, '');
  const norm = cleaned.replace(/\\/g, '/');
  const parts = norm.split('/').filter(Boolean);
  if (parts.length < 2) return false; // относительный должен быть «папка/файл»
  const last = parts[parts.length - 1];
  if (!/^[^\\/:*?"<>|]+\.[A-Za-z0-9]{1,12}$/.test(last)) return false;
  // Все сегменты не должны быть «..» — такие сами по себе не файл
  return true;
}

/** Обратная совместимость: прежнее имя. */
const isAbsoluteWindowsPath = isFilePath;

/**
 * Привести все прямые слэши к обратным (Windows-вид).
 * @param {string} p
 * @returns {string}
 */
function normalizePath(p) {
  if (!p) return p;
  return p.replace(/\//g, '\\');
}

/**
 * Разрешить путь в абсолютный.
 * Если путь уже абсолютный — вернуть как есть (нормализованным).
 * Если относительный — склеить с state.currentProjectDir.
 *
 * @param {string} p исходный путь
 * @returns {{ abs: string|null, error?: string }}
 */
function resolveToAbsolute(p) {
  const norm = normalizePath(p);
  // Уже абсолютный?
  if (/^[A-Za-z]:[\\/]/.test(norm)) return { abs: norm };
  if (/^\\\\/.test(norm)) return { abs: norm }; // UNC

  // Относительный — нужен projectDir
  let projectDir = null;
  try {
    const state = require('./state');
    projectDir = state.currentProjectDir || null;
  } catch (_) {}
  if (!projectDir) {
    return { abs: null, error: 'Не выбран проект (currentProjectDir пуст) — нельзя разрешить относительный путь' };
  }

  // Уберём .\ и ..\ при склейке — просто соединим
  const sep = projectDir.includes('\\') ? '\\' : '/';
  const rel = norm.replace(/^\.\//, '').replace(/^\.\.\//, '');
  const abs = projectDir.replace(/[\\/]+$/, '') + sep + rel.replace(/^[\\/]+/, '');
  return { abs };
}

/**
 * Превратить <code> с абсолютным путём в чип.
 * Идемпотентно.
 * @param {Element} codeEl
 */
function patchCodeEl(codeEl) {
  if (!enabled) return;
  if (!codeEl || codeEl.getAttribute(PATCHED_ATTR) === '1') return;
  const text = (codeEl.textContent || '').trim();
  if (!isFilePath(text)) return;

  const normPath = normalizePath(text);

  // Строим чип
  const chip = document.createElement('span');
  chip.className = CHIP_CLASS;
  chip.setAttribute('data-path', normPath);
  chip.setAttribute('title', normPath);
  chip.setAttribute('role', 'button');
  chip.setAttribute('tabindex', '0');
  chip.innerHTML = FILE_ICON_SVG + '<span class="' + CHIP_CLASS + '__path">' + escapeHtml(text) + '</span>';

  // Клик — открыть в системе
  const open = (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (!window.electronAPI || typeof window.electronAPI.openPath !== 'function') {
        console.warn('[Cookie Code] open-path: electronAPI.openPath не доступен (обновите preload)');
        return;
      }
      // Резолвим относительный путь через projectDir
      const resolved = resolveToAbsolute(normPath);
      if (!resolved.abs) {
        console.warn('[Cookie Code] open-path: ' + (resolved.error || 'не удалось разрешить путь'));
        return;
      }
      window.electronAPI.openPath(resolved.abs).then((res) => {
        if (res && !res.success) {
          console.warn('[Cookie Code] open-path: ' + (res.error || 'не удалось открыть'));
        }
      }).catch((err) => {
        console.warn('[Cookie Code] open-path: ' + err.message);
      });
    } catch (err) {
      console.warn('[Cookie Code] open-path: ' + err.message);
    }
  };
  chip.addEventListener('click', open);
  chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });

  // Заменяем содержимое <code> на чип
  codeEl.setAttribute(PATCHED_ATTR, '1');
  codeEl.textContent = '';
  codeEl.appendChild(chip);
  codeEl.style.background = 'transparent';
  codeEl.style.padding = '0';
  codeEl.style.border = 'none';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Инжект стилей один раз. */
function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_CSS;
  document.head.appendChild(style);
}

/**
 * Обойти все <code> в ответах AI (.ds-markdown) и превратить абсолютные пути в чипы.
 * @param {Element|Document} [root]
 */
function scanAll(root) {
  if (!enabled) return;
  safe('file-chip.scanAll', () => {
    const doc = root || document;
    const scope = doc.querySelectorAll ? doc : document;
    const codes = scope.querySelectorAll('.ds-markdown code, .ds-markdown-paragraph code');
    for (const code of codes) {
      // Пропускаем код-блоки (многострочные): только inline <code> без <pre>-родителя.
      if (code.closest('pre')) continue;
      // Пропускаем пользовательские сообщения
      if (isInsideUserMessage(code)) continue;
      patchCodeEl(code);
    }
  });
}

/**
 * Проверка, что узел — внутри пользовательского сообщения.
 * @param {Element} node
 * @returns {boolean}
 */
function isInsideUserMessage(node) {
  try {
    const { getProviderByUrl } = require('../../providers');
    const provider = getProviderByUrl(window.location.href);
    if (provider && typeof provider.isUserMessage === 'function') {
      return provider.isUserMessage(node);
    }
  } catch (_) {}
  return false;
}

let started = false;
let enabled = true;

/**
 * Включить/выключить фичу. При выключении — снять все чипы (вернуть <code>).
 * @param {boolean} on
 */
function setEnabled(on) {
  enabled = on !== false;
  if (!enabled) {
    safe('file-chip.setEnabled.remove', () => removeAllChips());
  } else {
    // Включили — применим чипы к уже существующим <code>.
    safe('file-chip.setEnabled.rescan', () => scanAll());
  }
}

/** Снять все чипы: вернуть оригинальный текст в <code>. */
function removeAllChips() {
  const chips = document.querySelectorAll('.' + CHIP_CLASS);
  for (const chip of chips) {
    const code = chip.closest('code');
    const text = chip.getAttribute('data-path') || chip.textContent || '';
    if (code) {
      code.removeAttribute(PATCHED_ATTR);
      code.textContent = text;
      code.style.background = '';
      code.style.padding = '';
      code.style.border = '';
    } else {
      // Чип не в <code> — просто подменяем на текстовый узел
      chip.replaceWith(document.createTextNode(text));
    }
  }
}

/**
 * Запустить наблюдение за новыми ответами AI.
 */
function startWatch() {
  if (started) return;
  started = true;

  safe('file-chip.ensureStyles', () => ensureStyles());

  // Стартовый прогон (вдруг уже есть отрендеренные ответы)
  scanAll();

  // MutationObserver на новые <code>
  safe('file-chip.observe', () => {
    const mo = new MutationObserver((mutations) => {
      if (!enabled) return;
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'CODE') {
            patchCodeEl(n);
            continue;
          }
          if (n.querySelectorAll) {
            for (const code of n.querySelectorAll('code')) {
              if (code.closest('pre')) continue;
              patchCodeEl(code);
            }
          }
        }
      }
    });
    const target = document.body || document.documentElement;
    if (target) mo.observe(target, { childList: true, subtree: true });
  });

  // Периодический доскан (на случай поздних рендеров и React-перерисовок)
  setInterval(() => scanAll(), 3000);

  console.log('[Cookie Code] file-chip: наблюдение запущено');
}

module.exports = {
  startWatch,
  scanAll,
  patchCodeEl,
  setEnabled,
  removeAllChips,
  isFilePath,
  isAbsoluteWindowsPath,
  normalizePath,
  resolveToAbsolute,
  CHIP_CLASS,
  PATCHED_ATTR,
};
