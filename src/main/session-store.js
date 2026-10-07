/**
 * 会话-目录映射持久化存储 + URL 会话检测（每 profile 独立实例）
 * 由原 session-store.js 改造：从单例改为工厂函数，每个 profile 拥有独立存储文件和状态。
 */
const fs = require("fs");
const path = require("path");
const { getProviderByUrl } = require("../providers");

/**
 * 创建 profile 专属的 session store 实例
 * @param {string} profileId profile id
 * @param {string} storeDir 存储目录（通常是 userData）
 * @param {object} windowState window 管理模块引用
 */
function createSessionStore(profileId, storeDir, windowState) {
  const STORE_FILE = path.join(
    storeDir,
    "session-dir-map-" + profileId + ".json",
  );

  function readSessionStore() {
    try {
      if (fs.existsSync(STORE_FILE)) {
        return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
      }
    } catch (err) {
      console.error("[Cookie Code] 读取会话存储失败:", err.message);
    }
    return {};
  }

  function writeSessionStore(store) {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
      console.log("[Cookie Code] 会话存储已保存:", STORE_FILE);
    } catch (err) {
      console.error("[Cookie Code] 写入会话存储失败:", err.message);
    }
  }

  function getProjectDirBySessionId(sessionId) {
    if (!sessionId) return null;
    const store = readSessionStore();
    return store[sessionId] || null;
  }

  function saveSessionDirMapping(sessionId, projectDir) {
    if (!sessionId) return;
    const store = readSessionStore();
    store[sessionId] = projectDir;
    writeSessionStore(store);
  }

  function extractSessionIdFromUrl(url) {
    if (!url) return null;
    // 平台 provider 优先（DeepSeek /chat/s/ 等）
    try {
      const provider = getProviderByUrl(url);
      if (provider && typeof provider.extractSessionId === "function") {
        const sid = provider.extractSessionId(url);
        if (sid) return sid;
      }
    } catch (_) {
      /* provider 异常时回退旧逻辑 */
    }
    // DeepSeek: https://chat.deepseek.com/a/chat/s/xxx
    const match = url.match(/\/chat\/s\/([a-f0-9-]+)/i);
    if (match) return match[1];
    const altMatch = url.match(/\/s\/([a-f0-9-]+)/i);
    return altMatch ? altMatch[1] : null;
  }

  const state = {
    currentSessionId: null,
    selectedProjectDir: null,
    pendingProjectDir: null,
    // Последний известный каталог проекта для профиля.
    // Нужен как fallback, когда selectedProjectDir сброшен при навигации
    // (например, при переносе контекста в новый чат).
    lastProjectDir: null,
  };

  function handleUrlChange(url, targetWindow) {
    const sessionId = extractSessionIdFromUrl(url);
    const win = targetWindow || (windowState && windowState.getMainWindow());

    if (sessionId) {
      state.currentSessionId = sessionId;
      console.log("[Cookie Code][" + profileId + "] 当前会话ID: " + sessionId);

      // Авто-переименование чата субагента: как только появился sessionId
      // и в state лежит pendingLineage (kind=subagent) — переименовываем
      // чат в "[SUB-AGENT] <agentName>" через IPC rename-session.
      // Откладываем на 3 сек, чтобы страница успела отрисовать сайдбар
      // и DeepSeek зарегистрировал новую сессию в списке.
      try {
        const lin = state.pendingLineage;
        if (lin && lin.kind === "subagent" && lin.agentName) {
          const newTitle = "[SUB-AGENT] " + lin.agentName;
          const subWin = win;
          console.log(
            "[Cookie Code][" +
              profileId +
              "] Авто-переименование субагента: " +
              newTitle +
              " (" +
              sessionId +
              ")",
          );
          setTimeout(() => {
            try {
              if (!subWin || subWin.isDestroyed()) return;
              // Ищем обработчик rename-session через ipcMain.handle —
              // вызываем напрямую через webContents.executeJavaScript
              // (тот же DOM-скрипт, что в ipc.js rename-session).
              const safeId = JSON.stringify(String(sessionId));
              const safeTitle = JSON.stringify(String(newTitle));
              const script = `(async function(){
                const sid = ${safeId};
                const newTitle = ${safeTitle};
                const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
                const link = document.querySelector('a[href*="/a/chat/s/' + sid + '"]');
                if (!link) return { success: false, error: "chat-link-not-found" };
                try {
                  link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
                  link.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
                  link.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
                } catch (_) {}
                await sleep(200);
                const menuBtn = link.querySelector('div[role="button"]');
                if (!menuBtn) return { success: false, error: "menu-button-not-found" };
                menuBtn.click();
                await sleep(400);
                const menu = document.querySelector('div.ds-dropdown-menu[role="menu"]');
                if (!menu) return { success: false, error: "menu-not-found" };
                const renameOpt = menu.querySelector('.ds-dropdown-menu-option');
                if (!renameOpt) return { success: false, error: "rename-option-not-found" };
                renameOpt.click();
                await sleep(400);
                const input = document.querySelector('input.ds-input__input');
                if (!input) return { success: false, error: "input-not-found" };
                input.focus();
                const proto = Object.getPrototypeOf(input);
                const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
                if (setter) setter.call(input, newTitle);
                else input.value = newTitle;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                await sleep(150);
                const enterOpts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true };
                input.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
                input.dispatchEvent(new KeyboardEvent("keypress", enterOpts));
                input.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
                await sleep(500);
                const after = document.querySelector('a[href*="/a/chat/s/' + sid + '"]');
                return { success: true, finalName: after ? (after.textContent || "").trim() : null };
              })()`;
              subWin.webContents
                .executeJavaScript(script, true)
                .then((r) => {
                  if (r && r.success) {
                    console.log(
                      "[Cookie Code] Субагент переименован в: " +
                        (r.finalName || newTitle),
                    );
                  } else {
                    console.warn(
                      "[Cookie Code] Не удалось переименовать субагента: " +
                        ((r && r.error) || "unknown"),
                    );
                  }
                })
                .catch((err) => {
                  console.warn(
                    "[Cookie Code] rename subagent error:",
                    err.message,
                  );
                });
            } catch (_) {}
          }, 3000);
          // Чистим pendingLineage — переименование одноразовое.
          state.pendingLineage = null;
        }
      } catch (_) {}

      if (state.pendingProjectDir) {
        saveSessionDirMapping(sessionId, state.pendingProjectDir);
        state.selectedProjectDir = state.pendingProjectDir;
        state.lastProjectDir = state.pendingProjectDir;
        state.pendingProjectDir = null;
        if (win && !win.isDestroyed()) {
          win.webContents.send("project-dir-updated", state.selectedProjectDir);
          win.webContents.send("session-restored", {
            sessionId,
            projectDir: state.selectedProjectDir,
          });
        }
        console.log("[Cookie Code][" + profileId + "] 暂存目录已绑定");
        return;
      }

      const restoredDir = getProjectDirBySessionId(sessionId);
      if (restoredDir) {
        state.selectedProjectDir = restoredDir;
        state.lastProjectDir = restoredDir;
        if (win && !win.isDestroyed()) {
          win.webContents.send("session-restored", {
            sessionId,
            projectDir: restoredDir,
          });
          win.webContents.send("project-dir-updated", restoredDir);
        }
      } else {
        state.selectedProjectDir = null;
        if (win && !win.isDestroyed()) {
          win.webContents.send("project-dir-updated", null);
        }
      }
    } else {
      state.currentSessionId = null;
      // Если есть pendingProjectDir (например, в дочернем окне субагента
      // мы заранее задали рабочую папку), НЕ затираем selectedProjectDir —
      // иначе инструменты до появления sessionId увидят null.
      if (!state.pendingProjectDir) {
        state.selectedProjectDir = null;
        if (win && !win.isDestroyed()) {
          win.webContents.send("project-dir-updated", null);
        }
      } else {
        state.selectedProjectDir = state.pendingProjectDir;
        if (win && !win.isDestroyed()) {
          win.webContents.send("project-dir-updated", state.pendingProjectDir);
        }
      }
    }
  }

  function tryRestoreSessionFromUrl(targetWindow) {
    const win = targetWindow || (windowState && windowState.getMainWindow());
    if (!win || win.isDestroyed()) return;
    const url = win.webContents.getURL();
    handleUrlChange(url, win);
  }

  return {
    readSessionStore,
    writeSessionStore,
    getProjectDirBySessionId,
    saveSessionDirMapping,
    extractSessionIdFromUrl,
    handleUrlChange,
    tryRestoreSessionFromUrl,
    state,
  };
}

module.exports = { createSessionStore };
