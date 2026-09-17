/**
 * Дашборд статистики Cookie Code на домашней странице DeepSeek.
 *
 * Показывается ТОЛЬКО на home (URL совпадает с provider.homeUrlPattern):
 *   - окно нельзя перетащить и нельзя закрыть;
 *   - само скрывается, как только начинается сессия (URL перестаёт быть home).
 *
 * Данные: main-процесс (stats-get-summary), локальное накопление в cuckoo-stats.json.
 *
 * Горячие клавиши (только в debug-режиме, тумблер в настройках):
 *   F6 — показать/скрыть отладочную рамку дашборда
 *   F7 — принудительно перечитать статистику
 */
const { getProviderByUrl } = require("../../../src/providers");
const state = require("./state");

const ROOT_ID = "cuckoo-stats-dashboard";
const STYLE_ID = "cuckoo-stats-style";
const POS_KEY = "cuckoo-stats-dash-pos";

// Период heatmap (дней). Метрики при этом считаются за всё время.
const RANGE_DAYS = 180;

let rootEl = null;
let started = false;
let debugFrame = false;
let debugMode = false;
let refreshTimer = null;

/**
 * Открыта ли модалка настроек DeepSeek (тогда дашборд прячем).
 */
function isSettingsOpen() {
  try {
    return !!document.querySelector(
      ".ds-modal-content__main, .ds-modal-focus-lock",
    );
  } catch (_) {
    return false;
  }
}

/**
 * Является ли текущая страница домашней (по провайдеру).
 */
function isHomePage() {
  try {
    const provider = getProviderByUrl(window.location.href);
    if (provider && provider.homeUrlPattern) {
      return provider.homeUrlPattern.test(window.location.href);
    }
    // Фолбэк: DeepSeek home.
    return /^https:\/\/chat\.deepseek\.com\/?(\?.*)?$/.test(
      window.location.href,
    );
  } catch (_) {
    return false;
  }
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Внедрить CSS дашборда (однократно).
 */
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      top: 92px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483000;
      width: min(560px, 86vw);
      background: rgba(20, 22, 38, 0.92);
      border: 1px solid rgba(139, 147, 255, 0.28);
      border-radius: 18px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      color: #e8eaff;
      font-size: 12px;
      padding: 14px 16px;
      pointer-events: none;
      transition: box-shadow 0.18s;
    }
    #${ROOT_ID}.cuckoo-hidden { display: none; }
    /* В debug-режиме окно можно тащить за заголовок. */
    #${ROOT_ID}.ckd-draggable { pointer-events: auto; }
    #${ROOT_ID}.ckd-draggable .ckd-head { cursor: grab; }
    #${ROOT_ID}.ckd-draggable .ckd-head:active { cursor: grabbing; }
    #${ROOT_ID}.ckd-dragging { box-shadow: 0 28px 90px rgba(109,118,255,0.55); }
    #${ROOT_ID} .ckd-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
      user-select: none;
    }
    #${ROOT_ID} .ckd-drag-hint {
      font-size: 10.5px; color: #6d76ff; margin-left: 8px;
      opacity: 0; transition: opacity 0.15s;
    }
    #${ROOT_ID}.ckd-draggable .ckd-drag-hint { opacity: 1; }
    #${ROOT_ID} .ckd-title { font-size: 13px; font-weight: 700; letter-spacing: .3px; }
    #${ROOT_ID} .ckd-range { font-size: 10px; color: #8a90b8; }
    #${ROOT_ID} .ckd-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
    }
    #${ROOT_ID} .ckd-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px; padding: 7px 9px;
    }
    #${ROOT_ID} .ckd-card .k { font-size: 10px; color: #8a90b8; margin-bottom: 3px; }
    #${ROOT_ID} .ckd-card .v { font-size: 17px; font-weight: 700; color: #dfe3ff; }
    /* Плотная heatmap в стиле GitHub: 7 строк (дни недели), столбцы — недели. */
    #${ROOT_ID} .ckd-heat {
      display: grid; grid-auto-flow: column;
      grid-template-rows: repeat(7, 9px);
      gap: 2px; margin-top: 12px; overflow-x: auto; padding-bottom: 2px;
    }
    #${ROOT_ID} .ckd-cell { width: 9px; height: 9px; border-radius: 2px; background: rgba(255,255,255,0.05); }
    #${ROOT_ID} .ckd-cell.l1 { background: rgba(139,147,255,0.28); }
    #${ROOT_ID} .ckd-cell.l2 { background: rgba(139,147,255,0.5); }
    #${ROOT_ID} .ckd-cell.l3 { background: rgba(139,147,255,0.72); }
    #${ROOT_ID} .ckd-cell.l4 { background: rgba(139,147,255,1); }
    #${ROOT_ID} .ckd-foot { margin-top: 10px; font-size: 10.5px; color: #8a90b8; }
    #${ROOT_ID}.ckd-debug { outline: 2px dashed rgba(255,107,122,0.8); outline-offset: 4px; }
    .ckd-debug-hint {
      position: fixed; left: 50%; transform: translateX(-50%);
      bottom: 18px; z-index: 2147483001;
      background: rgba(255,107,122,0.16); border: 1px solid rgba(255,107,122,0.5);
      color: #ffd0d6; font-size: 12px; padding: 6px 12px; border-radius: 999px;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function levelFor(messages) {
  if (!messages) return "";
  if (messages < 3) return "l1";
  if (messages < 10) return "l2";
  if (messages < 30) return "l3";
  return "l4";
}

