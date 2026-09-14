/**
 * Режим плана (plan mode) — флаг на сессию (senderId + sessionId).
 *
 * Каждый чат (сессия) в окне имеет собственный режим плана: при переключении
 * сессии блокировка меняется вместе с ней. Пока для сессии включён режим,
 * изменяющие инструменты (write/edit/delete/bash/pwsh/mysql/inject_js/mcp_call/
 * skill_execute) блокируются в главном процессе. Исключение — запись в plan.md.
 *
 * Ключ = `${senderId}::${sessionId}`. Для нового чата (sessionId ещё нет)
 * используется суффикс 'new'. Флаг хранится в памяти процесса.
 */
const path = require('path');

const active = new Set();
const PLAN_FILE = 'plan.md';

const MUTATING_TOOLS = new Set([
  'write', 'file_write', 'edit', 'file_edit', 'delete_file', 'file_delete',
  'bash', '__bash', 'pwsh',
  'mysql', 'inject_js', 'mcp_call', 'skill_execute',
]);

/**
 * Ключ режима плана: senderId + sessionId.
 * @param {number|string} senderId
 * @param {string|null} sessionId
 * @returns {string}
 */
function keyOf(senderId, sessionId) {
  return String(senderId) + '::' + (sessionId || 'new');
}

function setPlanMode(senderId, sessionId, enabled) {
  const key = keyOf(senderId, sessionId);
  if (enabled) active.add(key);
  else active.delete(key);
}

function isPlanMode(senderId, sessionId) {
  return active.has(keyOf(senderId, sessionId));
}

function clearPlanMode(senderId, sessionId) {
  active.delete(keyOf(senderId, sessionId));
}

function isPlanFile(filePath) {
  if (!filePath) return false;
  return path.basename(String(filePath).replace(/\\/g, '/')) === PLAN_FILE;
}

function checkBlocked(op, args) {
  const name = String(op || '');
  if (!MUTATING_TOOLS.has(name)) return { blocked: false };
  if (name === 'write' || name === 'file_write') {
    const filePath = (args && (args.file_path || args.filePath || args.path)) || '';
    if (isPlanFile(filePath)) return { blocked: false };
  }
  return {
    blocked: true,
    error:
      'Режим плана включён: изменяющие операции заблокированы. ' +
      'Запрещено редактировать/записывать файлы, запускать shell, SQL и т.п. ' +
      'Единственное исключение — запись плана в ' + PLAN_FILE + '. ' +
      'Заверши план и вызови exit_plan_mode().',
  };
}

module.exports = {
  PLAN_FILE, MUTATING_TOOLS,
  keyOf, setPlanMode, isPlanMode, clearPlanMode, isPlanFile, checkBlocked,
};
