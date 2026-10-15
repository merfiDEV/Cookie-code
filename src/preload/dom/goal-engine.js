/**
 * Движок целей (goal mode) — ядро цикла автопродвижения.
 *
 * Порт из upstream wangyongpeng90/cuckoo-code (harness.html) на архитектуру
 * Cookie Code: движок живёт в preload, где уже есть sendToChat() и детект
 * завершения ответа AI.
 *
 * Как работает:
 *   1. Пользователь задаёт цель (/goal <текст>) → startGoal().
 *   2. buildGoalSendText() формирует инструкцию AI (первый запрос).
 *   3. Когда раунд ответа завершён (нет JS-тул-блоков), observer вызывает
 *      scheduleGoalNudge() → с задержкой отправляется «продолжай».
 *   4. AI по завершении вызывает тул goalDone() → main шлёт IPC 'goal-done'
 *      → onGoalDone() останавливает цикл.
 *   5. Предохранители: лимит итераций (по умолч. 50) и 3 раунда без прогресса.
 *
 * Состояние per-session (ключ = sessionId), персистится в localStorage.
 */
const state = require("./state");

// ========== Константы ==========
const STORAGE_KEY = "cuckoo-goal-v1";
const MAX_ITER_KEY = "cuckoo-goal-max-iterations";
const DEFAULT_MAX_ITER = 50;
const NUDGE_DELAY = 1200; // мс — пауза перед авто-продолжением
const NO_PROGRESS_LIMIT = 3; // раундов с одинаковым выводом → стоп

const BT =
  String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96); // ```
const FENCE = BT + "cuckoo";

// ========== Состояние ==========
/** Текущая цель: { text, round, done, paused, maxIterations, lastText,
 *   noProgress, startedAt, elapsed } или null. */
let goal = null;
let nudgeTimer = null;
let tickTimer = null;
/** ID текущей сессии (для ключа хранилища). Обновляется извне. */
let currentSessionId = "";

// Колбэки для UI (goal-panel): вызываются при изменении состояния.
let onUpdateCb = null;

// ========== Утилиты ==========

/** Текущий sessionId из URL через провайдер. */
function detectSessionId() {
  try {
    const provider = require("../../../src/providers").getProviderByUrl(
      window.location.href,
    );
    if (provider && typeof provider.extractSessionId === "function") {
      return provider.extractSessionId(window.location.href) || "";
    }
  } catch (_) {}
  return "";
}

/** Установить текущую сессию (вызывается observer/bindEvents при смене URL). */
function setSession(sessionId) {
  const next = String(sessionId || "");
  if (next === currentSessionId) return;
  // Сохраняем цель уходящей сессии, грузим цель новой.
  saveGoalState();
  currentSessionId = next;
  loadGoalState();
  notifyUpdate();
}

function goalKey() {
  return STORAGE_KEY + (currentSessionId ? ":" + currentSessionId : "");
}

function maxIterations() {
  try {
    const v = parseInt(localStorage.getItem(MAX_ITER_KEY) || "", 10);
    if (Number.isFinite(v) && v > 0) return v;
  } catch (_) {}
  return DEFAULT_MAX_ITER;
}

function saveGoalState() {
  try {
    localStorage.setItem(goalKey(), goal ? JSON.stringify(goal) : "null");
  } catch (_) {}
}

function loadGoalState() {
  try {
    goal = JSON.parse(localStorage.getItem(goalKey()) || "null");
  } catch (_) {
    goal = null;
  }
  if (goal && !goal.text) goal = null;
  if (goal) {
    if (typeof goal.elapsed !== "number") goal.elapsed = 0;
    if (typeof goal.noProgress !== "number") goal.noProgress = 0;
    if (!goal.done && !goal.paused && !goal.startedAt)
      goal.startedAt = Date.now();
  }
}

/** Прошедшее время цели: заморожено в elapsed на паузе/завершении. */
function elapsedMs() {
  if (!goal) return 0;
  return (
    (goal.elapsed || 0) + (goal.startedAt ? Date.now() - goal.startedAt : 0)
  );
}

function notifyUpdate() {
  if (typeof onUpdateCb === "function") {
    try {
      onUpdateCb(getState());
    } catch (_) {}
  }
  // Пуш в main — панель overlay и Telegram читают статус оттуда.
  try {
    window.electronAPI.goalUpdated(getState());
  } catch (_) {}
}