/**
 * Отрендерить/обновить дашборд по сводке из main.
 */
function render(summary) {
  if (!rootEl) return;
  const s = summary || {};
  const t = s.totals || {};
  const days = Array.isArray(s.days) ? s.days : [];
  const cells = days
    .map((d) => {
      const lvl = levelFor(d.messages);
      const title = d.date + ": " + (d.messages || 0) + " сообщ.";
      return (
        '<div class="ckd-cell ' + lvl + '" title="' + esc(title) + '"></div>'
      );
    })
    .join("");

  const peakLabel =
    s.peakHour === "—" || s.peakHour == null
      ? "—"
      : String(s.peakHour).padStart(2, "0") + ":00";

  rootEl.innerHTML =
    '<div class="ckd-head">' +
    '<div class="ckd-title">Cookie Code · Обзор' +
    '<span class="ckd-drag-hint">⠿ тяни (debug)</span></div>' +
    '<div class="ckd-range">' +
    RANGE_DAYS +
    " дн · всего за всё время</div>" +
    "</div>" +
    '<div class="ckd-grid">' +
    card("Сессии", t.sessions || 0) +
    card("Сообщения", t.messages || 0) +
    card("Токены", formatTokens(t.tokens || 0)) +
    card("Активных дней", s.activeDays || 0) +
    card("Текущая серия", (s.currentStreak || 0) + " дн") +
    card("Макс. серия", (s.longestStreak || 0) + " дн") +
    card("Пик. час", peakLabel) +
    card("Любимая модель", s.favoriteModel || "—") +
    "</div>" +
    '<div class="ckd-heat">' +
    cells +
    "</div>" +
    '<div class="ckd-foot">' +
    (debugMode ? "F6 — рамка · F7 — обновить · " : "") +
    "Метрики — за всё время · теплокарта — " +
    RANGE_DAYS +
    " дн" +
    "</div>";
}

function card(k, v) {
  return (
    '<div class="ckd-card"><div class="k">' +
    esc(k) +
    '</div><div class="v">' +
    esc(v) +
    "</div></div>"
  );
}

function formatTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

/**
 * Восстановить сохранённую позицию дашборда из localStorage.
 */
function restorePosition() {
  if (!rootEl) return;
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return;
    const pos = JSON.parse(raw);
    // Позиция хранится в ДОЛЯХ окна (ratioX/ratioY 0..1) — так она
    // адаптируется под любое разрешение. Фолбэк — старый формат (left/top).
    let left, top;
    if (typeof pos.ratioX === "number" && typeof pos.ratioY === "number") {
      left = pos.ratioX * window.innerWidth;
      top = pos.ratioY * window.innerHeight;
    } else if (typeof pos.left === "number" && typeof pos.top === "number") {
      left = pos.left;
      top = pos.top;
    } else {
      return;
    }
    const clamped = clampToViewport(left, top);
    rootEl.style.left = clamped.left + "px";
    rootEl.style.top = clamped.top + "px";
    rootEl.style.transform = "none";
    logPos("restore", clamped.left, clamped.top);
  } catch (_) {}
}

