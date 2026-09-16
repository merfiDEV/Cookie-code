/**
 * Контроллер slash-команд: слушает ввод в поле, детектит "/" токен,
 * показывает меню и по выбору заменяет slash-токен на промпт.
 */

const { detectTrigger } = require("./detect");
const { searchCommands, findCommand, descOf } = require("./registry");
const { t } = require("../../i18n/i18n");
const menu = require("./menu");
const chatInput = require("../chat-input");
const { collectReviewDiff, buildReviewPrompt } = require("./review-context");

/** Текущий активный токен (span в поле). */
let activeHit = null;
/** Флаг: открыто ли меню сейчас. */
let menuOpen = false;
/** Текущий список элементов меню (для навигации). */
let currentItems = [];
/** Тип активного меню: 'command' | 'file'. */
let activeKind = "command";
/** Таймер debounce для поиска файлов. */
let fileSearchTimer = null;
/** Счётчик запросов файлов (для отбрасывания устаревших ответов). */
let fileSearchSeq = 0;
/** Последний выполненный запрос файлов (чтобы не перезапрашивать то же самое). */
let lastFileQuery = null;

/**
 * Обработчик события input/keyup/click на поле.
 * @param {Event} e
 */
function onFieldUpdate(e) {
  const field = e.target;
  if (!isTrackedField(field)) return;
  // keyup после навигации не меняет текст. Перерисовка здесь сбрасывает
  // подсветку меню на первый пункт, поэтому такие события игнорируем.
  if (
    e.type === "keyup" &&
    ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)
  )
    return;
  update(e);
}

/**
 * Пересчитывает токен и управляет меню.
 * @param {Event} e
 */
function update(e) {
  const field = e.target;
  const caret = getCaret(field);
  if (caret === null) return;

  const draft = getValue(field);
  const hit = detectTrigger(draft, caret);

  if (!hit) {
    activeHit = null;
    cancelFileSearch();
    if (menuOpen) closeMenu();
    return;
  }

  // Ветка @-файлов: запрашиваем список файлов проекта через IPC.
  if (hit.trigger === "@") {
    activeHit = { hit, field };
    activeKind = "file";
    scheduleFileSearch(field, hit.query);
    return;
  }

  // Ветка slash-команд.
  activeKind = "command";
  cancelFileSearch();
  const candidates = searchCommands(hit.query).map((c) => ({
    name: c.name,
    description: descOf(c, t),
  }));
  if (candidates.length === 0) {
    activeHit = null;
    if (menuOpen) closeMenu();
    return;
  }

  activeHit = { hit, field };
  currentItems = candidates;

  menu.show(candidates, field, (idx) => pick(idx));
  menuOpen = true;

  // меню позиционируем после рендера
  requestAnimationFrame(() => menu.position(field));
}

/** Отменяет отложенный поиск файлов. */
function cancelFileSearch() {
  if (fileSearchTimer) {
    clearTimeout(fileSearchTimer);
    fileSearchTimer = null;
  }
  // Даже уже запущенный IPC-запрос должен стать устаревшим.
  fileSearchSeq++;
}

/**
 * Отложенно (debounce 120мс) запрашивает файлы проекта и показывает меню.
 * @param {Element} field
 * @param {string} query
 */
function scheduleFileSearch(field, query) {
  // Тот же запрос уже показан — не перезапрашиваем и не перерисовываем меню
  // (иначе навигация стрелками сбрасывает подсветку на первый элемент).
  if (menuOpen && activeKind === "file" && query === lastFileQuery) return;
  cancelFileSearch();
  const seq = ++fileSearchSeq;
  fileSearchTimer = setTimeout(async () => {
    fileSearchTimer = null;
    if (!activeHit || activeHit.field !== field) return;
    if (
      !window.electronAPI ||
      typeof window.electronAPI.listProjectFiles !== "function"
    )
      return;
    let files = [];
    try {
      const res = await window.electronAPI.listProjectFiles(query);
      if (res && res.success && Array.isArray(res.files)) files = res.files;
    } catch (_) {
      files = [];
    }
    // Устаревший ответ (пользователь уже набрал другое) — игнорируем.
    if (seq !== fileSearchSeq) return;
    if (!activeHit || activeHit.field !== field) return;
    lastFileQuery = query;

    if (files.length === 0) {
      if (menuOpen) closeMenu();
      return;
    }

    const wasOpen = menuOpen && activeKind === "file";
    const prevHighlight = wasOpen ? menu.getState().highlight : 0;
    currentItems = files.map((f) => ({
      name: f.rel,
      abs: f.abs,
      isDir: !!f.isDir,
      description: "",
    }));
    activeKind = "file";
    menu.show(currentItems, field, (idx) => pick(idx), {
      prefix: "",
      title: t("cmd.menu.files"),
      monospace: false,
      icons: true,
    });
    if (wasOpen && prevHighlight > 0) {
      const idx = Math.min(prevHighlight, currentItems.length - 1);
      menu.highlightItem(idx);
      menu.scrollIntoView(idx);
    }
    menuOpen = true;
    requestAnimationFrame(() => menu.position(field));
  }, 120);
}

