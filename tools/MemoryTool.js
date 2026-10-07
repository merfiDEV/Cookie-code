const { Tool, ToolResult } = require("./ToolRegistry");
const memoryStore = require("../src/main/memory-store");

/**
 * Разрешить scope и projectDir для операции памяти.
 * По умолчанию:
 *   - save/clear: project, если projectDir задан, иначе global;
 *   - read: all.
 * Пользователь может явно указать scope ('project' | 'global' | 'all').
 * @param {object} params - параметры инструмента
 * @param {boolean} readMode - true для memory_read (поддерживает 'all')
 * @returns {{scope: string, projectDir: string|null}}
 */
function resolveScope(params, readMode) {
  const projectDir = params && params.projectDir ? params.projectDir : null;
  let scope = params && typeof params.scope === "string" ? params.scope : null;

  if (readMode) {
    if (scope !== "all" && scope !== "global" && scope !== "project") {
      scope = "all";
    }
    return { scope, projectDir };
  }

  if (scope !== "project" && scope !== "global") {
    scope = projectDir ? "project" : "global";
  }
  return { scope, projectDir };
}

/**
 * memory_save — добавить одну заметку в долговременную память.
 */
class MemorySaveTool extends Tool {
  constructor() {
    super(
      "memory_save",
      "Сохранить одну заметку в долговременную память о пользователе или о текущем проекте.",
      {
        type: "object",
        properties: {
          text: {
            type: "string",
            description:
              'Короткая запись (одна мысль). Сохраняется как "- [дата] текст".',
          },
          scope: {
            type: "string",
            enum: ["project", "global"],
            description:
              "Куда сохранить: 'project' (память проекта, <projectDir>/.cuckoo/memory/ProjectMemory.md) " +
              "или 'global' (память о пользователе). По умолчанию — project, если проект инициализирован, иначе global.",
          },
        },
        required: ["text"],
        additionalProperties: false,
      },
      "memorySave(text, scope?)",
    );
  }

  getPromptSection() {
    return {
      name: "tool:memory_save",
      order: 111,
      text: [
        "## Память — что это и когда использовать",
        "",
        "Память двух уровней:",
        "- **Проектная** — <projectDir>/.cuckoo/memory/ProjectMemory.md. Заметки о конкретном проекте:",
        "  соглашения, архитектурные решения, важные пути, стек, договорённости.",
        "- **Глобальная** — <userData>/memory.md. Общие факты о пользователе и его системе.",
        "",
        "Куда писать:",
        "- По умолчанию memorySave пишет в **проектную** память, если проект инициализирован, иначе в глобальную.",
        "- Если факт относится к пользователю/его системе (имя, ОС, GPU, предпочтения по стилю кода) —",
        "  передавай scope='global'.",
        "- Если факт относится к данному проекту (архитектура, стек, соглашения, пути) — scope='project'.",
        "- Когда пользователь прямо просит запомнить — сохраняй сразу, коротко и от третьего лица.",
        "",
        "Формат и правила:",
        '- memorySave(text, scope?) — добавляет одну строку "- [дата] текст". Одна запись — одна мысль.',
        "- Дубликаты не создавай: если запись уже есть — пропусти или переформулируй.",
        "- Не сохраняй временное (текущая задача, разовый путь, содержимое файла), секреты, токены, пароли.",
      ].join("\n"),
    };
  }

  async execute(params) {
    const { text } = params;
    const { scope, projectDir } = resolveScope(params, false);
    const r = memoryStore.appendMemory(text, { scope, projectDir });
    if (!r.ok)
      return ToolResult.error("Не удалось сохранить в память: " + r.error);
    return ToolResult.success("Сохранено в память (" + scope + "): " + r.entry);
  }
}

/**
 * memory_read — прочитать память (проектную, глобальную или обе).
 */
class MemoryReadTool extends Tool {
  constructor() {
    super(
      "memory_read",
      "Прочитать долговременную память (заметки о пользователе и/или о проекте).",
      {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["all", "project", "global"],
            description:
              "Что прочитать: 'all' (по умолчанию — проектная + глобальная), " +
              "'project' (только проектная), 'global' (только глобальная).",
          },
        },
        additionalProperties: false,
      },
      "memoryRead(scope?)",
    );
  }

  getPromptSection() {
    return {
      name: "tool:memory_read",
      order: 112,
      text: [
        "Вызывай memoryRead() перед ответом, если он зависит от данных о пользователе/системе или от соглашений проекта.",
        "По умолчанию возвращает обе памяти (проектную + глобальную). Можно указать scope='project' | 'global' | 'all'.",
        "Не вызывай memoryRead() на каждый запрос; только когда это уместно.",
        "Память не попадает в системный промпт автоматически: её содержимое видно только после явного memoryRead().",
      ].join("\n"),
    };
  }

  async execute(params) {
    const { scope, projectDir } = resolveScope(params || {}, true);
    const raw = memoryStore.readMemory({ scope, projectDir });
    if (!raw || !raw.trim()) {
      return ToolResult.success("(память пуста)");
    }
    return ToolResult.success(raw);
  }
}

/**
 * memory_clear — полностью очистить память.
 */
class MemoryClearTool extends Tool {
  constructor() {
    super(
      "memory_clear",
      "Полностью очистить долговременную память (проектную или глобальную). Только по прямой просьбе пользователя.",
      {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["project", "global"],
            description:
              "Что очистить: 'project' (память проекта) или 'global' (память о пользователе). " +
              "По умолчанию — project, если проект инициализирован, иначе global.",
          },
        },
        additionalProperties: false,
      },
      "memoryClear(scope?)",
    );
  }

  getPromptSection() {
    return {
      name: "tool:memory_clear",
      order: 113,
      text: [
        "memoryClear(scope?) удаляет все записи памяти. scope='project' | 'global';",
        "по умолчанию — проектная, если проект инициализирован, иначе глобальная.",
        "Используй только по прямой просьбе пользователя и предупреди его перед вызовом.",
      ].join("\n"),
    };
  }

  async execute(params) {
    const { scope, projectDir } = resolveScope(params || {}, false);
    const r = memoryStore.clearMemory({ scope, projectDir });
    if (!r.ok)
      return ToolResult.error("Не удалось очистить память: " + r.error);
    return ToolResult.success("Память очищена (" + scope + ").");
  }
}

module.exports = { MemorySaveTool, MemoryReadTool, MemoryClearTool };