/**
 * Ограничить позицию окна так, чтобы оно не выходило за пределы экрана.
 */
function clampToViewport(left, top) {
  const rect = rootEl
    ? rootEl.getBoundingClientRect()
    : { width: 0, height: 0 };
  const w = rect.width || 300;
  const h = rect.height || 120;
  const maxLeft = Math.max(0, window.innerWidth - w);
  const maxTop = Math.max(0, window.innerHeight - h);
  return {
    left: Math.max(0, Math.min(maxLeft, left)),
    top: Math.max(0, Math.min(maxTop, top)),
  };
}

/**
 * Логировать координаты дашборда в консоль (для отладки позиции).
 * @param {string} where  метка (restore/drag/resize)
 */
function logPos(where, left, top) {
  try {
    const rect = rootEl.getBoundingClientRect();
    const l = Math.round(left != null ? left : rect.left);
    const t = Math.round(top != null ? top : rect.top);
    const rX = (rect.left / window.innerWidth).toFixed(4);
    const rY = (rect.top / window.innerHeight).toFixed(4);
    // Развёрнутый лог для точного позиционирования: пиксели, доли,
    // размеры окна и самого дашборда, отступы от краёв.
    console.log(
      "[Cookie Code][dashboard] " +
        where +
        "\n" +
        "  позиция:      left=" +
        l +
        "px  top=" +
        t +
        "px\n" +
        "  доли окна:    ratioX=" +
        rX +
        "  ratioY=" +
        rY +
        "\n" +
        "  окно:         " +
        window.innerWidth +
        "x" +
        window.innerHeight +
        "px\n" +
        "  дашборд:      " +
        Math.round(rect.width) +
        "x" +
        Math.round(rect.height) +
        "px\n" +
        "  отступы:      right=" +
        Math.round(window.innerWidth - rect.right) +
        "px  bottom=" +
        Math.round(window.innerHeight - rect.bottom) +
        "px\n" +
        "  (скопируй ratioX/ratioY при необходимости)",
    );
  } catch (_) {}
}

/**
 * Сделать дашборд перетаскиваемым за заголовок (только когда активен
 * класс ckd-draggable, т.е. в debug-режиме).
 */
function makeDraggable() {
  if (!rootEl || rootEl.__dragBound) return;
  rootEl.__dragBound = true;
  let dragging = false;
  let startX = 0,
    startY = 0,
    startLeft = 0,
    startTop = 0;

  rootEl.addEventListener("mousedown", (e) => {
    if (!rootEl.classList.contains("ckd-draggable")) return;
    const head = e.target.closest && e.target.closest(".ckd-head");
    if (!head) return;
    dragging = true;
    const rect = rootEl.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;
    rootEl.style.transform = "none";
    rootEl.classList.add("ckd-dragging");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  });

  const onMove = (e) => {
    if (!dragging) return;
    let left = startLeft + (e.clientX - startX);
    let top = startTop + (e.clientY - startY);
    const c = clampToViewport(left, top);
    rootEl.style.left = c.left + "px";
    rootEl.style.top = c.top + "px";
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    rootEl.classList.remove("ckd-dragging");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    try {
      const rect = rootEl.getBoundingClientRect();
      // Сохраняем в ДОЛЯХ окна — адаптивно к любому разрешению.
      const ratioX = rect.left / window.innerWidth;
      const ratioY = rect.top / window.innerHeight;
      localStorage.setItem(POS_KEY, JSON.stringify({ ratioX, ratioY }));
      logPos("drag-saved", rect.left, rect.top);
    } catch (_) {}
  };
}

/**
 * Создать контейнер дашборда (если ещё нет).
 */
function ensureRoot() {
  if (rootEl && document.body.contains(rootEl)) return rootEl;
  rootEl = document.createElement("div");
  rootEl.id = ROOT_ID;
  rootEl.className = "cuckoo-hidden";
  (document.body || document.documentElement).appendChild(rootEl);
  restorePosition();
  makeDraggable();
  return rootEl;
}

