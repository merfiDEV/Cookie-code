/**
 * Хранилище состояния цели (goal mode) — per-sender (окно).
 *
 * Preload — источник истины по цели; он пушит сюда актуальное состояние
 * через IPC 'goal-updated'. Main хранит копию для:
 *   - панели overlay (goal-get);
 *   - Telegram-бота (/goal — статус, уведомления о завершении).
 *
 * senderId -> { active, text, round, done, paused, maxIterations,
 *              elapsedMs, noProgress, updatedAt }
 */
const byWindow = new Map();

function set(senderId, state) {
  if (senderId == null) return;
  const prev = byWindow.get(senderId) || null;
  const next = Object.assign({}, state || {}, { updatedAt: Date.now() });
  byWindow.set(senderId, next);
  // Уведомление в Telegram при переходе active→завершено (done).
  try {
    if (prev && prev.active && !next.active && next.done) {
      const bot = require("../../botsrc");
      if (bot && typeof bot.notifyGoalDone === "function") {
        bot.notifyGoalDone(next).catch(() => {});
      }
    }
  } catch (_) {}
  return next;
}

function get(senderId) {
  return byWindow.get(senderId) || { active: false };
}

function clear(senderId) {
  byWindow.delete(senderId);
}

module.exports = { set, get, clear };
