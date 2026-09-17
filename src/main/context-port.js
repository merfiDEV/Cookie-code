/**
 * Context Port — перенос контекста из старого чата DeepSeek в новый.
 *
 * Прямого API у DeepSeek нет, поэтому перенос идёт через DOM:
 *   1) в старом чате читаем историю и кладём её сюда (IPC context-port:start);
 *   2) навигацией на homeUrl открываем новый чат (перезагрузка страницы);
 *   3) в новом чате preload забирает историю (IPC context-port:take),
 *      просит модель сжать её в конспект, кладёт конспект сюда (context-port:summary);
 *   4) снова новый чат → preload забирает конспект и вставляет его как контекст.
 *
 * Хранилище — in-memory, привязано к webContents.id. Переживает reload
 * страницы (в отличие от состояния preload), но не переживает закрытие окна.
 */
const store = new Map(); // webContentsId -> { stage, history, summary, createdAt }

const TTL_MS = 10 * 60 * 1000; // 10 минут

/**
 * Положить данные для окна.
 */
function set(webContentsId, data) {
  store.set(webContentsId, {
    stage: data.stage || "history",
    history: data.history || "",
    summary: data.summary || "",
    // Промпт инициализации проекта (дерево каталога + системный промпт),
    // переносится вместе с контекстом, чтобы новый чат «знал» проект.
    initPrompt: data.initPrompt || "",
    createdAt: Date.now(),
  });
}

/**
 * Забрать данные для окна (без удаления — этапов может быть несколько).
 */
function get(webContentsId) {
  const entry = store.get(webContentsId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(webContentsId);
    return null;
  }
  return entry;
}

/**
 * Очистить данные окна.
 */
function clear(webContentsId) {
  store.delete(webContentsId);
}

module.exports = { set, get, clear };
