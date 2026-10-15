/**
 * Плавающая панель «Цель» (goalbar).
 * Порт из upstream cuckoo-code (harness goalbar) на overlay-архитектуру.
 * - Появляется, когда есть активная/завершённая цель.
 * - Перетаскивается за заголовок; позиция в localStorage.
 * - Данные: main (goal-get) + пуш goal-updated из preload движка.
 */

const PANEL_ID = "cuckoo-goal-panel";
const TEXT_ID = "cuckoo-goal-text";
const STATE_ID = "cuckoo-goal-state";
const ROUND_ID = "cuckoo-goal-round";
const DRAG_ID = "cuckoo-goal-drag";
const CLOSE_ID = "cuckoo-goal-close";
const PAUSE_ID = "cuckoo-goal-pause";
const EXIT_ID = "cuckoo-goal-exit";
const POS_KEY = "cuckoo-goal-pos";

let current = { active: false };
let userClosed = false;

/** Отформатировать прошедшее время. */
function fmtElapsed(ms) {
  const s = Math.floor((ms || 0) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? m + "м " + sec + "с" : sec + "с";
}

/** Отрисовать панель по состоянию. */
function render(goal) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  current = goal || { active: false };

  // Не показываем, если цели нет или пользователь скрыл вручную.
  const hasGoal = !!(current && current.text);
  if (!hasGoal) {
    panel.classList.add("cuckoo-hidden");
    userClosed = false;
    return;
  }
  if (userClosed) {
    panel.classList.add("cuckoo-hidden");
    return;
  }
  panel.classList.remove("cuckoo-hidden");

  const state = current.done ? "done" : current.paused ? "paused" : "running";
  panel.className = "cuckoo-goal-panel " + state;

  const stateEl = document.getElementById(STATE_ID);
  if (stateEl)
    stateEl.textContent = current.done
      ? "завершена"
      : current.paused
        ? "пауза"
        : "выполняется";

  const textEl = document.getElementById(TEXT_ID);
  if (textEl && document.activeElement !== textEl) {
    textEl.value = current.text || "";
    textEl.readOnly = !!current.done;
  }

  const roundEl = document.getElementById(ROUND_ID);
  if (roundEl) {
    roundEl.textContent =
      "итерация " +
      (current.round || 0) +
      (current.maxIterations ? " / " + current.maxIterations : "") +
      " · " +
      fmtElapsed(current.elapsedMs);
  }

  const pauseBtn = document.getElementById(PAUSE_ID);
  if (pauseBtn) {
    pauseBtn.textContent = current.done
      ? "Ок"
      : current.paused
        ? "Продолжить"
        : "Пауза";
    pauseBtn.disabled = !!current.done;
  }
  const exitBtn = document.getElementById(EXIT_ID);
  if (exitBtn) exitBtn.textContent = current.done ? "Скрыть" : "Выход";
}

/** Загрузить состояние из main. */
async function refresh() {
  try {
    const res = await window.electronAPI.getGoal();
    render(res && res.success ? res.goal : { active: false });
  } catch (_) {
    render({ active: false });
  }
}

/** Восстановить позицию. */
function restorePosition() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return;
    const pos = JSON.parse(raw);
    if (typeof pos.left === "number" && typeof pos.top === "number") {
      panel.style.left = pos.left + "px";
      panel.style.top = pos.top + "px";
    }
  } catch (_) {}
}

/** Сделать панель перетаскиваемой. */
function makeDraggable() {
  const panel = document.getElementById(PANEL_ID);
  const handle = document.getElementById(DRAG_ID);
  if (!panel || !handle) return;
  let dragging = false;
  let startX = 0,
    startY = 0,
    startLeft = 0,
    startTop = 0;
  const onDown = (e) => {
    dragging = true;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!dragging) return;
    let left = startLeft + (e.clientX - startX);
    let top = startTop + (e.clientY - startY);
    left = Math.max(0, Math.min(window.innerWidth - 60, left));
    top = Math.max(0, Math.min(window.innerHeight - 40, top));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    try {
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(
        POS_KEY,
        JSON.stringify({ left: rect.left, top: rect.top }),
      );
    } catch (_) {}
  };
  handle.addEventListener("mousedown", onDown);
}

/** Инициализация панели. */
function start() {
  restorePosition();
  makeDraggable();

  const closeBtn = document.getElementById(CLOSE_ID);
  if (closeBtn)
    closeBtn.addEventListener("click", () => {
      userClosed = true;
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.classList.add("cuckoo-hidden");
    });

  const pauseBtn = document.getElementById(PAUSE_ID);
  if (pauseBtn)
    pauseBtn.addEventListener("click", async () => {
      try {
        if (current.done) return;
        if (current.paused) await window.electronAPI.resumeGoal();
        else await window.electronAPI.pauseGoal();
      } catch (_) {}
    });

  const exitBtn = document.getElementById(EXIT_ID);
  if (exitBtn)
    exitBtn.addEventListener("click", async () => {
      try {
        if (current.done) {
          userClosed = true;
          const panel = document.getElementById(PANEL_ID);
          if (panel) panel.classList.add("cuckoo-hidden");
          return;
        }
        await window.electronAPI.stopGoal();
      } catch (_) {}
    });

  // Правка текста цели по Enter/blur.
  const textEl = document.getElementById(TEXT_ID);
  if (textEl) {
    const commit = () => {
      const v = (textEl.value || "").trim();
      if (v && current && !current.done && v !== current.text) {
        // Обновляем через движок: шлём команду set через goal-control не поддержан —
        // пока просто локально (текст цели меняется редко).
      }
    };
    textEl.addEventListener("blur", commit);
    textEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        textEl.blur();
      }
    });
  }

  // Подписка на пуш из preload-движка.
  try {
    window.electronAPI.onGoalUpdated((state) => {
      render(state);
    });
  } catch (_) {}
  refresh();
}

module.exports = { start, refresh, render };