/**
 * Обработчик keydown: навигация и выбор.
 * @param {KeyboardEvent} e
 * @returns {boolean} true, если событие обработано (нужен preventDefault)
 */
function onKeyDown(e) {
  if (!menuOpen || !activeHit) return false;

  switch (e.key) {
    case "ArrowDown":
      move(1);
      return true;
    case "ArrowUp":
      move(-1);
      return true;
    case "Enter":
    case "Tab":
      pick(menu.getState().highlight);
      return true;
    case "Escape":
      closeMenu();
      return true;
    default:
      return false;
  }
}

/**
 * Перемещает подсветку по списку.
 * @param {number} dir
 */
function move(dir) {
  const st = menu.getState();
  const count = st.items.length;
  if (count === 0) return;
  const next = Math.min(Math.max(st.highlight + dir, 0), count - 1);
  if (next === st.highlight) return;
  menu.highlightItem(next);
  menu.scrollIntoView(next);
}

/**
 * Выбирает элемент по индексу и вставляет промпт.
 * @param {number} idx
 */
function pick(idx) {
  if (!activeHit) return;
  const { hit, field } = activeHit;
  const item = currentItems[idx];
  if (!item) return;

  // Для файлов вставляем абсолютный путь, для команд — промпт.
  let replacement;
  if (activeKind === "file") {
    replacement = item.abs || item.name;
  } else {
    const cmd = findCommand(item.name);
    if (!cmd) return;
    replacement = cmd.prompt;
  }

  const isReviewCommand = activeKind === "command" && item.name === "review";

  // Review отправляется после async-сбора diff. Не вставляем промежуточный
  // prompt в поле: событие input может повторно открыть меню и выбрать команду.
  if (isReviewCommand) {
    closeMenu();
    activeHit = null;
    collectReviewDiff(window.electronAPI)
      .then((result) => {
        chatInput.sendToChat(buildReviewPrompt(result), "review", 0);
      })
      .catch((err) => {
        chatInput.sendToChat(
          buildReviewPrompt({
            diff: "",
            reason: err.message || "Не удалось подготовить review",
          }),
          "review",
          0,
        );
      });
    return;
  }

  const draft = getValue(field);
  // Заменяем ТОЛЬКО токен (от span.start до текущего caret)
  const caret = getCaret(field);
  const before = draft.slice(0, hit.span.start);
  const after = draft.slice(caret === null ? hit.span.end : caret);
  const next = before + replacement + after;

  // Сбрасываем активное меню до input-события от setValue(). Это не даёт
  // старому async-поиску @-файлов снова отрисовать список после выбора.
  closeMenu();
  activeHit = null;

  setValue(field, next);

  // Устанавливаем курсор после вставленного текста
  const pos = before.length + replacement.length;
  setCaret(field, pos);
}

/** Закрывает меню. */
function closeMenu() {
  menu.hide();
  menuOpen = false;
  currentItems = [];
  activeKind = "command";
  lastFileQuery = null;
  cancelFileSearch();
}

/**
 * Подключает обработчики к полю ввода.
 * @param {Element} field
 */
function attachField(field) {
  if (!field || field.__cuckooCmdBound) return;
  field.__cuckooCmdBound = true;

  field.addEventListener("input", onFieldUpdate);
  field.addEventListener("keyup", onFieldUpdate);
  field.addEventListener("click", onFieldUpdate);
  field.addEventListener(
    "keydown",
    (e) => {
      const handled = onKeyDown(e);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  field.addEventListener("blur", () => {
    // небольшая задержка, чтобы mousedown по пункту успел сработать
    setTimeout(() => {
      if (menuOpen) closeMenu();
    }, 120);
  });
}

// ==================== helpers ====================

function isTrackedField(el) {
  if (!el) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return true;
  if (el.isContentEditable || el.getAttribute("contenteditable") === "true")
    return true;
  return false;
}

function getValue(field) {
  if (field.tagName === "TEXTAREA" || field.tagName === "INPUT")
    return field.value || "";
  return field.textContent || "";
}

function setValue(field, value) {
  if (field.tagName === "TEXTAREA" || field.tagName === "INPUT") {
    const proto =
      field.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
    nativeSetter.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    // contenteditable
    field.textContent = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function getCaret(field) {
  if (field.tagName === "TEXTAREA" || field.tagName === "INPUT") {
    return typeof field.selectionStart === "number"
      ? field.selectionStart
      : null;
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!field.contains(range.endContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(field);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setCaret(field, pos) {
  if (field.tagName === "TEXTAREA" || field.tagName === "INPUT") {
    try {
      field.setSelectionRange(pos, pos);
    } catch (_) {}
    return;
  }
  // contenteditable — приблизительно: ставим в конец
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(field);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

module.exports = {
  attachField,
  closeMenu,
  onKeyDown,
  update,
  get activeHit() {
    return activeHit;
  },
  get menuOpen() {
    return menuOpen;
  },
};
