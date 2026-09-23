/**
 * Фиксация языка интерфейса DeepSeek на «Система» (System) и запрет его смены.
 *
 * Работает на родной вкладке General в модалке настроек DeepSeek:
 *   строка «Language/Язык/语言» содержит кастомный селект .ds-select.
 *
 * Алгоритм:
 *   1) находим Language-селект (первый .ds-select в строке с текстом Language);
 *   2) если текущее значение не System — программно выбираем System через
 *      React onClick соответствующей опции (открывая меню через onMouseDown);
 *   3) блокируем селект: pointer-events:none, tabindex=-1, aria-disabled,
 *      гасим onMouseDown/onKeyDown, визуально приглушаем.
 *
 * Все операции обёрнуты в safe(): при изменении вёрстки модуль просто
 * пропускает шаг, не ломая приложение.
 */

const { safe } = require("./safe");

const LANGUAGE_LABELS = ["Language", "Язык", "语言"];
const SYSTEM_LABELS = ["System", "Система", "系统"];

let started = false;
// Флаг защиты от повторного входа (программный клик по опции).
let applying = false;

/**
 * Найти селект языка: .ds-select, рядом с которым (в той же строке-контейнере)
 * есть текст Language/Язык/语言.
 * @returns {HTMLElement|null}
 */
function findLanguageSelect() {
  return safe(
    "deepseek-language.findSelect",
    () => {
      const selects = document.querySelectorAll(".ds-select");
      for (const sel of selects) {
        const row = sel.parentElement;
        if (!row) continue;
        const rowText = (row.textContent || "").trim();
        if (LANGUAGE_LABELS.some((lbl) => rowText.indexOf(lbl) !== -1))
          return sel;
      }
      return null;
    },
    null,
  );
}

/** Достать React-props узла (или null). */
function getReactProps(node) {
  return safe(
    "deepseek-language.getReactProps",
    () => {
      if (!node) return null;
      const key = Object.keys(node).find(
        (k) => k.indexOf("__reactProps") === 0,
      );
      return key ? node[key] : null;
    },
    null,
  );
}

/** Текущее отображаемое значение селекта языка. */
function getCurrentValue(sel) {
  return safe(
    "deepseek-language.getCurrentValue",
    () => {
      return sel ? (sel.textContent || "").trim() : "";
    },
    "",
  );
}

/**
 * Открыть меню селекта через его React onMouseDown.
 * @returns {boolean}
 */
function openSelectMenu(sel) {
  return safe(
    "deepseek-language.openMenu",
    () => {
      const props = getReactProps(sel);
      if (!props || typeof props.onMouseDown !== "function") return false;
      props.onMouseDown({
        type: "mousedown",
        button: 0,
        currentTarget: sel,
        target: sel,
        preventDefault() {},
        stopPropagation() {},
      });
      return true;
    },
    false,
  );
}

/**
 * Найти опцию «Система» среди открытых .ds-select-option.
 * @returns {HTMLElement|null}
 */
function findSystemOption() {
  return safe(
    "deepseek-language.findSystemOption",
    () => {
      const opts = document.querySelectorAll(".ds-select-option");
      for (const opt of opts) {
        const tx = (opt.textContent || "").trim();
        if (SYSTEM_LABELS.indexOf(tx) !== -1) return opt;
      }
      return null;
    },
    null,
  );
}

/** Выбрать опцию через её React onClick. */
function clickOption(opt) {
  return safe(
    "deepseek-language.clickOption",
    () => {
      const props = getReactProps(opt);
      if (!props || typeof props.onClick !== "function") return false;
      props.onClick({
        type: "click",
        button: 0,
        currentTarget: opt,
        target: opt,
        preventDefault() {},
        stopPropagation() {},
      });
      return true;
    },
    false,
  );
}

/** Заблокировать селект языка. */
function lockSelect(sel) {
  return safe("deepseek-language.lock", () => {
    if (!sel) return;
    sel.setAttribute("tabindex", "-1");
    sel.setAttribute("aria-disabled", "true");
    sel.style.pointerEvents = "none";
    sel.style.cursor = "not-allowed";
    sel.style.opacity = "0.7";
    // Гасим обработчики, чтобы меню не открывалось.
    const props = getReactProps(sel);
    if (props) {
      props.onMouseDown = function () {};
      props.onKeyDown = function () {};
      props.onFocus = function () {};
    }
  });
}

/**
 * Основное действие: выставить System и заблокировать селект.
 */
function enforce() {
  if (applying) return;
  return safe("deepseek-language.enforce", () => {
    const sel = findLanguageSelect();
    if (!sel) return;

    const current = getCurrentValue(sel);
    const isSystem = SYSTEM_LABELS.indexOf(current) !== -1;

    if (!isSystem) {
      applying = true;
      const opened = openSelectMenu(sel);
      if (!opened) {
        applying = false;
        lockSelect(sel);
        return;
      }
      // Меню рендерится асинхронно — ждём и выбираем System.
      setTimeout(() => {
        const opt = findSystemOption();
        if (opt) clickOption(opt);
        applying = false;
        lockSelect(sel);
      }, 300);
    } else {
      lockSelect(sel);
    }
  });
}

function startWatch() {
  if (started) return;
  started = true;

  // Реакция на появление/изменение модалки настроек.
  safe("deepseek-language.observeDoc", () => {
    const mo = new MutationObserver(() => enforce());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  });

  safe("deepseek-language.enforceStart", () => enforce());
  setInterval(() => enforce(), 1000);
}

module.exports = { startWatch, enforce };
