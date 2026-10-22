const path = require("path");
const fs = require("fs");
const { Tool, ToolResult } = require("./ToolRegistry");
const rulesGate = require("../src/main/rules-gate");

const RULES_DIR = ".cookie";
const RULES_FILE = "rules.md";

class ReadRulesTool extends Tool {
  constructor() {
    super(
      "readrules",
      "Прочитать правила проекта (.cookie/rules.md) и принять их — разблокирует инструменты в текущей сессии.",
      {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      "readrules()",
    );
  }

  getPromptSection() {
    return {
      name: "tool:readrules",
      order: 5,
      text: [
        "## Правила проекта (readrules)",
        "",
        "В начале работы прочитай память (memoryRead) и правила проекта.",
        "Если ты принимаешь правила — вызови readrules(). Это разблокирует инструменты в текущей сессии.",
        "Правила лежат в .cookie/rules.md (относительно корня проекта).",
        "Если файла правил нет — readrules всё равно разблокирует и сообщит, что правил нет.",
      ].join("\n"),
    };
  }

  async execute(params) {
    const projectDir = params && params.projectDir ? params.projectDir : null;
    const senderId = params && params.senderId;
    const sessionId = params && params.sessionId;

    let content = "";
    let found = false;
    if (projectDir) {
      const filePath = path.join(projectDir, RULES_DIR, RULES_FILE);
      try {
        if (fs.existsSync(filePath)) {
          content = fs.readFileSync(filePath, "utf-8");
          found = true;
        }
      } catch (err) {
        // файл есть, но не читается — считаем «правил нет», но не падаем
        found = false;
      }
    }

    // Снимаем блокировку для текущей сессии.
    try {
      rulesGate.unlock(senderId, sessionId);
    } catch (_) {}

    if (!found || !content.trim()) {
      return ToolResult.success(
        "Правил нет (.cookie/rules.md отсутствует или пуст). Инструменты разблокированы.",
      );
    }
    return ToolResult.success(
      "Правила приняты, инструменты разблокированы.\n\n" + content,
    );
  }
}

module.exports = { ReadRulesTool };
