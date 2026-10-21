/**
 * Гейт правил (.cookie/rules.md).
 *
 * Пока сессия не вызвала readrules, блокируются все инструменты, кроме
 * разрешённого белого списка. Ключ — senderId + sessionId (как в plan-mode).
 *
 * Саб-агенты НЕ блокируются: JsRunner не применяет гейт, если задан agentName.
 */
const ALLOWED_BEFORE_RULES = new Set([
  "read",
  "read_lines",
  "file_read",
  "memory_read",
  "readrules",
]);

const unlocked = new Set();

function keyOf(senderId, sessionId) {
  return String(senderId) + "::" + (sessionId || "new");
}

function isLocked(senderId, sessionId) {
  return !unlocked.has(keyOf(senderId, sessionId));
}

function unlock(senderId, sessionId) {
  unlocked.add(keyOf(senderId, sessionId));
}

function lock(senderId, sessionId) {
  unlocked.delete(keyOf(senderId, sessionId));
}

/**
 * Проверить, заблокирован ли инструмент до принятия правил.
 * @param {string} op — имя инструмента (внутренние алиасы уже нормализованы)
 * @param {number|string} [senderId]
 * @param {string|null} [sessionId]
 * @returns {{blocked: boolean, error?: string}}
 */
function checkBlocked(op, senderId, sessionId) {
  const name = String(op || "");
  if (ALLOWED_BEFORE_RULES.has(name)) return { blocked: false };
  // Гейт активен только для реальных окон (senderId — числовой Electron id).
  // Тестовые/служебные вызовы (строковый или отсутствующий senderId) не блокируем.
  if (typeof senderId !== "number") {
    return { blocked: false };
  }
  // Сессия уже приняла правила — не блокируем.
  if (!isLocked(senderId, sessionId)) {
    return { blocked: false };
  }
  return {
    blocked: true,
    error:
      "Правила проекта ещё не приняты. Сначала прочитай память (memoryRead) " +
      "и вызови readrules(), чтобы принять правила (.cookie/rules.md). " +
      "До этого разрешены только read/read_lines/file_read/memory_read/readrules.",
  };
}

module.exports = {
  ALLOWED_BEFORE_RULES,
  keyOf,
  isLocked,
  unlock,
  lock,
  checkBlocked,
};
