/**
 * 窗口管理（多窗口 + 每窗口 profile 上下文）
 * 每个窗口关联一个 profileId，拥有独立的 sessionStore 实例。
 */
const windows = new Map(); // windowId -> { win, profileId, providerId, sessionStore, isSubagent, subagentConfig }
let lastActiveWindowId = null;

function addWindow(
  win,
  profileId,
  providerId,
  sessionStore,
  isSubagent,
  subagentConfig,
) {
  windows.set(win.id, {
    win,
    profileId,
    providerId,
    sessionStore,
    isSubagent: !!isSubagent,
    subagentConfig: subagentConfig || null,
    // Ограничение инструментов для субагента (whitelist из agent.tools).
    // null = без ограничений. Заполняется в subagent.js::runAgent.
    toolsWhitelist: null,
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

function getWindowContext(windowId) {
  return windows.get(windowId) || null;
}

function getContextByWebContents(webContents) {
  for (const ctx of windows.values()) {
    if (ctx.win.webContents === webContents) return ctx;
  }
  return null;
}

function getMainWindow() {
  if (!lastActiveWindowId) return null;
  const ctx = windows.get(lastActiveWindowId);
  return ctx ? ctx.win : null;
}

/**
 * Родительское окно (НЕ субагент). Для TG-бота: команды пользователя
 * должны всегда попадать в главное окно, даже если открыто окно субагента.
 * Берём самое свежее не-субагентское окно; если такого нет — падаем на getMainWindow().
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

/** Родительский контекст (не субагент). Аналогично getParentWindow(). */
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
