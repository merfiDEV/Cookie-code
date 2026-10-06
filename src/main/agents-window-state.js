/**
 * Определение «окно является субагентом» — для защиты от рекурсии.
 * Достаётся из windowState (поле isSubagent в контексте окна).
 */
const windowState = require("./window");

function isSubagentWindow(windowId) {
  const ctx = windowState.getWindowContext(windowId);
  return !!(ctx && ctx.isSubagent);
}

module.exports = { isSubagentWindow };
