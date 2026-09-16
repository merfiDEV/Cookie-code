/**
 * DOM-оверлей выпадающего списка slash-команд.
 * Один singleton-элемент, позиционируется над полем ввода.
 * Стиль согласован с вкладкой настроек Cookie Code (тёмный, сине-фиолетовый).
 */

const { t } = require("../../i18n/i18n");

// Иконка файла (Material Icon Theme) для строк меню @-упоминаний.
let getFileIcon = () => "";
try {
  ({ getFileIcon } = require("../file-chip"));
} catch (_) {}

const MENU_ID = "cuckoo-command-menu";

/** Состояние текущего меню. */
let state = {
  visible: false,
  items: [],
  highlight: 0,
  anchor: null, // поле ввода, к которому привязано меню
  prefix: "/", // префикс токена для отображения ('' — без префикса)
  title: null, // заголовок меню (null — взять cmd.menu.title по умолчанию)
  monospace: true, // моноширинный ли шрифт у имени элемента
  icons: false, // показывать ли иконки (только для @-файлов)
};

/**
 * Создаёт (при необходимости) и возвращает корневой элемент меню.
 * @returns {HTMLElement}
 */
function ensureMenuEl() {
  let el = document.getElementById(MENU_ID);
  if (el) return el;

  el = document.createElement("div");
  el.id = MENU_ID;
  el.style.cssText = [
    "position: fixed",
    "z-index: 2147483600",
    "display: none",
    "min-width: 280px",
    "max-width: 460px",
    "max-height: 320px",
    "overflow-y: auto",
    "padding: 6px",
    "box-sizing: border-box",
    "border-radius: 12px",
    "border: 1px solid rgba(139,147,255,0.35)",
    "background: rgba(20,23,40,0.96)",
    "box-shadow: 0 12px 32px rgba(0,0,0,0.45)",
    "backdrop-filter: blur(14px)",
    "-webkit-backdrop-filter: blur(14px)",
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    "color: #dde1ff",
    "font-size: 13px",
  ].join(";");
  document.body.appendChild(el);
  return el;
}

/**
 * Отрисовывает список команд в меню.
 * @param {Array<{name: string, description: string}>} items
 * @param {number} highlight - индекс подсвеченного элемента
 */
function render(items, highlight) {
  const el = ensureMenuEl();
  el.innerHTML = "";

  if (!items || items.length === 0) {
    el.style.display = "none";
    state.visible = false;
    return;
  }

  const title = document.createElement("div");
  title.textContent = state.title != null ? state.title : t("cmd.menu.title");
  title.style.cssText =
    "padding:6px 10px;font-size:11px;letter-spacing:0.6px;text-transform:uppercase;color:#8a90b8;";
  el.appendChild(title);

  items.forEach((item, idx) => {
    const row = document.createElement("div");
    const active = idx === highlight;
    row.className = "cuckoo-command-item";
    row.dataset.index = String(idx);
    row.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "gap:2px",
      "padding:8px 10px",
      "border-radius:8px",
      "cursor:pointer",
      "transition: background 0.12s",
      "background:" + (active ? "rgba(139,147,255,0.22)" : "transparent"),
    ].join(";");

    const name = document.createElement("div");
    name.style.cssText =
      "display:flex;align-items:center;gap:6px;font-weight:600;color:#c8ccff;" +
      (state.monospace ? "font-family:Consolas,monospace;" : "");

    // Иконка: только для @-файлов (state.icons).
    if (state.icons) {
      const icon = document.createElement("span");
      icon.className = "cuckoo-command-item-icon";
      icon.style.cssText =
        "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:0 0 16px;";
      if (item.isDir) {
        icon.innerHTML =
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8a90b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' +
          "</svg>";
      } else {
        const svg = getFileIcon(item.abs || item.name);
        if (svg) {
          icon.innerHTML = svg;
          const s = icon.querySelector("svg");
          if (s) {
            s.setAttribute("width", "16");
            s.setAttribute("height", "16");
            // Fallback-иконка (монохромный документ) — контурная,
            // иначе браузер заливает её чёрным.
            if (s.classList.contains("cuckoo-file-chip__fallback")) {
              s.setAttribute("fill", "none");
              s.setAttribute("stroke", "currentColor");
              s.setAttribute("stroke-width", "2");
              s.setAttribute("stroke-linecap", "round");
              s.setAttribute("stroke-linejoin", "round");
            }
          }
        }
      }
      name.appendChild(icon);
    }

    const label = document.createElement("span");
    label.textContent = state.prefix + item.name + (item.isDir ? "/" : "");
    name.appendChild(label);

    row.appendChild(name);

    const desc = document.createElement("div");
    desc.textContent = item.description || "";
    desc.style.cssText = "font-size:12px;color:#8a90b8;";
    row.appendChild(desc);

    row.addEventListener("mouseenter", () => {
      state.highlight = idx;
      highlightItem(idx);
    });
    row.addEventListener("mousedown", (e) => {
      // mousedown, чтобы не потерять фокус поля ввода
      e.preventDefault();
      e.stopPropagation();
      if (typeof state.onPick === "function") state.onPick(idx);
    });

    el.appendChild(row);
  });

  el.style.display = "block";
  state.visible = true;
}

