/**
 * create_agent — создание нового субагента.
 *
 * AI создаёт специалиста под задачу: файл <projectDir>/cookie/agents/<name>.md
 * становится сразу доступен для run_agent.
 */
const { Tool, ToolResult } = require("./ToolRegistry");
const fs = require("fs");
const path = require("path");

const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_DESC = 200;
const MAX_PROMPT = 20000;

let _allowedTools = null;
function getAllowedTools() {
  if (_allowedTools) return _allowedTools;
  try {
    const { registry } = require("./index");
    _allowedTools = new Set(registry.listNames());
  } catch (_) {
    _allowedTools = new Set();
  }
  return _allowedTools;
}

function escapeYaml(str) {
  return String(str).replace(/\r?\n/g, " ").trim();
}

function buildAgentFile(input) {
  const fm = [];
  fm.push("---");
  fm.push("name: " + input.name);
  fm.push("description: " + escapeYaml(input.description));
  if (Array.isArray(input.tools) && input.tools.length > 0) {
    fm.push("tools: " + input.tools.join(", "));
  }
  if (typeof input.maxTurns === "number") {
    fm.push("maxTurns: " + input.maxTurns);
  }
  fm.push("---");
  fm.push("");
  fm.push(String(input.systemPrompt).trim());
  fm.push("");
  return fm.join("\n");
}

class CreateAgentTool extends Tool {
  constructor() {
    super(
      "create_agent",
      "Создать нового субагента (cookie/agents/<name>.md). Сразу доступен для run_agent.",
      {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Имя: латиница, цифры, дефис, _. 1..64",
          },
          description: {
            type: "string",
            description: "Когда делегировать (<=200)",
          },
          systemPrompt: {
            type: "string",
            description: "Системный промпт агента",
          },
          tools: {
            type: "array",
            items: { type: "string" },
            description: "Разрешённые инструменты (пусто = все)",
          },
          maxTurns: { type: "number", description: "Лимит шагов 1..1000" },
          overwrite: {
            type: "boolean",
            description: "Перезаписать существующего",
          },
        },
        required: ["name", "description", "systemPrompt"],
        additionalProperties: false,
      },
      "create_agent({name, description, systemPrompt, tools?, maxTurns?, overwrite?})",
    );
  }

  getPromptSection() {
    return {
      name: "tool:create_agent",
      order: 114,
      text:
        "Используй create_agent(...) чтобы создать нового субагента под задачу. " +
        "После создания агент сразу доступен для run_agent. Создавай только когда " +
        "задача повторяющаяся или требует отдельного контекста.",
    };
  }

  async execute(params) {
    const {
      name,
      description,
      systemPrompt,
      tools,
      maxTurns,
      overwrite,
      projectDir,
    } = params || {};

    if (typeof name !== "string" || !NAME_RE.test(name)) {
      return ToolResult.error(
        "Некорректное имя: латиница/цифры/дефис/_, 1..64",
      );
    }
    if (
      typeof description !== "string" ||
      !description.trim() ||
      description.length > MAX_DESC
    ) {
      return ToolResult.error("description обязателен, <= " + MAX_DESC);
    }
    if (typeof systemPrompt !== "string" || !systemPrompt.trim()) {
      return ToolResult.error("systemPrompt обязателен");
    }
    if (systemPrompt.length > MAX_PROMPT) {
      return ToolResult.error(
        "systemPrompt слишком длинный (> " + MAX_PROMPT + ")",
      );
    }

    let toolList;
    if (Array.isArray(tools) && tools.length > 0) {
      const allowed = getAllowedTools();
      const bad = [];
      toolList = [];
      for (const t of tools) {
        const s = String(t || "").trim();
        if (!s) continue;
        if (allowed.size > 0 && !allowed.has(s)) bad.push(s);
        toolList.push(s);
      }
      if (bad.length > 0) {
        return ToolResult.error("Неизвестные инструменты: " + bad.join(", "));
      }
    }

    let turns;
    if (maxTurns != null) {
      const n = Number(maxTurns);
      if (!Number.isInteger(n) || n < 1 || n > 1000) {
        return ToolResult.error("maxTurns должен быть целым 1..1000");
      }
      turns = n;
    }

    if (!projectDir) {
      return ToolResult.error(
        "Не инициализирован проект — некуда положить cookie/agents/",
      );
    }
    const agentsDir = path.join(projectDir, "cookie", "agents");
    try {
      fs.mkdirSync(agentsDir, { recursive: true });
    } catch (err) {
      return ToolResult.error("Не удалось создать каталог: " + err.message);
    }
    const filePath = path.join(agentsDir, name + ".md");
    if (fs.existsSync(filePath) && overwrite !== true) {
      return ToolResult.error(
        "Агент уже существует: " + name + ". Укажи overwrite: true для замены.",
      );
    }

    const fileText = buildAgentFile({
      name,
      description: description.trim(),
      tools: toolList,
      maxTurns: turns,
      systemPrompt: systemPrompt.trim(),
    });

    try {
      fs.writeFileSync(filePath, fileText, "utf-8");
    } catch (err) {
      return ToolResult.error("Запись не удалась: " + err.message);
    }

    try {
      const windowState = require("../src/main/window");
      const { scanAgents, buildAgentsSection } = require("../src/main/agents");
      const agents = scanAgents(projectDir);
      const section = buildAgentsSection(agents);
      const win = windowState.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("agents-section-updated", section);
      }
    } catch (_) {}

    const rel = path.relative(projectDir, filePath).replace(/\\/g, "/");
    const lines = [];
    lines.push("Создан агент: " + name);
    lines.push("Путь: " + rel);
    lines.push(
      "tools: " + (toolList && toolList.length ? toolList.join(", ") : "(все)"),
    );
    lines.push("maxTurns: " + (turns || "(без лимита)"));
    lines.push("");
    lines.push('Теперь можно вызвать: run_agent("' + name + '", "<задача>")');
    return ToolResult.success(lines.join("\n"));
  }
}

module.exports = { CreateAgentTool };
