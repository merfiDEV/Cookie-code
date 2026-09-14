/**
 * Режим плана (plan mode) — per-sender флаг.
 *
 * Пока для окна включён режим плана, изменяющие инструменты (write/edit/
 * delete/bash/pwsh/mysql/inject_js/mcp_call/skill_execute) блокируются в
 * главном процессе. Единственное исключение — запись в plan.md.
 *
 * Флаг хранится в памяти процесса (Set senderId).
 */
const path = require('path');

const active = new Set();
const PLAN_FILE = 'plan.md';

const MUTATING_TOOLS = new Set([
  'write', 'file_write', 'edit', 'file_edit', 'delete_file', 'file_delete',
  'bash', '__bash', 'pwsh',
  'mysql', 'inject_js', 'mcp_call', 'skill_execute',
]);

function setPlanMode(senderId, enabled) {
  const id = String(senderId);
  if (enabled) active.add(id);
  else active.delete(id);
}

function isPlanMode(senderId) {
  return active.has(String(senderId));
}

function clearPlanMode(senderId) {
  active.delete(String(senderId));
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
  setPlanMode, isPlanMode, clearPlanMode, isPlanFile, checkBlocked,
};