/**
 * Показать/скрыть в зависимости от текущей страницы.
 */
async function syncVisibility() {
  if (!rootEl) return;
  const home = isHomePage();
  // Настройки открыты — прячем дашборд, чтобы не мешал.
  if (!home || isSettingsOpen()) {
    rootEl.classList.add("cuckoo-hidden");
    return;
  }
  // На home — показываем и обновляем данные.
  await refresh();
  rootEl.classList.remove("cuckoo-hidden");
  logPos("shown");
}

/**
 * Перечитать статистику из main и отрендерить.
 */
async function refresh() {
  try {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.statsGetSummary !== "function"
    )
      return;
    const res = await window.electronAPI.statsGetSummary(RANGE_DAYS);
    if (res && res.success && res.summary) render(res.summary);
  } catch (err) {
    console.warn("[Cookie Code] dashboard refresh error:", err.message);
  }
}

/**
 * Включить/выключить debug-режим (тумблер в настройках / setDebugMode).
 */
function setDebugMode(on) {
  debugMode = !!on;
  if (rootEl) {
    // В debug-режиме окно можно перетаскивать за заголовок.
    rootEl.classList.toggle("ckd-draggable", debugMode);
    if (!debugMode) {
      rootEl.classList.remove("ckd-debug", "ckd-dragging");
      debugFrame = false;
    }
  }
  if (rootEl) refresh();
  return debugMode;
}

function toggleDebugFrame() {
  debugFrame = !debugFrame;
  if (rootEl) rootEl.classList.toggle("ckd-debug", debugFrame);
}

/**
 * Запуск: создаём дашборд и следим за URL (SPA-навигация).
 */
function start() {
  if (started) return;
  started = true;
  injectStyle();
  ensureRoot();
  // Применяем debug-режим (draggable) из настроек.
  setDebugMode(state.statsDebugMode === true);
  syncVisibility();

  // Регулярная проверка (URL меняется в SPA без перезагрузки).
  refreshTimer = setInterval(() => syncVisibility(), 1500);

  // Мгновенная реакция на открытие/закрытие настроек.
  try {
    const mo = new MutationObserver(() => syncVisibility());
    mo.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (_) {}

  // Мгновенная реакция на открытие/закрытие настроек.
  try {
    const mo = new MutationObserver(() => syncVisibility());
    mo.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (_) {}

  window.addEventListener("popstate", syncVisibility);
  window.addEventListener("hashchange", syncVisibility);

  // При изменении размера окна — пересчитываем позицию из сохранённых долей,
  // чтобы окно оставалось в том же относительном месте на любом разрешении.
  window.addEventListener("resize", () => {
    if (!rootEl) return;
    // Если позиция сохранялась вручную — пересчитываем из долей.
    // Иначе оставляем CSS-центрирование по умолчанию.
    if (localStorage.getItem(POS_KEY)) {
      restorePosition();
    }
    logPos("resize");
  });

  // При изменении размера окна — пересчитываем позицию из сохранённых долей,
  // чтобы окно оставалось в том же относительном месте на любом разрешении.
  window.addEventListener("resize", () => {
    if (!rootEl) return;
    // Если позиция сохранялась вручную — пересчитываем из долей.
    // Иначе оставляем CSS-центрирование по умолчанию.
    if (localStorage.getItem(POS_KEY)) {
      restorePosition();
    }
    logPos("resize");
  });

  // Горячие клавиши — только в debug-режиме.
  window.addEventListener(
    "keydown",
    (e) => {
      if (!debugMode) return;
      if (e.key === "F6") {
        e.preventDefault();
        toggleDebugFrame();
      } else if (e.key === "F7") {
        e.preventDefault();
        refresh();
      }
    },
    true,
  );

  // Загружаем debug-режим из настроек.
  try {
    if (window.electronAPI && window.electronAPI.getCuckooSettings) {
      window.electronAPI.getCuckooSettings().then((s) => {
        debugMode = !!(s && s.statsDebugMode);
      });
    }
  } catch (_) {}
}

module.exports = { start, refresh, setDebugMode };
