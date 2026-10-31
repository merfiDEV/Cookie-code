/**
 * IPC для shell-страницы. Все каналы — реальные вызовы к существующим модулям.
 */
const { ipcMain, dialog, shell, app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

function registerShellIpc({
  windowState,
  profileManager,
  getProvider,
  createWindow,
  projectContext,
}) {
  /** Получить провайдер текущего окна (по providerId из контекста или URL) */
  function getCurrentProvider(ctx) {
    if (!ctx) return null;
    if (ctx.providerId) return getProvider(ctx.providerId);
    try {
      const url =
        ctx.view && ctx.view.webContents ? ctx.view.webContents.getURL() : "";
      const { getProviderByUrl } = require("../providers");
      return getProviderByUrl(url) || null;
    } catch (_) {
      return null;
    }
  }

  const settingsStore = require("./settings-store");
  const mcpConfig = require("./mcp-config");
  const mcpClient = require("./mcp-client");
  const promptsStore = require("./prompts-store");
  const skillManager = require("./skill-manager").getSkillManager();
  const agentsModule = require("./agents");
  const updater = require("./updater");

  // ===== Навигация =====
  ipcMain.handle("shell-navigate", async (event, { url } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.view) return { success: false };
    try {
      await ctx.view.webContents.loadURL(url);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-back", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (ctx && ctx.view && ctx.view.webContents.navigationHistory.canGoBack()) {
      ctx.view.webContents.navigationHistory.goBack();
    }
    return { success: true };
  });
  ipcMain.handle("shell-forward", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (
      ctx &&
      ctx.view &&
      ctx.view.webContents.navigationHistory.canGoForward()
    ) {
      ctx.view.webContents.navigationHistory.goForward();
    }
    return { success: true };
  });
  ipcMain.handle("shell-reload", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (ctx && ctx.view) ctx.view.webContents.reload();
    return { success: true };
  });
  ipcMain.handle("shell-home", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.view) return { success: false };
    const provider = getProvider("deepseek");
    try {
      await ctx.view.webContents.loadURL(provider.homeUrl);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ===== Layout =====
  ipcMain.handle("shell-toggle-sidebar", async (event, { width } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx) return { success: false };
    // sidebarWidth больше не критичен — viewportRect из shell главный.
    // Но сохраняем для fallback-режима.
    ctx.sidebarWidth =
      typeof width === "number" ? width : ctx.sidebarWidth ? 0 : 320;
    layoutWindow(ctx);
    return { success: true };
  });
  ipcMain.handle(
    "shell-set-ai-view-visible",
    async (event, { visible } = {}) => {
      const ctx = windowState.getContextByWebContents(event.sender);
      if (!ctx || !ctx.view) return { success: false };
      try {
        ctx.view.setVisible(!!visible);
      } catch (_) {}
      return { success: true };
    },
  );
  ipcMain.on("shell-sidebar-drag-start", (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (ctx) ctx.sidebarDragging = true;
  });
  ipcMain.on("shell-sidebar-drag-end", (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (ctx) ctx.sidebarDragging = false;
  });
  ipcMain.on("shell-report-size", (event, { w, h } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx) return;
    ctx.shellSize = { w: w || 0, h: h || 0 };
    layoutWindow(ctx);
  });
  // Точные координаты .viewport из DOM — главный источник истины для AI-view.
  ipcMain.on("shell-report-layout", (event, rect = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.view) return;
    const x = Math.max(0, Math.round(rect.x || 0));
    const y = Math.max(0, Math.round(rect.y || 0));
    const w = Math.max(100, Math.round(rect.width || 0));
    const h = Math.max(100, Math.round(rect.height || 0));
    try {
      ctx.view.setBounds({ x, y, width: w, height: h });
    } catch (_) {}
    ctx.viewportRect = { x, y, w, h };
  });

  // ===== Окно =====
  ipcMain.handle("shell-window-minimize", (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (ctx && ctx.win) ctx.win.minimize();
    return { success: true };
  });
  ipcMain.handle("shell-window-maximize", (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (ctx && ctx.win) {
      if (ctx.win.isMaximized()) ctx.win.unmaximize();
      else ctx.win.maximize();
    }
    return { success: true };
  });
  ipcMain.handle("shell-window-close", (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (ctx && ctx.win) ctx.win.close();
    return { success: true };
  });
  ipcMain.handle("shell-window-is-maximized", (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    return {
      success: true,
      maximized: !!(ctx && ctx.win && ctx.win.isMaximized()),
    };
  });

  // ===== Проект =====
  ipcMain.handle("shell-select-project-dir", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const win = ctx ? ctx.win : null;
    const result = dialog.showOpenDialogSync(win, {
      properties: ["openDirectory"],
    });
    if (!result || !result[0]) return { success: false };
    return { success: true, dir: result[0] };
  });
  ipcMain.handle("shell-get-project-dir", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const dir =
      ctx && ctx.sessionStore && ctx.sessionStore.state
        ? ctx.sessionStore.state.selectedProjectDir ||
          ctx.sessionStore.state.lastProjectDir ||
          null
        : null;
    return { success: true, dir };
  });
  ipcMain.handle("shell-init-project", async (event, opts = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx) return { success: false };

    // Если указан dir — устанавливаем проект без диалога
    if (opts.dir) {
      try {
        const res = await projectContext.setProjectByDir(opts.dir, ctx);
        if (!res.success) return res;
        // Обновляем UI проекта в shell-странице
        if (ctx.win && !ctx.win.isDestroyed()) {
          try {
            ctx.win.webContents.send("shell-project-dir", opts.dir);
          } catch (_) {}
        }
        // Собираем и отправляем initial-prompt в AI-страницу
        const providerId = (ctx && ctx.providerId) || "";
        const combined = await projectContext.buildInitPrompt(
          opts.dir,
          providerId,
        );
        const { getAIWebContents } = windowState;
        const aiWc = getAIWebContents(ctx.win);
        if (aiWc && !aiWc.isDestroyed()) {
          aiWc.send("initial-prompt", combined);
        }
        return { success: true, dir: opts.dir };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    // Иначе — обычная инициализация с диалогом (старая сигнатура)
    try {
      const res = await projectContext.initProject(!!opts.isCompaction, ctx);
      return { success: true, ...res };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle(
    "shell-send-init-message",
    async (event, { text, projectDir } = {}) => {
      const ctx = windowState.getContextByWebContents(event.sender);
      if (!ctx) return { success: false, error: "窗口上下文不存在" };
      if (!projectDir) return { success: false, error: "未指定项目目录" };
      try {
        const provider = getCurrentProvider(ctx) || getProvider("deepseek");
        const { getAIWebContents } = windowState;
        const aiWc = getAIWebContents(ctx.win);
        if (!aiWc || aiWc.isDestroyed()) {
          return { success: false, error: "AI 页面不可用" };
        }

        // 1. Устанавливаем проект (может переключить на существующую сессию — это ок)
        const setRes = await projectContext.setProjectByDir(projectDir, ctx);
        if (!setRes.success) return setRes;

        // 2. Собираем промпт
        const providerId = (ctx && ctx.providerId) || "";
        const combined = await projectContext.buildInitPrompt(
          projectDir,
          providerId,
        );

        // 3. Создаём НОВЫЙ чат: переходим на homeUrl провайдера
        if (provider && provider.homeUrl) {
          // Сбрасываем текущую сессию и помечаем проект как pending — привяжется
          // к новому sessionId, когда чат создастся.
          if (ctx.sessionStore && ctx.sessionStore.state) {
            ctx.sessionStore.state.currentSessionId = null;
            ctx.sessionStore.state.selectedProjectDir = projectDir;
            ctx.sessionStore.state.lastProjectDir = projectDir;
            ctx.sessionStore.state.pendingProjectDir = projectDir;
          }
          const loadPromise = new Promise((resolve) => {
            const done = () => {
              aiWc.removeListener("did-finish-load", done);
              aiWc.removeListener("did-fail-load", done);
              resolve();
            };
            aiWc.once("did-finish-load", done);
            aiWc.once("did-fail-load", done);
            setTimeout(done, 15000);
          });
          await aiWc.loadURL(provider.homeUrl);
          await loadPromise;
        }

        // 4. Обновляем UI проекта в shell-странице
        if (ctx.win && !ctx.win.isDestroyed()) {
          try {
            ctx.win.webContents.send("shell-project-dir", projectDir);
          } catch (_) {}
        }

        // 5. Отправляем промпт уже в новом чате
        const fullPrompt = combined + (text ? "\n\n---\n\n" + text : "");
        aiWc.send("initial-prompt", fullPrompt);

        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );
  ipcMain.on("cancel-init-prompt", (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (ctx && ctx.win)
      try {
        ctx.win.webContents.send("shell-show-init-prompt", null);
      } catch (_) {}
  });

  // ===== Токены =====
  ipcMain.handle("shell-get-token-usage", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    let usage = ctx && ctx.tokenUsage;
    if (!usage || !usage.total) {
      try {
        const stats = require("./stats-store");
        const raw = stats.readStats ? stats.readStats() : null;
        const sessionId =
          ctx && ctx.sessionStore && ctx.sessionStore.state
            ? ctx.sessionStore.state.currentSessionId
            : null;
        if (raw && raw.sessions && sessionId && raw.sessions[sessionId]) {
          const t = raw.sessions[sessionId].tokens || 0;
          usage = { total: t, delta: 0, context: t };
        }
      } catch (_) {}
    }
    if (!usage) usage = { total: 0, delta: 0, context: 0 };
    return {
      success: true,
      data: {
        context: usage.total || usage.context || 0,
        total: usage.total || 0,
        delta: usage.delta || 0,
      },
      tps:
        ctx && ctx._tpsLast && ctx._tpsLast.tps ? String(ctx._tpsLast.tps) : "",
    };
  });
  ipcMain.handle("shell-get-system-total", async () => {
    try {
      const stats = require("./stats-store");
      const raw = stats.readStats ? stats.readStats() : null;
      const total = (raw && raw.totals && raw.totals.tokens) || 0;
      return { success: true, total };
    } catch (e) {
      return { success: true, total: 0 };
    }
  });

  // ===== Сессии (отдаём реальный список) =====
  ipcMain.handle("shell-list-all-sessions", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.sessionStore) return { success: true, sessions: [] };
    const ss = ctx.sessionStore;
    try {
      const sessions = ss.listSessions();
      const currentSessionId = ss.state.currentSessionId || null;
      const currentProjectDir = ss.state.selectedProjectDir || null;
      return { success: true, sessions, currentSessionId, currentProjectDir };
    } catch (e) {
      return { success: true, sessions: [], error: e.message };
    }
  });
  ipcMain.handle(
    "shell-navigate-session",
    async (event, { sessionId } = {}) => {
      const ctx = windowState.getContextByWebContents(event.sender);
      if (!ctx || !ctx.view) return { success: false };
      const provider = getProvider("deepseek");
      try {
        await ctx.view.webContents.loadURL(provider.sessionUrlBase + sessionId);
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );
  ipcMain.handle(
    "shell-set-session-archived",
    async (event, { sessionId, archived } = {}) => {
      const ctx = windowState.getContextByWebContents(event.sender);
      if (!ctx || !ctx.sessionStore) return { success: false };
      try {
        const ss = ctx.sessionStore;
        if (typeof ss.setArchived === "function")
          ss.setArchived(sessionId, archived);
        else if (
          ss.state &&
          ss.state.sessions &&
          ss.state.sessions[sessionId]
        ) {
          ss.state.sessions[sessionId].archived = !!archived;
          if (typeof ss.persist === "function") ss.persist();
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );
  ipcMain.handle(
    "shell-set-session-title",
    async (event, { sessionId, title } = {}) => {
      const ctx = windowState.getContextByWebContents(event.sender);
      if (!ctx || !ctx.sessionStore) return { success: false };
      try {
        const ss = ctx.sessionStore;
        if (typeof ss.setTitle === "function") ss.setTitle(sessionId, title);
        else if (
          ss.state &&
          ss.state.sessions &&
          ss.state.sessions[sessionId]
        ) {
          ss.state.sessions[sessionId].title = title;
          if (typeof ss.persist === "function") ss.persist();
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );
  ipcMain.handle(
    "shell-new-conversation-for-project",
    async (event, { projectDir } = {}) => {
      const ctx = windowState.getContextByWebContents(event.sender);
      if (!ctx || !ctx.view) return { success: false };
      const provider = getCurrentProvider(ctx) || getProvider("deepseek");
      if (!projectDir) return { success: false, error: "未指定项目目录" };
      try {
        const aiWc = ctx.view.webContents;
        // Сбрасываем текущую сессию; проект запоминаем как pending — привяжется
        // к новому sessionId, когда DeepSeek создаст чат.
        if (ctx.sessionStore && ctx.sessionStore.state) {
          ctx.sessionStore.state.currentSessionId = null;
          ctx.sessionStore.state.selectedProjectDir = projectDir;
          ctx.sessionStore.state.lastProjectDir = projectDir;
          ctx.sessionStore.state.pendingProjectDir = projectDir;
        }
        // Уведомляем shell-страницу
        if (ctx.win && !ctx.win.isDestroyed()) {
          try {
            ctx.win.webContents.send("shell-project-dir", projectDir);
          } catch (_) {}
        }
        // Собираем промпт проекта (system prompt + правила + инструменты)
        const providerId = (ctx && ctx.providerId) || "";
        const combined = await projectContext.buildInitPrompt(
          projectDir,
          providerId,
        );
        // Переходим на home и ждём реальной загрузки (иначе отправка пропадёт)
        const loadPromise = new Promise((resolve) => {
          const done = () => {
            aiWc.removeListener("did-finish-load", done);
            aiWc.removeListener("did-fail-load", done);
            resolve();
          };
          aiWc.once("did-finish-load", done);
          aiWc.once("did-fail-load", done);
          setTimeout(done, 15000);
        });
        await aiWc.loadURL(provider.homeUrl);
        await loadPromise;
        // Отправляем system prompt — DeepSeek создаст новый чат,
        // handleUrlChange привяжет pendingProjectDir к новому sessionId.
        aiWc.send("initial-prompt", combined);
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );
  ipcMain.handle("shell-get-dir-info", async (_e, { dir } = {}) => {
    try {
      const st = fs.statSync(dir);
      return { success: true, dir, createdAt: st.birthtime.toISOString() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle(
    "shell-set-project-archived",
    async (event, { dir, archived } = {}) => {
      const ctx = windowState.getContextByWebContents(event.sender);
      if (!ctx || !ctx.sessionStore) return { success: false };
      try {
        const ss = ctx.sessionStore;
        if (ss.state && ss.state.projectDirs) {
          ss.state.projectDirs[dir] = {
            ...(ss.state.projectDirs[dir] || {}),
            archived: !!archived,
          };
          if (typeof ss.persist === "function") ss.persist();
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );

  // ===== Файлы =====
  ipcMain.handle("shell-list-project-tree", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const dir =
      ctx && ctx.sessionStore && ctx.sessionStore.state
        ? ctx.sessionStore.state.selectedProjectDir ||
          ctx.sessionStore.state.lastKnownProjectDir ||
          null
        : null;
    if (!dir) return { success: false, error: "no project" };
    try {
      const tree = buildTree(dir);
      return { success: true, root: dir, tree, truncated: false };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle(
    "shell-write-project-file",
    async (event, { relPath, content } = {}) => {
      const ctx = windowState.getContextByWebContents(event.sender);
      const dir =
        ctx && ctx.sessionStore && ctx.sessionStore.state
          ? ctx.sessionStore.state.selectedProjectDir ||
            ctx.sessionStore.state.lastKnownProjectDir ||
            null
          : null;
      if (!dir) return { success: false, error: "no project" };
      if (typeof relPath !== "string" || !relPath)
        return { success: false, error: "no path" };
      try {
        const full = path.resolve(dir, relPath);
        // Защита от выхода за пределы проекта.
        const rootResolved = path.resolve(dir);
        if (
          full !== rootResolved &&
          !full.startsWith(rootResolved + path.sep)
        ) {
          return { success: false, error: "path outside project" };
        }
        fs.writeFileSync(full, String(content == null ? "" : content), "utf8");
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );
  ipcMain.handle("shell-read-project-file", async (event, { relPath } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const dir =
      ctx && ctx.sessionStore && ctx.sessionStore.state
        ? ctx.sessionStore.state.selectedProjectDir ||
          ctx.sessionStore.state.lastKnownProjectDir ||
          null
        : null;
    if (!dir) return { success: false, error: "no project" };
    try {
      const full = path.join(dir, relPath);
      const data = fs.readFileSync(full, "utf8");
      return { success: true, content: data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle(
    "shell-open-project-file-external",
    async (event, { relPath } = {}) => {
      const ctx = windowState.getContextByWebContents(event.sender);
      if (!ctx || !ctx.projectDir) return { success: false };
      try {
        await shell.openPath(path.join(ctx.projectDir, relPath));
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );

  // ===== Настройки (реальные) =====
  ipcMain.handle("shell-get-settings", async () => {
    try {
      return { success: true, data: settingsStore.readSettings() };
    } catch (e) {
      return { success: false, error: e.message, data: {} };
    }
  });
  // Рассылаем изменения настроек во все AI-страницы (фон/шрифты/пет/чипы и т.д.).
  function broadcastSettingsChanged(patch) {
    try {
      for (const ctx of windowState.getAllContexts()) {
        try {
          const { getAIWebContents } = windowState;
          const aiWc = getAIWebContents(ctx.win);
          if (aiWc && !aiWc.isDestroyed()) {
            aiWc.send("cuckoo-settings-changed", patch || null);
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  ipcMain.handle("shell-save-settings", async (_e, data) => {
    try {
      settingsStore.writeSettings(data || {});
      broadcastSettingsChanged(data || null);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-reset-settings", async () => {
    try {
      settingsStore.writeSettings({});
      broadcastSettingsChanged(null);
      return { success: true, data: settingsStore.readSettings() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ===== Auto-compact (свойство в settings) =====
  ipcMain.handle("shell-get-auto-compact", async () => {
    try {
      const s = settingsStore.readSettings() || {};
      return {
        success: true,
        data: {
          enabled: s.autoCompactEnabled !== false,
          threshold: s.autoCompactThreshold || 800000,
        },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-save-auto-compact", async (_e, data = {}) => {
    try {
      const s = settingsStore.readSettings() || {};
      s.autoCompactEnabled = !!data.enabled;
      s.autoCompactThreshold = data.threshold || 800000;
      settingsStore.writeSettings(s);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-trigger-compact", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.view) return { success: false, error: "no view" };
    try {
      ctx.view.webContents.send("trigger-compact");
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Overlay-кнопки (перенесены из старой панели): выполняем в AI-странице
  ipcMain.handle("shell-kill-process", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.view) return { success: false, error: "no view" };
    try {
      const { processManager } = require("./process-manager");
      const result = await processManager.killAll();
      try {
        ctx.view.webContents.stop();
      } catch (_) {}
      return { success: true, stopped: true, count: result.count };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("shell-overlay-action", async (event, { action } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.view) return { success: false, error: "no view" };
    try {
      ctx.view.webContents.send("overlay-action", { action });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ===== Промпты (prompts-store) =====
  function getProjectDir(ctx) {
    return ctx && ctx.sessionStore && ctx.sessionStore.state
      ? ctx.sessionStore.state.selectedProjectDir ||
          ctx.sessionStore.state.lastProjectDir ||
          null
      : null;
  }
  ipcMain.handle("shell-list-snippets", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const projectDir = getProjectDir(ctx);
    if (!projectDir) return { success: true, snippets: [] };
    try {
      const list = promptsStore.list(projectDir);
      // Приводим к формату фронта: { id, name, content, autoSend }
      const snippets = (list || []).map((p) => ({
        id: p.name,
        name: p.name,
        content: p.text,
        autoSend: true,
      }));
      return { success: true, snippets };
    } catch (e) {
      return { success: true, snippets: [] };
    }
  });
  ipcMain.handle("shell-save-snippets", async (event, { snippets } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const projectDir = getProjectDir(ctx);
    if (!projectDir) return { success: false, error: "no project" };
    try {
      // Полная замена: удалить всё, потом записать
      const existing = promptsStore.list(projectDir);
      for (const p of existing) promptsStore.remove(projectDir, p.name);
      for (const s of snippets || []) {
        const name = s.name || s.id;
        const text = s.content !== undefined ? s.content : s.text;
        if (name) promptsStore.save(projectDir, name, text);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle(
    "shell-trigger-snippet",
    async (event, { content, autoSend } = {}) => {
      const ctx = windowState.getContextByWebContents(event.sender);
      if (!ctx || !ctx.view) return { success: false };
      try {
        ctx.view.webContents.send("fill-input", {
          text: content,
          autoSend: !!autoSend,
        });
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );
  ipcMain.handle("shell-append-snippet", async (event, { text } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.view) return { success: false };
    try {
      ctx.view.webContents.send("append-input", { text });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ===== Скиллы =====
  ipcMain.handle("shell-list-skills", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    try {
      const skills = skillManager.scanAvailableSkills(
        ctx ? ctx.projectDir : null,
      );
      return { success: true, skills };
    } catch (e) {
      return { success: false, skills: [], error: e.message };
    }
  });

  // ===== Агенты =====
  ipcMain.handle("shell-list-agents", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    try {
      const projectDir =
        ctx && ctx.sessionStore && ctx.sessionStore.state
          ? ctx.sessionStore.state.selectedProjectDir ||
            ctx.sessionStore.state.lastProjectDir ||
            null
          : null;
      const list = agentsModule.scanAgents(projectDir);
      return {
        success: true,
        agents: Array.isArray(list) ? list : list.merged || [],
      };
    } catch (e) {
      return { success: false, agents: [], error: e.message };
    }
  });
  ipcMain.handle("shell-open-agent-file", async (_e, { agentPath } = {}) => {
    try {
      await shell.openPath(agentPath);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle(
    "shell-create-agent-file",
    async (event, { name, scope } = {}) => {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx ? ctx.projectDir : null;
      const baseDir =
        scope === "global"
          ? path.join(app.getPath("userData"), "agents")
          : projectDir
            ? path.join(projectDir, ".cuckoo", "agents")
            : null;
      if (!baseDir) return { success: false, error: "no project" };
      try {
        fs.mkdirSync(baseDir, { recursive: true });
        const file = path.join(baseDir, (name || "agent") + ".md");
        if (fs.existsSync(file))
          return { success: false, error: "already exists" };
        fs.writeFileSync(
          file,
          "---\nname: " + name + "\ndescription: \n---\n\n# " + name + "\n",
          "utf-8",
        );
        await shell.openPath(file);
        return { success: true, agentPath: file };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );
  ipcMain.handle(
    "shell-rename-agent",
    async (_e, { agentPath, newName } = {}) => {
      try {
        const newPath = path.join(
          path.dirname(agentPath),
          (newName || "agent") + ".md",
        );
        fs.renameSync(agentPath, newPath);
        return { success: true, agentPath: newPath };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
  );
  ipcMain.handle("shell-delete-agent-file", async (_e, { agentPath } = {}) => {
    try {
      fs.unlinkSync(agentPath);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ===== MCP (реальные) =====
  ipcMain.handle("shell-list-mcp-servers", async () => {
    try {
      const servers = mcpConfig.getServers();
      const connected = new Set(
        (mcpClient.getConnectedServers() || []).map((s) => s.name),
      );
      return {
        success: true,
        servers: (servers || []).map((s) => ({
          ...s,
          connected: connected.has(s.name),
        })),
      };
    } catch (e) {
      return { success: true, servers: [] };
    }
  });
  ipcMain.handle("shell-enable-mcp-server", async (_e, { name } = {}) => {
    try {
      mcpConfig.setServerEnabled(name, true);
      await mcpClient.connectServerByName(name);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-disable-mcp-server", async (_e, { name } = {}) => {
    try {
      mcpConfig.setServerEnabled(name, false);
      await mcpClient.disconnectServerByName(name);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ===== Профили (реальные) =====
  ipcMain.handle("shell-list-profiles", async () => ({
    success: true,
    profiles: profileManager.readProfiles(),
  }));
  ipcMain.handle("shell-list-providers", async () => {
    const { getAllProviders } = require("../providers");
    return {
      success: true,
      providers: getAllProviders().map((p) => ({ id: p.id, name: p.name })),
    };
  });
  ipcMain.handle(
    "shell-create-profile-window",
    async (_e, { providerId } = {}) => {
      const profiles = profileManager.readProfiles();
      createWindow(
        profileManager.createProfile(
          "Окно" + (profiles.length + 1),
          providerId || "deepseek",
        ),
      );
      return { success: true };
    },
  );
  ipcMain.handle(
    "shell-open-profile-window",
    async (_e, { profileId } = {}) => {
      const ctx = windowState.getWindowByProfileId(profileId);
      if (ctx && ctx.win) {
        ctx.win.show();
        ctx.win.focus();
        return { success: true };
      }
      const profile = profileManager
        .readProfiles()
        .find((p) => p.id === profileId);
      if (profile) {
        createWindow(profile);
        return { success: true };
      }
      return { success: false };
    },
  );
  ipcMain.handle("shell-delete-profile", async (_e, { profileId } = {}) => {
    if (!profileId) return { success: false };
    const ctx = windowState.getWindowByProfileId(profileId);
    if (ctx && ctx.win && !ctx.win.isDestroyed()) ctx.win.close();
    const ok = profileManager.deleteProfile(profileId);
    return { success: ok };
  });
  ipcMain.handle(
    "shell-set-profile-auto-open",
    async (_e, { profileId, autoOpen } = {}) => {
      const profiles = profileManager.readProfiles();
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        profile.autoOpen = !!autoOpen;
        profileManager.writeProfiles
          ? profileManager.writeProfiles(profiles)
          : null;
        return { success: true };
      }
      return { success: false };
    },
  );

  // ===== Web-сессии (чтение DOM-списка из AI) =====
  ipcMain.handle("shell-list-web-sessions", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.view) return { success: true, sessions: [] };
    try {
      const data = await ctx.view.webContents.executeJavaScript(
        "window.__cuckooListSessions ? window.__cuckooListSessions() : []",
        true,
      );
      return { success: true, sessions: data || [] };
    } catch (e) {
      return { success: true, sessions: [] };
    }
  });
  ipcMain.handle("shell-navigate-web-session", async (event, { url } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.view) return { success: false };
    try {
      await ctx.view.webContents.loadURL(url);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-new-web-conversation", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    if (!ctx || !ctx.view) return { success: false };
    const provider = getCurrentProvider(ctx) || getProvider("deepseek");
    try {
      await ctx.view.webContents.loadURL(provider.homeUrl);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ===== Тема — реальная, из nativeTheme + settings.theme =====
  const { nativeTheme } = require("electron");

  function buildThemeSnapshot() {
    const s = settingsStore.readSettings() || {};
    const pref = s.theme || "system";
    let scheme;
    if (pref === "dark") scheme = "dark";
    else if (pref === "light") scheme = "light";
    else scheme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
    return {
      preference: pref,
      active: { id: pref, colorScheme: scheme, tokens: {} },
      themes: [
        { id: "system", colorScheme: scheme, tokens: {} },
        { id: "light", colorScheme: "light", tokens: {} },
        { id: "dark", colorScheme: "dark", tokens: {} },
      ],
      revision: Date.now(),
    };
  }

  ipcMain.handle("shell-theme-get", async () => ({
    success: true,
    snapshot: buildThemeSnapshot(),
  }));
  ipcMain.handle("shell-theme-set", async (_e, { id } = {}) => {
    try {
      const s = settingsStore.readSettings() || {};
      s.theme = id || "system";
      settingsStore.writeSettings(s);
      const snap = buildThemeSnapshot();
      for (const ctx of windowState.getAllContexts()) {
        try {
          ctx.win.webContents.send("shell-theme-changed", snap);
        } catch (_) {}
      }
      return { success: true, snapshot: snap };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-theme-list", async () => ({
    success: true,
    themes: [
      { id: "system", name: "Как в системе" },
      { id: "light", name: "Светлая" },
      { id: "dark", name: "Тёмная" },
    ],
  }));
  ipcMain.handle("shell-theme-subscribe", async () => ({ success: true }));

  nativeTheme.on("updated", () => {
    const snap = buildThemeSnapshot();
    for (const ctx of windowState.getAllContexts()) {
      try {
        ctx.win.webContents.send("shell-theme-changed", snap);
      } catch (_) {}
    }
  });

  // ===== Внешний вид: фоны / шрифты / петы =====
  ipcMain.handle("shell-list-backgrounds", async () => {
    try {
      const builtinDir = path.join(__dirname, "..", "ui", "backgrounds");
      const customDir = path.join(app.getPath("userData"), "backgrounds");
      const regFile = path.join(builtinDir, "registry.json");
      let items = [];
      if (fs.existsSync(regFile)) {
        try {
          items = JSON.parse(fs.readFileSync(regFile, "utf8")) || [];
        } catch (_) {}
      }
      const result = items.map((it) => ({ ...it, scope: "builtin" }));
      if (fs.existsSync(customDir)) {
        for (const f of fs.readdirSync(customDir)) {
          if (/\.(png|jpg|jpeg|webp|gif)$/i.test(f)) {
            result.push({
              id: f.replace(/\.[^.]+$/, ""),
              name: f,
              file: f,
              scope: "custom",
            });
          }
        }
      }
      return { success: true, items: result };
    } catch (e) {
      return { success: false, items: [], error: e.message };
    }
  });
  ipcMain.handle("shell-open-backgrounds-folder", async () => {
    try {
      const dir = path.join(app.getPath("userData"), "backgrounds");
      fs.mkdirSync(dir, { recursive: true });
      await shell.openPath(dir);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-list-fonts", async () => {
    try {
      const dir = path.join(app.getPath("userData"), "fonts");
      fs.mkdirSync(dir, { recursive: true });
      const items = [{ id: "system", name: "Системный", scope: "system" }];
      for (const f of fs.readdirSync(dir)) {
        if (/\.(ttf|otf|woff2?)$/i.test(f)) {
          items.push({
            id: f.replace(/\.[^.]+$/, ""),
            name: f,
            file: f,
            scope: "custom",
          });
        }
      }
      return { success: true, items };
    } catch (e) {
      return { success: false, items: [], error: e.message };
    }
  });
  ipcMain.handle("shell-open-fonts-folder", async () => {
    try {
      const dir = path.join(app.getPath("userData"), "fonts");
      fs.mkdirSync(dir, { recursive: true });
      await shell.openPath(dir);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-list-pets", async () => {
    try {
      const dir = path.join(app.getPath("userData"), "pets");
      fs.mkdirSync(dir, { recursive: true });
      const items = [];
      for (const f of fs.readdirSync(dir)) {
        if (/\.(png|gif|webp|jpg|jpeg)$/i.test(f)) {
          items.push({ id: f.replace(/\.[^.]+$/, ""), name: f, file: f });
        }
      }
      return { success: true, items };
    } catch (e) {
      return { success: false, items: [], error: e.message };
    }
  });
  ipcMain.handle("shell-open-pets-folder", async () => {
    try {
      const dir = path.join(app.getPath("userData"), "pets");
      fs.mkdirSync(dir, { recursive: true });
      await shell.openPath(dir);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ===== Логи (только упакованная версия пишет в userData) =====
  ipcMain.handle("shell-get-log-info", async () => {
    try {
      const dir = path.join(app.getPath("userData"), "wyp", "log");
      const file = path.join(dir, "electron.log");
      const enabled = app.isPackaged;
      let size = 0;
      try {
        if (fs.existsSync(file)) size = fs.statSync(file).size;
      } catch (_) {}
      return { success: true, enabled, dir, file, size };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-set-log-enabled", async () => ({ success: true }));
  ipcMain.handle("shell-delete-logs", async () => {
    try {
      const dir = path.join(app.getPath("userData"), "wyp", "log");
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          if (f.endsWith(".log"))
            fs.writeFileSync(path.join(dir, f), "", "utf-8");
        }
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-open-log-dir", async () => {
    try {
      const dir = path.join(app.getPath("userData"), "wyp", "log");
      fs.mkdirSync(dir, { recursive: true });
      await shell.openPath(dir);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ===== О приложении =====
  ipcMain.handle("shell-get-app-info", async () => {
    // Версия: последний заголовок "## [x.y.z]" из CHANGELOG.md;
    // fallback — app.getVersion() (package.json).
    let version = app.getVersion();
    try {
      const candidates = [
        path.join(app.getAppPath(), "CHANGELOG.md"),
        path.join(process.cwd(), "CHANGELOG.md"),
        path.join(__dirname, "..", "..", "CHANGELOG.md"),
      ];
      for (const p of candidates) {
        if (!fs.existsSync(p)) continue;
        const text = fs.readFileSync(p, "utf-8");
        const m = text.match(/^##\s*\[([0-9][^\]]*)\]/m);
        if (m && m[1]) {
          version = m[1].trim();
          break;
        }
      }
    } catch (_) {}
    return { success: true, version, name: app.getName() };
  });
  ipcMain.handle("shell-check-update", async () => {
    try {
      const result = await updater.checkForUpdatesWithResult();
      return { success: true, ...result };
    } catch (e) {
      return { success: false, status: "error", error: e.message };
    }
  });
  ipcMain.handle("shell-open-external", async (_e, { url } = {}) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle("shell-get-asset-url", async (_e, { rel } = {}) => ({
    success: true,
    url: "file://" + path.join(__dirname, "..", "..", rel),
  }));

  // ===== Git: ветка/upstream/ahead/behind + push/pull/fetch/sync/publish =====
  const gitOps = require("./git-gitops");
  function gitProjectDir(ctx) {
    return ctx && ctx.sessionStore && ctx.sessionStore.state
      ? ctx.sessionStore.state.selectedProjectDir ||
          ctx.sessionStore.state.lastProjectDir ||
          null
      : null;
  }
  ipcMain.handle("shell-git-branch-status", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const dir = gitProjectDir(ctx);
    if (!dir) return { ok: false, error: "no project" };
    try {
      return await gitOps.getBranchStatus(dir);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("shell-git-commit", async (event, { message } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const dir = gitProjectDir(ctx);
    if (!dir) return { ok: false, error: "no project" };
    try {
      return await gitOps.commitAll(dir, message);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("shell-git-push", async (event, opts = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const dir = gitProjectDir(ctx);
    if (!dir) return { ok: false, error: "no project" };
    try {
      return await gitOps.push(dir, opts || {});
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("shell-git-pull", async (event, opts = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const dir = gitProjectDir(ctx);
    if (!dir) return { ok: false, error: "no project" };
    try {
      return await gitOps.pull(dir, opts || {});
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("shell-git-fetch", async (event, opts = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const dir = gitProjectDir(ctx);
    if (!dir) return { ok: false, error: "no project" };
    try {
      return await gitOps.fetchRemote(dir, opts || {});
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("shell-git-publish", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const dir = gitProjectDir(ctx);
    if (!dir) return { ok: false, error: "no project" };
    try {
      return await gitOps.publish(dir);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("shell-git-sync", async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const dir = gitProjectDir(ctx);
    if (!dir) return { ok: false, error: "no project" };
    try {
      return await gitOps.sync(dir);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

function layoutWindow(ctx) {
  if (!ctx || !ctx.win || !ctx.view) return;
  // Источник истины — .viewport rect, который присылает shell после каждого layout.
  // Fallback на CSS-константы только когда shell ещё не отчитался.
  if (ctx.viewportRect) {
    try {
      ctx.view.setBounds({
        x: ctx.viewportRect.x,
        y: ctx.viewportRect.y,
        width: ctx.viewportRect.w,
        height: ctx.viewportRect.h,
      });
      return;
    } catch (_) {}
  }
  const [w, h] = ctx.win.getContentSize();
  const TOOLBAR_H = 46;
  const STATUSBAR_H = 28;
  const sidebarW = ctx.sidebarWidth || 0;
  ctx.view.setBounds({
    x: sidebarW,
    y: TOOLBAR_H,
    width: Math.max(100, w - sidebarW),
    height: Math.max(100, h - TOOLBAR_H - STATUSBAR_H),
  });
}

function buildTree(root, depth = 0, rel = "") {
  if (depth > 6) return [];
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
      .slice(0, 500)
      .map((e) => {
        const isDir = e.isDirectory();
        const relPath = rel ? rel + "/" + e.name : e.name;
        const absPath = path.join(root, e.name).replace(/\\/g, "/");
        return {
          name: e.name,
          path: relPath,
          absPath,
          type: isDir ? "dir" : "file",
          isDir,
          children: isDir
            ? buildTree(path.join(root, e.name), depth + 1, relPath)
            : undefined,
        };
      });
  } catch (_) {
    return [];
  }
}

module.exports = { registerShellIpc, layoutWindow };
