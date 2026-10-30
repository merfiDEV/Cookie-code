/**
 * Управление окнами (многооконный + профиль на окно).
 *
 * Новая архитектура (VS Code-style shell):
 *   win  — BrowserWindow, webContents = shell.html (toolbar/sidebar/statusbar)
 *   view — WebContentsView, webContents = AI-страница (DeepSeek/Claude)
 *
 * Каждое окно связано с profileId, имеет свой sessionStore.
 */
const windows = new Map(); // windowId -> { win, view, profileId, providerId, sessionStore, isSubagent, subagentConfig, projectDir, sidebarWidth, tokenUsage }
let lastActiveWindowId = null;

function addWindow(
  win,
  view,
  profileId,
  providerId,
  sessionStore,
  isSubagent,
  subagentConfig,
) {
  windows.set(win.id, {
    win,
    view,
    profileId,
    providerId,
    sessionStore,
    isSubagent: !!isSubagent,
    subagentConfig: subagentConfig || null,
    toolsWhitelist: null,
    // Поля layout, обновляются через shell-report-size / shell-toggle-sidebar
    projectDir: null,
    sidebarWidth: 260,
    tokenUsage: null,
  });
  lastActiveWindowId = win.id;
  win.on("closed", () => {
    windows.delete(win.id);
    if (lastActiveWindowId === win.id) {
      const remaining = Array.from(windows.keys());
      lastActiveWindowId =
        remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }
  });
}

function removeWindow(windowId) {
  windows.delete(windowId);
  if (lastActiveWindowId === windowId) {
    const remaining = Array.from(windows.keys());
    lastActiveWindowId =
      remaining.length > 0 ? remaining[remaining.length - 1] : null;
  }
}

/**
 * Возвращает webContents AI-страницы для окна.
 * Если view не привязан — fallback на win.webContents (совместимость с субагентом,
 * которому иногда подсовывают обычный BrowserWindow без WebContentsView).
 */
function getAIWebContents(win) {
  if (!win) return null;
  if (win.__aiWebContents && !win.__aiWebContents.isDestroyed?.()) {
    return win.__aiWebContents;
  }
  // Fallback через реестр окон
  for (const ctx of windows.values()) {
    if (ctx.win === win && ctx.view && ctx.view.webContents) {
      return ctx.view.webContents;
    }
  }
  return win.webContents;
}

/**
 * Привязывает AI-страницу (WebContentsView) к BrowserWindow.
 * После вызова все getAIWebContents(win) будут возвращать view.webContents.
 */
function attachAIView(win, view) {
  if (!win || !view) return;
  win.__aiView = view;
  win.__aiWebContents = view.webContents;
}

function getWindowContext(windowId) {
  return windows.get(windowId) || null;
}

/**
 * Ищет контекст по webContents. Подходит как для shell (win.webContents),
 * так и для AI-страницы (view.webContents).
 */
function getContextByWebContents(webContents) {
  for (const ctx of windows.values()) {
    if (ctx.win && ctx.win.webContents === webContents) return ctx;
    if (ctx.view && ctx.view.webContents === webContents) return ctx;
  }
  return null;
}

function getMainWindow() {
  if (!lastActiveWindowId) return null;
  const ctx = windows.get(lastActiveWindowId);
  return ctx ? ctx.win : null;
}

/**
 * Родительское окно (НЕ субагент). Для TG-бота.
 */
function getParentWindow() {
  let fallback = null;
  for (const [id, ctx] of windows) {
    if (!ctx.isSubagent && ctx.win && !ctx.win.isDestroyed()) {
      fallback = ctx.win;
    }
  }
  return fallback || getMainWindow();
}

function getParentContext() {
  let fallback = null;
  for (const [id, ctx] of windows) {
    if (!ctx.isSubagent && ctx.win && !ctx.win.isDestroyed()) {
      fallback = ctx;
    }
  }
  if (fallback) return fallback;
  return getMainContext();
}

function getMainContext() {
  if (!lastActiveWindowId) return null;
  return windows.get(lastActiveWindowId) || null;
}

function setMainWindow(win) {
  if (win) {
    lastActiveWindowId = win.id;
  } else {
    lastActiveWindowId = null;
  }
}

function getAllWindows() {
  return Array.from(windows.values()).map((ctx) => ctx.win);
}

function getAllContexts() {
  return Array.from(windows.values());
}

function getWindowByProfileId(profileId) {
  for (const ctx of windows.values()) {
    if (ctx.profileId === profileId) return ctx;
  }
  return null;
}

module.exports = {
  addWindow,
  removeWindow,
  getWindowContext,
  getAIWebContents,
  attachAIView,
  getContextByWebContents,
  getMainWindow,
  getMainContext,
  getParentWindow,
  getParentContext,
  setMainWindow,
  getAllWindows,
  getAllContexts,
  getWindowByProfileId,
};
