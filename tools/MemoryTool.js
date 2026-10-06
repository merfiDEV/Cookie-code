const { Tool, ToolResult } = require("./ToolRegistry");
const memoryStore = require("../src/main/memory-store");

/**
 * memory_save — добавить одну заметку в долговременную память.
 */
class MemorySaveTool extends Tool {
  constructor() {
    super(
      "memory_save",
      "Сохранить одну заметку в долговременную память о пользователе.",
      {
        type: "object",
        properties: {
          text: {
            type: "string",
            description:
              'Короткая запись (одна мысль). Сохраняется как "- [дата] текст".',
          },
        },
        required: ["text"],
        additionalProperties: false,
      },
      "memorySave(text)",
    );
  }

  getPromptSection() {
    return {
      name: "tool:memory_save",
      order: 111,
      text: [
        "## Память — что это и когда использовать",
        "",
        "Память — это долговременный файл заметок о пользователе. В неё попадает",
        "информация о пользователе, его системе или о том, что он прямо попросил",
        "записать. Примеры:",
        "- «Мне 10 лет», «Меня зовут Иван», «Я живу в Москве» — факты о пользователе.",
        "- «У меня Windows 11, RTX 3060, VS Code, Python 3.12» — факты о его системе.",
        "- «Пиши комментарии на русском», «Не трогай папку legacy/», «Используй tabs» — устойчивые предпочтения по работе.",
        "- Любая прямая просьба: «Запомни, что…», «Сохрани в память…».",
        "",
        "Когда сохранять:",
        "- Когда пользователь прямо просит что-то запомнить — сохраняй сразу, коротко и от третьего лица (memorySave('Пользователю 10 лет')).",
        "- Когда в диалоге всплывает устойчивый факт о пользователе или его окружении, который пригодится в будущих сессиях, — сохраняй без напоминаний.",
        "- Не сохраняй временное (текущая задача, разовый путь, содержимое файла), секреты, токены, пароли.",
        "",
        "Когда читать:",
        "- Если ответ зависит от данных о пользователе/системе — сначала memoryRead().",
        "- Не вызывай memoryRead() на каждый запрос; только когда это уместно.",
        "",
        "Формат и правила:",
        '- memorySave(text) — добавляет одну строку "- [дата] текст". Одна запись — одна мысль. Без markdown-заголовков и переводов строк.',
        "- Дубликаты не создавай: если запись уже есть — пропусти или переформулируй.",
        "- memoryClear() — полная очистка. Только по прямой просьбе пользователя. Перед вызовом — предупреди.",
        "- Память не попадает в системный промпт автоматически: её содержимое видно только после явного memoryRead().",
      ].join("\n"),
    };
  }

  async execute(params) {
    const { text } = params;
    const r = memoryStore.appendMemory(text);
    if (!r.ok)
      return ToolResult.error("Не удалось сохранить в память: " + r.error);
    return ToolResult.success("Сохранено в память: " + r.entry);
  }
}

/**
 * memory_read — прочитать всю память.
 */
class MemoryReadTool extends Tool {
  constructor() {
    super(
      "memory_read",
      "Прочитать долговременную память (заметки о пользователе).",
      {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      "memoryRead()",
    );
  }

  getPromptSection() {
    return {
      name: "tool:memory_read",
      order: 112,
      text: "Вызывай memoryRead(), когда ответ зависит от данных о пользователе/его системе. Не вызывай на каждый запрос.",
    };
  }

  async execute() {
    const raw = memoryStore.readMemory();
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
      "Полностью очистить долговременную память. Только по прямой просьбе пользователя.",
      {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      "memoryClear()",
    );
  }

  getPromptSection() {
    return {
      name: "tool:memory_clear",
      order: 113,
      text: "memoryClear() удаляет все записи памяти. Используй только по прямой просьбе пользователя и предупреди его перед вызовом.",
    };
  }

  async execute() {
    const r = memoryStore.clearMemory();
    if (!r.ok)
      return ToolResult.error("Не удалось очистить память: " + r.error);
    return ToolResult.success("Память очищена.");
  }
}

module.exports = { MemorySaveTool, MemoryReadTool, MemoryClearTool };
