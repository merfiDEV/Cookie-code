const { Tool, ToolResult } = require("./ToolRegistry");

/**
 * generate_commit_message — вставляет готовое сообщение коммита в поле ввода
 * на странице Git (textarea «Сообщение коммита»).
 *
 * Поток: пользователь жмёт кнопку «Сгенерировать с ИИ» → в чат летит промпт
 * → модель получает diff (git status + git diff через bash) → формулирует
 * Conventional Commits → вызывает этот инструмент с параметром message →
 * текст появляется в textarea коммита на странице Git.
 */
class GenerateCommitMessageTool extends Tool {
  constructor() {
    super(
      "generate_commit_message",
      "Вставить готовое сообщение коммита в поле ввода на странице Git. " +
        "Используй после того, как получил diff (git status + git diff) и " +
        "сформулировал Conventional Commits: передай текст в параметре " +
        "message — инструмент вставит его в textarea «Сообщение коммита» " +
        "на странице Git. Не коммитит и не пушит.",
      {
        type: "object",
        properties: {
          message: {
            type: "string",
            description:
              "Готовое сообщение коммита (Conventional Commits, одна строка ≤72 символа, без markdown и кавычек).",
          },
        },
        required: ["message"],
        additionalProperties: false,
      },
      "generateCommitMessage(message)",
    );
  }

  getPromptSection() {
    return {
      name: "tool:generate_commit_message",
      order: 130,
      text:
        "Инструмент generate_commit_message(message) вызывай, когда " +
        "пользователь просит сгенерировать сообщение коммита (или нажал " +
        "кнопку «Сгенерировать с ИИ» на странице Git). " +
        'Порядок: (1) получи diff — bash("git status --short && git diff"); ' +
        "(2) сформулируй Conventional Commits (feat/fix/refactor/docs/chore/" +
        "style/test/build/ci/perf/revert), одна строка ≤72 символа, без " +
        "markdown и кавычек; (3) вызови generate_commit_message(message) — " +
        "он вставит текст в поле коммита на странице Git.",
    };
  }

  async execute(params = {}) {
    const message = String(params.message || "").trim();
    if (!message) {
      return ToolResult.error(
        "Параметр message обязателен — передай готовое сообщение коммита.",
      );
    }

    try {
      const windowState = require("../src/main/window");
      const ctx =
        (windowState.getMainContext && windowState.getMainContext()) || null;
      if (!ctx || !ctx.win || ctx.win.isDestroyed()) {
        return ToolResult.error(
          "Главное окно не найдено — некуда вставить текст.",
        );
      }
      ctx.win.webContents.send("shell-fill-commit-message", { message });
      console.log("[GenerateCommitMessageTool] inserted: " + message);
      return ToolResult.success(
        "Сообщение вставлено в поле коммита: " + message,
      );
    } catch (err) {
      return ToolResult.error(
        "Не удалось вставить сообщение в поле коммита: " + err.message,
      );
    }
  }
}

module.exports = { GenerateCommitMessageTool };