/** Публичное состояние для UI/IPC. */
function getState() {
  if (!goal) return { active: false };
  return {
    active: !goal.done,
    text: goal.text,
    round: goal.round,
    done: !!goal.done,
    paused: !!goal.paused,
    maxIterations: goal.maxIterations || maxIterations(),
    elapsedMs: elapsedMs(),
    noProgress: goal.noProgress || 0,
  };
}

function isActive() {
  return !!(goal && !goal.done && !goal.paused);
}

// ========== Тексты для AI ==========

/** Первый запрос цели (из upstream buildGoalSendText). */
function buildGoalSendText(gt) {
  return (
    "【目标】" +
    gt +
    "\n\n请持续推进并完成上述目标，要求：\n" +
    "1. 优先使用可用工具实际推进（读写文件、执行命令、检索等），而非只输出计划；\n" +
    "2. 一轮无法完成时直接继续下一轮，无需等待用户确认；\n" +
    "3. 目标的所有要求确实完成后，调用 goalDone() 工具结束目标（写成 " +
    FENCE +
    " 代码块，界面上不会显示这行调用）；\n" +
    "4. 遇到无法解决的阻碍时，说明原因并暂停等待。"
  );
}

/** Текст авто-продолжения. */
function nudgeSendText() {
  return "继续推进当前目标。若目标已全部完成，请调用 goalDone() 工具结束目标。";
}

// ========== Управление целью ==========

function startGoal(text) {
  const t = String(text || "").trim();
  if (!t) return { success: false, error: "Пустой текст цели" };
  cancelNudge();
  goal = {
    text: t,
    round: 0,
    done: false,
    paused: false,
    maxIterations: maxIterations(),
    lastText: "",
    noProgress: 0,
    startedAt: Date.now(),
    elapsed: 0,
  };
  saveGoalState();
  startTick();
  notifyUpdate();
  console.log(
    "[Goal] цель задана: " + t + " (макс. итераций " + goal.maxIterations + ")",
  );
  return { success: true, goal: getState() };
}

function stopGoal(reason) {
  cancelNudge();
  stopTick();
  const had = !!goal;
  goal = null;
  saveGoalState();
  notifyUpdate();
  if (had && reason) console.log("[Goal] остановлено: " + reason);
  return { success: true };
}

/** Пауза: заморозить таймер, прекратить авто-продвижение. */
function pauseGoal() {
  if (!goal || goal.done) return { success: false };
  cancelNudge();
  goal.paused = true;
  goal.elapsed = elapsedMs();
  goal.startedAt = 0;
  stopTick();
  saveGoalState();
  notifyUpdate();
  return { success: true, goal: getState() };
}

/** Возобновить после паузы. */
function resumeGoal() {
  if (!goal || goal.done) return { success: false };
  if (!goal.paused) return { success: true, goal: getState() };
  goal.paused = false;
  goal.startedAt = Date.now();
  saveGoalState();
  startTick();
  notifyUpdate();
  // Сразу пнуть, чтобы продолжил.
  scheduleGoalNudge();
  return { success: true, goal: getState() };
}

/** Завершение цели (вызывается по goal-done от AI или вручную). */
function onGoalDone() {
  cancelNudge();
  if (goal && !goal.done) {
    goal.done = true;
    goal.elapsed = elapsedMs();
    goal.startedAt = 0;
    stopTick();
    saveGoalState();
    notifyUpdate();
    console.log("[Goal] цель завершена (goalDone)");
  }
  return { success: true, goal: getState() };
}

/** Изменить текст текущей цели. */
function setGoalText(text) {
  if (!goal || goal.done) return { success: false };
  const t = String(text || "").trim();
  if (!t || t === goal.text) return { success: true, goal: getState() };
  goal.text = t;
  goal.lastText = "";
  goal.noProgress = 0;
  saveGoalState();
  notifyUpdate();
  return { success: true, goal: getState() };
}

// ========== Цикл автопродвижения ==========

function cancelNudge() {
  if (nudgeTimer) {
    clearTimeout(nudgeTimer);
    nudgeTimer = null;
  }
}

/** Проверка прогресса: одинаковый вывод N раундов подряд → стоп. */
function checkProgress(text) {
  if (!goal) return;
  const t = String(text || "").trim();
  if (t && t === goal.lastText) goal.noProgress = (goal.noProgress || 0) + 1;
  else goal.noProgress = 0;
  goal.lastText = t;
}

/**
 * Запланировать авто-продолжение (вызывается observer'ом после завершения
 * раунда, когда нет JS-тул-блоков).
 * @returns {boolean} запланировано ли
 */
