/**
 * run_agent — делегирование задачи субагенту.
 *
 * Субагент работает в отдельном окне (тот же partition → общая сессия DeepSeek),
 * в изолированном контексте, и возвращает только итоговый текст.
 *
 * Раннер и определитель «окно-субагент» инжектируются из main-процесса
 * (см. src/main/index.js): так tools-слой не зависит от main-слоя.
 */
const { Tool, ToolResult } = require("./ToolRegistry");
const { scanAgents } = require("../src/main/agents");

/** @type {(args:{agent:any, task:string, currentWindowId:number}) => Promise<string>|null} */
let _runner = null;
/** @type {(windowId:number) => boolean|null} */
let _isSubagentWindow = null;

function injectAgentRunner(fn) {
  _runner = fn;
}
function injectSubagentChecker(fn) {
  _isSubagentWindow = fn;
}

class RunAgentTool extends Tool {
  constructor() {
    super(
      "run_agent",
      "Делегировать задачу субагенту (независимый контекст). Возвращает итоговое резюме. Подходит для широкого поиска/анализа и независимых подзадач — чтобы не засорять текущий контекст.",
      {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Имя субагента (см. раздел «Доступные субагенты» в системном промпте)",
          },
          task: {
            type: "string",
            description: "Описание задачи для делегирования",
          },
        },
        required: ["name", "task"],
        additionalProperties: false,
      },
      "run_agent(name, task)",
    );
  }

  getPromptSection() {
    return {
      name: "tool:run_agent",
      order: 113,
      text:
        "Используй run_agent(name, task), чтобы делегировать задачу субагенту. " +
        "Субагент работает в отдельном контексте и возвращает только итоговое резюме.",
    };
  }

  async execute(params) {
    const { name, task, projectDir, currentWindowId } = params;
    if (!name || !task) return ToolResult.error("Поля name и task обязательны");
    if (typeof currentWindowId !== "number")
      return ToolResult.error("Отсутствует контекст окна (currentWindowId)");

    // Защита от рекурсии: окно-субагент не может вызвать run_agent
    try {
      if (_isSubagentWindow && _isSubagentWindow(currentWindowId)) {
        return ToolResult.error(
          "Субагент не может вызывать run_agent (защита от рекурсии)",
        );
      }
    } catch (_) {}

    const agents = scanAgents(projectDir || null);
    const agent = agents.find((a) => a.name === name);
    if (!agent) return ToolResult.error("Субагент не найден: " + name);

    if (!_runner)
      return ToolResult.error("Раннер субагентов не инициализирован");

    try {
      const text = await _runner({ agent, task, currentWindowId, projectDir });
      return ToolResult.success(text);
    } catch (err) {
      return ToolResult.error(
        "Ошибка выполнения субагента: " + (err && err.message),
      );
    }
  }
}

module.exports = { RunAgentTool, injectAgentRunner, injectSubagentChecker };
