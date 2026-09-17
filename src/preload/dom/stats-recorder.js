/**
 * Запись статистики использования в main-процесс.
 *
 * Точки вызова:
 *   - токены: подписка на событие 'cuckoo:token-update' (token-interceptor);
 *   - сообщения: observer при завершении ответа AI (ai) и при отправке
 *     пользователем (user — через chat-input).
 *
 * sessionId берётся из URL через провайдер.
 */
const { getProviderByUrl } = require("../../../src/providers");
const state = require("./state");

let started = false;

function currentSessionId() {
  try {
    const provider = getProviderByUrl(window.location.href);
    if (provider && typeof provider.extractSessionId === "function") {
      return provider.extractSessionId(window.location.href) || "unknown";
    }
  } catch (_) {}
  return "unknown";
}

function enabled() {
  return state.statsEnabled !== false;
}

/** Записать сообщение (user / ai). */
function recordMessage(role, extra) {
  if (!enabled()) return;
  try {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.statsRecordMessage !== "function"
    )
      return;
    window.electronAPI.statsRecordMessage({
      sessionId: currentSessionId(),
      role,
      model: (extra && extra.model) || "",
      tokens: (extra && extra.tokens) || 0,
    });
  } catch (err) {
    console.warn("[Cookie Code] stats recordMessage error:", err.message);
  }
}

/** Записать дельту токенов. */
function recordTokens(tokens) {
  if (!enabled()) return;
  const tk = Number(tokens) || 0;
  if (tk <= 0) return;
  try {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.statsRecordTokens !== "function"
    )
      return;
    window.electronAPI.statsRecordTokens({
      sessionId: currentSessionId(),
      tokens: tk,
    });
  } catch (err) {
    console.warn("[Cookie Code] stats recordTokens error:", err.message);
  }
}

/** Пометить сессию (учёт активных сессий). */
function recordSession() {
  if (!enabled()) return;
  try {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.statsRecordSession !== "function"
    )
      return;
    window.electronAPI.statsRecordSession({ sessionId: currentSessionId() });
  } catch (_) {}
}

/** Запуск: подписка на токены + отметка сессии. */
function start() {
  if (started) return;
  started = true;
  window.addEventListener("cuckoo:token-update", (e) => {
    const d = (e && e.detail) || {};
    recordTokens(d.delta);
  });
  recordSession();
}

module.exports = { start, recordMessage, recordTokens, recordSession };