function scheduleGoalNudge() {
  if (!isActive()) return false;
  cancelNudge();
  nudgeTimer = setTimeout(() => {
    nudgeTimer = null;
    if (!isActive()) return;

    // Предохранитель: лимит итераций.
    if (goal.maxIterations && goal.round >= goal.maxIterations) {
      goal.done = true;
      goal.elapsed = elapsedMs();
      goal.startedAt = 0;
      stopTick();
      saveGoalState();
      notifyUpdate();
      console.log("[Goal] достигнут лимит итераций, стоп");
      return;
    }
    // Предохранитель: нет прогресса.
    if ((goal.noProgress || 0) >= NO_PROGRESS_LIMIT) {
      goal.done = true;
      goal.elapsed = elapsedMs();
      goal.startedAt = 0;
      stopTick();
      saveGoalState();
      notifyUpdate();
      console.log(
        "[Goal] нет прогресса " + NO_PROGRESS_LIMIT + " раунда, стоп",
      );
      return;
    }

    goal.round++;
    saveGoalState();
    notifyUpdate();

    const chatInput = require("./chat-input");
    console.log("[Goal] авто-продвижение, итерация " + goal.round);
    chatInput.sendToChat(nudgeSendText(), "goal-nudge");
  }, NUDGE_DELAY);
  return true;
}

// ========== Таймер (для панели) ==========

function startTick() {
  if (tickTimer) return;
  tickTimer = setInterval(() => notifyUpdate(), 1000);
}

function stopTick() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

// ========== Подписка UI ==========

function onUpdate(cb) {
  onUpdateCb = cb;
}

// ========== Инициализация ==========

/** Инициализировать движок: определить сессию, загрузить состояние. */
function init() {
  currentSessionId = detectSessionId();
  loadGoalState();
  if (goal && !goal.done && !goal.paused) startTick();
  notifyUpdate();
  registerIpcListeners();
  watchSessionChanges();
  console.log(
    "[Goal] движок инициализирован, сессия=" +
      (currentSessionId || "(новая)") +
      ", цель=" +
      (goal ? goal.text : "нет"),
  );
}

/** Слушать IPC от main: goal-done (AI завершил цель). */
function registerIpcListeners() {
  try {
    const { ipcRenderer } = require("electron");
    ipcRenderer.on("goal-done", () => {
      console.log("[Goal] получен goal-done от main");
      onGoalDone();
    });
    // Управление из main (панель overlay / Telegram): stop/pause/resume.
    ipcRenderer.on("goal-control", (_e, payload) => {
      const action = (payload && payload.action) || "";
      console.log("[Goal] получена команда управления: " + action);
      if (action === "stop") stopGoal("цель остановлена извне");
      else if (action === "pause") pauseGoal();
      else if (action === "resume") resumeGoal();
    });
    // Старт цели извне (Telegram): { action:'start', text }.
    ipcRenderer.on("goal-start", (_e, payload) => {
      const text = (payload && payload.text) || "";
      if (!text) return;
      const r = startGoal(text);
      if (r.success) {
        const chatInput = require("./chat-input");
        chatInput.sendToChat(buildGoalSendText(text), "goal-start", 300);
      }
    });
  } catch (_) {}
}

/**
 * Отслеживать смену сессии (SPA-навигация) — переключать состояние цели.
 * Проверяем sessionId периодически: надёжнее, чем ловить popstate/hashchange
 * (DeepSeek меняет URL и через history.pushState).
 */
let watchTimer = null;
function watchSessionChanges() {
  if (watchTimer) return;
  watchTimer = setInterval(() => {
    const sid = detectSessionId();
    if (sid !== currentSessionId) {
      console.log(
        "[Goal] смена сессии: " +
          (currentSessionId || "(новая)") +
          " → " +
          (sid || "(новая)"),
      );
      setSession(sid);
    }
  }, 3000);
}

/** Сохранить состояние перед выгрузкой страницы. */
function saveBeforeUnload() {
  saveGoalState();
}

module.exports = {
  init,
  setSession,
  detectSessionId,
  startGoal,
  stopGoal,
  pauseGoal,
  resumeGoal,
  onGoalDone,
  setGoalText,
  scheduleGoalNudge,
  checkProgress,
  isActive,
  getState,
  buildGoalSendText,
  nudgeSendText,
  onUpdate,
  saveBeforeUnload,
  maxIterations,
  cancelNudge,
};
