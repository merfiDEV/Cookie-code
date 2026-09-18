const { BrowserWindow } = require("electron");

class BrowserWindowManager {
  constructor() {
    this.windows = new Map();
    this.nextAutoId = 1;
  }

  openWindow(customId, url, options = {}) {
    let id;
    if (customId) {
      if (this.windows.has(customId)) {
        throw new Error(
          `窗口 ID "${customId}" 已存在，请换一个 ID 或复用现有窗口`,
        );
      }
      id = customId;
    } else {
      do {
        id = `win-${this.nextAutoId++}`;
      } while (this.windows.has(id));
    }

    const win = new BrowserWindow({
      width: options.width || 1200,
      height: options.height || 800,
      ...options,
    });

    // 设置与主窗口一致的 Chrome 130 普通 UA，避免暴露 Electron 标识
    const userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    win.webContents.setUserAgent(userAgent);

    if (url) win.loadURL(url);
    this.windows.set(id, win);
    win.on("closed", () => this.windows.delete(id));
    return id;
  }

  async injectJS(id, jsCode) {
    const win = this.windows.get(id);
    if (!win) throw new Error(`窗口 ID "${id}" 不存在`);
    const res = await this.executeInWebContents(win.webContents, jsCode, {
      throwOnError: true,
    });
    return res.value;
  }

  /**
   * Выполнить JS в main world указанного webContents (то, что видит страница).
   * Общая логика обёртки кода: поддержка return-блоков и выражений (IIFE).
   */
  async executeInWebContents(webContents, jsCode, options = {}) {
    const throwOnError = options.throwOnError !== false;
    if (!webContents) throw new Error("webContents не передан");

    // Выбираем форму обёртки:
    //  - «блок» — если код содержит return или начинается с ключевого слова
    //    (const/let/var/if/for/while/await/...) или занимает несколько строк.
    //    Тогда return в любом месте работает, а ошибки ловит try/catch.
    //  - «выражение» — одиночная строка-выражение (например IIFE), её await-им.
    const trimmed = jsCode.trim();
    const looksLikeBlock =
      /(^|[\s;{(])return\b/.test(jsCode) ||
      /^(const|let|var|if|for|while|do|switch|try|throw|await|function|class)\b/.test(
        trimmed,
      ) ||
      trimmed.includes("\n");

    // Предварительная проверка синтаксиса (ошибки парсинга не ловятся try/catch).
    try {
      new Function(
        looksLikeBlock
          ? "return (async () => {\n" + jsCode + "\n})"
          : "return (async () => (\n" + jsCode + "\n))",
      );
    } catch (err) {
      throw new Error(`JS 语法错误: ${err.message}`);
    }

    let wrapped;
    if (looksLikeBlock) {
      wrapped = `(async () => {
  try {
    const __result = await (async () => {
${jsCode}
    })();
    return { ok: true, value: __result };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
})()`;
    } else {
      wrapped = `(async () => {
  try {
    const __result = await (${jsCode});
    return { ok: true, value: __result };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
})()`;
    }
    const result = await webContents.executeJavaScript(wrapped, true);
    if (result && result.ok === false) {
      if (throwOnError) throw new Error(result.error);
      return { ok: false, error: result.error };
    }
    return { ok: true, value: result ? result.value : undefined };
  }

  getWindow(id) {
    const win = this.windows.get(id);
    if (!win) throw new Error(`窗口 ID "${id}" 不存在`);
    return win;
  }

  getAllWindowIds() {
    return Array.from(this.windows.keys());
  }

  closeWindow(id) {
    const win = this.getWindow(id);
    win.close();
    this.windows.delete(id);
  }
}

module.exports = new BrowserWindowManager();