/**
 * Переключает подсветку без полной перерисовки.
 * @param {number} index
 */
function highlightItem(index) {
  const el = document.getElementById(MENU_ID);
  if (!el) return;
  const rows = el.querySelectorAll(".cuckoo-command-item");
  rows.forEach((row, i) => {
    row.style.background =
      i === index ? "rgba(139,147,255,0.22)" : "transparent";
  });
  state.highlight = index;
}

/**
 * Прокручивает меню так, чтобы подсвеченный элемент был виден.
 * @param {number} index
 */
function scrollIntoView(index) {
  const el = document.getElementById(MENU_ID);
  if (!el) return;
  const rows = el.querySelectorAll(".cuckoo-command-item");
  const row = rows[index];
  if (!row) return;
  const rowTop = row.offsetTop;
  const rowBottom = rowTop + row.offsetHeight;
  const viewTop = el.scrollTop;
  const viewBottom = viewTop + el.clientHeight;
  if (rowTop < viewTop) {
    el.scrollTop = rowTop;
  } else if (rowBottom > viewBottom) {
    el.scrollTop = rowBottom - el.clientHeight;
  }
}

/**
 * Позиционирует меню относительно поля ввода (над ним).
 * @param {Element} anchor
 */
function position(anchor) {
  const el = ensureMenuEl();
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const menuRect = el.getBoundingClientRect();
  const gap = 8;

  let left = rect.left;
  // Не выходим за правый край
  const maxLeft = window.innerWidth - menuRect.width - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);

  // Ставим над полем; если не влезает — под ним
  let top = rect.top - menuRect.height - gap;
  if (top < 8) top = rect.bottom + gap;

  el.style.left = Math.round(left) + "px";
  el.style.top = Math.round(top) + "px";
}

/**
 * Показывает меню.
 * @param {Array} items
 * @param {Element} anchor
 * @param {Function} onPick - callback(index)
 */
function show(items, anchor, onPick, options) {
  state.items = items;
  state.highlight = 0;
  state.anchor = anchor;
  state.onPick = onPick;
  const opts = options || {};
  state.prefix = opts.prefix != null ? opts.prefix : "/";
  state.title = opts.title != null ? opts.title : null;
  state.monospace = opts.monospace != null ? opts.monospace : true;
  state.icons = opts.icons === true;
  render(items, 0);
  position(anchor);
}

/** Скрывает меню. */
function hide() {
  const el = document.getElementById(MENU_ID);
  if (el) el.style.display = "none";
  state.visible = false;
  state.items = [];
  state.onPick = undefined;
  state.prefix = "/";
  state.title = null;
  state.monospace = true;
  state.icons = false;
}

/**
 * Возвращает текущее состояние (для контроллера).
 */
function getState() {
  return state;
}

module.exports = {
  MENU_ID,
  show,
  hide,
  render,
  highlightItem,
  scrollIntoView,
  position,
  getState,
};
