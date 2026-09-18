const { Tool, ToolResult } = require("./ToolRegistry");
const windowManager = require("./browser-window-manager");

/**
 * Инструмент inject_page_js: выполнить JS в main world страницы (то, что видно
 * в DevTools/F12). По умолчанию — в главном окне (там, где идёт чат с AI);
 * опционально можно указать windowId окна, открытого через open_browser_window.
 *
 * Контекст — main world страницы: доступны DOM, window.*, localStorage,
 * performance, fetch от имени страницы. window.electronAPI (IPC Cookie Code)
 * в этом контексте НЕ доступен.
 */
class InjectPageJSTool extends Tool {
  constructor() {
    super(
      "inject_page_js",
      "Выполнить JS в main world страницы (как в DevTools/F12). По умолчанию — в главном окне с чатом; вернёт значение, которое вернул код (JSON-совместимое).",
      {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "JS-код. Либо блок со return в начале, либо выражение (например IIFE). Поддерживается await. Результат должен быть JSON-совместимым.",
          },
          windowId: {
            type: "string",
            description:
              "Опционально: ID окна, открытого через open_browser_window. Если не указан — используется главное окно.",
          },
        },
        required: ["code"],
        additionalProperties: false,
      },
      "injectPageJS(code, windowId?)",
    );
  }

  getPromptSection() {
    return {
      name: "tool:inject_page_js",
      order: 114,
      text:
        "使用 injectPageJS(code, windowId?) 在当前 странице (main world, как в F12) выполнить JS и получить результат. " +
        "Без windowId — главное окно с чатом; с windowId — окно из open_browser_window. " +
        "Доступны DOM/window/localStorage страницы, но НЕ window.electronAPI. " +
        "code: либо блок с return в начале, либо выражение (например IIFE); поддерживается await. " +
        "Результат должен быть JSON-совместимым. Удобно для сбора данных со страницы: тексты, ссылки, элементы, localStorage и т.п.",
    };
  }

  async execute(params) {
    const { code, windowId } = params;
    if (!code || typeof code !== "string") {
      return ToolResult.error("参数 code обязателен и должен быть строкой");
    }

    let webContents;
    if (windowId) {
      try {
        const win = windowManager.getWindow(windowId);
        webContents = win.webContents;
      } catch (err) {
        return ToolResult.error(err.message);
      }
    } else {
      // Ленивый require, чтобы не тянуть main-модуль на этапе регистрации.
      const windowState = require("../src/main/window");
      const mainWin = windowState.getMainWindow();
      if (!mainWin || mainWin.isDestroyed()) {
        return ToolResult.error("Главное окно недоступно");
      }
      webContents = mainWin.webContents;
    }

    const result = await windowManager.executeInWebContents(webContents, code, {
      throwOnError: false,
    });
    if (result && result.ok === false) {
      return ToolResult.error(result.error);
    }
    return ToolResult.success(result ? result.value : undefined);
  }
}

module.exports = { InjectPageJSTool };
