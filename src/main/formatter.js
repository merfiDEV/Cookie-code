/**
 * Обёртка над format-registry: проверяет флаг formattersEnabled в настройках
 * и запускает форматтер для файла.
 *
 * Все ошибки глушатся — форматирование опционально и не должно ломать write/edit.
 */
const path = require('path');
const settingsStore = require('./settings-store');
const { formatFile } = require('./format-registry');

let _enabledCache = null;

/**
 * Проверить, включены ли автоформаттеры (с кэшем на 5 сек).
 * Отдельная функция (для тестов) — без кэша.
 */
function isEnabled() {
  try {
    const s = settingsStore.readSettings();
    return s.formattersEnabled !== false;
  } catch (_) {
    return true;
  }
}

/**
 * Форматировать файл после записи/правки.
 * @param {string} resolvedPath — абсолютный путь к записанному файлу
 * @param {string} projectDir    — абсолютный путь к корню проекта
 * @returns {Promise<void>}
 */
async function formatAfterWrite(resolvedPath, projectDir) {
  if (!resolvedPath || !projectDir) return;
  if (!isEnabled()) return;
  try {
    await formatFile(resolvedPath, projectDir);
  } catch (err) {
    // Никогда не пробрасываем — это вторичная операция.
    console.warn('[formatter] unexpected error:', err && err.message);
  }
}

module.exports = { formatAfterWrite, isEnabled };
