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

/**
 * Собрать текст инструкции для create_agent.
 * Список инструментов берётся из реестра — не хардкодится.
 */
function buildAgentInstruction() {
  // Категории инструментов. Ключ — заголовок, значение — массив имён из реестра.
  // Всё, что не попало ни в одну категорию, будет выведено в «Прочее».
  const CATEGORIES = [
    ["Чтение", ["read", "read_lines", "file_read"]],
    ["Запись", ["write", "file_write", "edit", "file_edit"]],
    ["Удаление", ["file_delete"]],
    ["Поиск", ["glob", "file_glob", "grep", "file_grep"]],
    ["Команды", ["bash", "pwsh"]],
    ["Задачи", ["todo_write", "todo_edit", "todo_delete"]],
    ["Web / браузер", ["web_fetch", "open_browser_window", "inject_js", "inject_page_js"]],
    ["Данные", ["mysql", "city_time"]],
    ["MCP", ["mcp_call", "mcp_list_servers", "mcp_get_tools"]],
    ["Skill", ["skill_list", "skill_load", "skill_execute"]],
    ["UI и файлы", ["ask_user_question", "read_photo", "attach_file", "attach_telegram"]],
    ["Память", ["memory_save", "memory_read", "memory_clear"]],
    ["Plan", ["exit_plan_mode"]],
    ["Субагенты", ["run_agent", "list_agents", "read_agent", "create_agent"]],
  ];

  // Все доступные инструменты (из реестра).
  let allNames = [];
  try {
    const { registry } = require("./index");
    allNames = registry.listNames();
  } catch (_) {}
  const allSet = new Set(allNames);

  // Собираем секции: только реально существующие инструменты.
  const used = new Set();
  const lines = [];
  for (const [label, names] of CATEGORIES) {
    const present = names.filter((n) => allSet.has(n));
    if (present.length === 0) continue;
    present.forEach((n) => used.add(n));
    lines.push("**" + label + ":** " + present.map((n) => "`" + n + "`").join(", "));
  }
  // Остальные — в «Прочее».
  const rest = allNames.filter((n) => !used.has(n));
  if (rest.length > 0) {
    lines.push("**Прочее:** " + rest.map((n) => "`" + n + "`").join(", "));
  }
  const toolsBlock = lines.join("\n");

  // Инструкция. Список инструментов вставляем динамически.
  return [
    "## create_agent — создание субагента",
    "",
    "Используй create_agent(...) когда задача повторяющаяся, требует отдельного",
    "контекста или специализации. После создания агент **сразу** доступен для",
    "run_agent по имени.",
    "",
    "### Обязательные поля",
    "",
    "- **name** — латиница, цифры, дефис или подчёркивание, 1..64 символов.",
    "  Короткое и говорящее: code-reviewer, pro-lua, sql-doctor, test-runner.",
    "  Без пробелов и кириллицы. Имя = имя файла <name>.md.",
    "- **description** — одна строка (<=200), «КОГДА делегировать». Это",
    "  единственное, что видит родительский AI в системном промпте. Пиши",
    "  как триггер: «Проверка качества кода. Использовать после написания».",
    "- **systemPrompt** — тело промпта агента (без frontmatter — он генерится",
    "  автоматически). Это то, КЕМ агент является и КАК работает. Структура:",
    "  1. Роль: «Ты — эксперт по ревью / DBA / технический писатель...»",
    "  2. Что делает: список конкретных действий.",
    "  3. Как работает: шаги, edge-cases, принципы.",
    "  4. Формат ответа: что вернуть родителю (структура, объём).",
    "  5. Жёсткие правила: чего НЕ делать.",
    "",
    "### Опциональные поля",
    "",
    "- **tools** — массив ТОЧНЫХ имён инструментов из списка ниже. Если не",
    "  указывать — агенту разрешены ВСЕ (обычно не то, что нужно: давать",
    "  доступ к bash/mysql/file_delete стоит только если агент с ними работает).",
    "  Опечатка в имени = ошибка создания. Регистр важен.",
    "- **maxTurns** — лимит шагов (1..1000). Один шаг = одно сообщение AI с",
    "  cuckoo-блоками. Ориентиры: 5 — простая задача, 20 — стандарт,",
    "  40+ — много git/серверных операций. Не указывай — без лимита.",
    "- **overwrite** — перезаписать существующего (по умолчанию false).",
    "",
    "### Доступные инструменты (используй ТОЧНЫЕ имена)",
    "",
    toolsBlock,
    "",
    "⚠ Не давай агенту run_agent — во время выполнения он заблокирован",
    "(anti-recursion), но лучше не включать его в whitelist.",
    "",
    "### Примеры whitelist",
    "",
    "Только чтение (безопасный):  read, read_lines, glob, grep",
    "Пишущий (рефакторинг):       read, edit, write, glob, grep, bash",
    "Git-мастер:                  read, read_lines, bash, grep, glob",
    "Тестировщик:                 read, read_lines, bash, glob, grep",
    "",
    "### Жёсткие правила",
    "",
    "1. Не давай bash/pwsh/mysql/file_delete без реальной необходимости —",
    "   принцип наименьших привилегий.",
    "2. description обязателен — без него агент будет пропущен сканером.",
    "3. systemPrompt — это инструкция для ДРУГОГО AI, не для пользователя.",
    "   Пиши во втором лице: «Ты — ...», «Твоя задача — ...».",
    "4. Не создавай агента «на всякий случай» — только когда задача",
    "   повторяющаяся или требует отдельного контекста.",
    "5. Не забывай overwrite: true при обновлении существующего агента.",
    "",
    "### После создания",
    "",
    "Агент сразу доступен — вызывай run_agent(name, task) в том же ответе.",
    "Проверить список: list_agents(). Прочитать промпт: read_agent(name).",
  ].join("\n");
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
    // Жирная инструкция + ДИНАМИЧЕСКИЙ список инструментов из реестра.
    // При добавлении нового tool'а инструкция обновится сама.
    return {
      name: "tool:create_agent",
      order: 114,
      text: buildAgentInstruction(),
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
