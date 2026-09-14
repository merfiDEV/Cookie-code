/**
 * Сбор diff для slash-команды /review.
 * Модуль не зависит от DOM, чтобы сборку контекста можно было тестировать отдельно.
 */

const { REVIEW_PROMPT } = require('./registry');

const MAX_FILE_DIFF = 20000;
const MAX_TOTAL_DIFF = 80000;

/**
 * Собирает diff изменённых файлов через публичный preload API.
 * @param {{gitStatus: Function, gitDiffFile: Function}} api
 * @returns {Promise<{diff: string, reason?: string}>}
 */
async function collectReviewDiff(api) {
  if (!api || typeof api.gitStatus !== 'function' || typeof api.gitDiffFile !== 'function') {
    return { diff: '', reason: 'Git API недоступен' };
  }

  let status;
  try {
    status = await api.gitStatus();
  } catch (err) {
    return { diff: '', reason: err.message || 'Не удалось получить git status' };
  }

  if (!status || !status.success) {
    return { diff: '', reason: status && status.reason || 'Не удалось получить git status' };
  }

  const files = Array.isArray(status.files) ? status.files : [];
  if (files.length === 0) return { diff: '', reason: 'Изменённых файлов нет' };

  const chunks = [];
  let totalLength = 0;
  for (const file of files) {
    if (!file || !file.path || totalLength >= MAX_TOTAL_DIFF) continue;
    try {
      const result = await api.gitDiffFile(file.path, file.status);
      if (!result || !result.success || !result.diff) continue;
      const remaining = MAX_TOTAL_DIFF - totalLength;
      const text = String(result.diff).slice(0, Math.min(MAX_FILE_DIFF, remaining));
      chunks.push('===== ' + file.path + ' =====\n' + text);
      totalLength += text.length;
    } catch (_) {
      // Один недоступный файл не должен отменять ревью остальных изменений.
    }
  }

  if (chunks.length === 0) return { diff: '', reason: 'Не удалось получить diff изменённых файлов' };
  return { diff: chunks.join('\n\n') };
}

/**
 * Формирует сообщение для AI на китайском языке.
 * @param {{diff: string, reason?: string}} result
 * @returns {string}
 */
function buildReviewPrompt(result) {
  const value = result && result.diff
    ? result.diff
    : '[无法获取 diff：' + ((result && result.reason) || '未知原因') + ']';
  return REVIEW_PROMPT + '\n\n以下是本次 review 的实际 diff：\n\n```diff\n' + value + '\n```';
}

module.exports = {
  MAX_FILE_DIFF,
  MAX_TOTAL_DIFF,
  collectReviewDiff,
  buildReviewPrompt,
};