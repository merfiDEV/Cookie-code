/**
 * Секция "Доступные субагенты" для системного промпта.
 *
 * Прогрессивное раскрытие: только name + description. Как именно вызывать —
 * описано в prompt-section самого инструмента run_agent.
 */

function formatAgentLine(a) {
  return "- " + a.name + "：" + a.description;
}

/**
 * Собрать секцию. Пустой список -> пустая строка (не занимает промпт).
 * @param {Array<{name:string, description:string}>} agents
 * @returns {string}
 */
function buildAgentsSection(agents) {
  const list = Array.isArray(agents) ? agents : [];
  if (list.length === 0) return "";
  const lines = [];
  lines.push("## Доступные субагенты (Agents)");
  lines.push("");
  lines.push(
    "Когда задача подходит для делегирования, вызови run_agent(name, task),",
  );
  lines.push(
    "чтобы передать её соответствующему субагенту. Субагент работает в отдельном",
  );
  lines.push("контексте и возвращает только итоговое резюме.");
  lines.push(
    "Подходит для делегирования: широкий поиск/анализ, независимые подзадачи —",
  );
  lines.push("чтобы не засорять текущий контекст.");
  lines.push("");
  for (const a of list) lines.push(formatAgentLine(a));
  lines.push("");
  return lines.join("\n");
}

module.exports = { buildAgentsSection };
