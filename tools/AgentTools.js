/**
 * Инструменты для работы с субагентами (agents).
 *   - run_agent  : делегировать задачу субагенту
 *   - list_agents: показать доступные субагенты (проект + пользователь)
 *   - read_agent : прочитать полный systemPrompt субагента (для отладки)
 */
const { Tool, ToolResult } = require("./ToolRegistry");
const { scanAgents } = require("../src/main/agents");

class ListAgentsTool extends Tool {
  constructor() {
    super(
      "list_agents",
      "Список доступных субагентов (проект + пользователь). Показывает name, description, tools, maxTurns.",
      {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      "list_agents()",
    );
  }
  async execute(params) {
    const agents = scanAgents(params && params.projectDir);
    if (agents.length === 0)
      return ToolResult.success("(нет доступных субагентов)");
    const text = agents
      .map((a) => {
        const t = a.tools && a.tools.length ? a.tools.join(", ") : "(все)";
        const m = a.maxTurns ? String(a.maxTurns) : "(без лимита)";
        return (
          "- " +
          a.name +
          " [" +
          a.source +
          "]\n" +
          "    description: " +
          a.description +
          "\n" +
          "    tools: " +
          t +
          "\n" +
          "    maxTurns: " +
          m +
          "\n" +
          "    path: " +
          a.agentPath
        );
      })
      .join("\n\n");
    return ToolResult.success(text);
  }
}

class ReadAgentTool extends Tool {
  constructor() {
    super(
      "read_agent",
      "Прочитать полный systemPrompt субагента по имени. Полезно для отладки определения агента.",
      {
        type: "object",
        properties: { name: { type: "string", description: "Имя субагента" } },
        required: ["name"],
        additionalProperties: false,
      },
      "read_agent(name)",
    );
  }
  async execute(params) {
    const { name, projectDir } = params || {};
    if (!name) return ToolResult.error("Поле name обязательно");
    const agent = scanAgents(projectDir || null).find((a) => a.name === name);
    if (!agent) return ToolResult.error("Субагент не найден: " + name);
    return ToolResult.success(
      "name: " +
        agent.name +
        "\n" +
        "source: " +
        agent.source +
        "\n" +
        "path: " +
        agent.agentPath +
        "\n" +
        "description: " +
        agent.description +
        "\n" +
        "tools: " +
        (agent.tools ? agent.tools.join(", ") : "(все)") +
        "\n" +
        "maxTurns: " +
        (agent.maxTurns || "(без лимита)") +
        "\n\n" +
        "--- SYSTEM PROMPT ---\n" +
        agent.systemPrompt,
    );
  }
}

module.exports = { ListAgentsTool, ReadAgentTool };
