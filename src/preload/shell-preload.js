/**
 * Preload для shell-страницы (VS Code-style UI: toolbar + activitybar + sidebar + statusbar).
 * Экспортирует window.shellAPI.
 *
 * ВАЖНО: без top-level await — Electron contextIsolation требует синхронной инициализации.
 */
const { contextBridge, ipcRenderer } = require("electron");

const platformArg = (process.argv || []).find((a) =>
  a.startsWith("--cuckoo-platform="),
);
const platform = platformArg
  ? platformArg.slice("--cuckoo-platform=".length)
  : process.platform;

const shellAPI = {
  platform,

  // ===== Навигация =====
  navigate: (url) => ipcRenderer.invoke("shell-navigate", { url }),
  back: () => ipcRenderer.invoke("shell-back"),
  forward: () => ipcRenderer.invoke("shell-forward"),
  reload: () => ipcRenderer.invoke("shell-reload"),
  home: () => ipcRenderer.invoke("shell-home"),
  onUrlUpdated: (cb) => ipcRenderer.on("shell-url-updated", (_e, d) => cb(d)),

  // ===== Токены =====
  onTokenUpdated: (cb) =>
    ipcRenderer.on("shell-token-updated", (_e, d) => cb(d)),
  onTpsUpdated: (cb) => ipcRenderer.on("shell-tps-updated", (_e, d) => cb(d)),
  onTotalUpdated: (cb) =>
    ipcRenderer.on("shell-total-updated", (_e, d) => cb(d)),
  getTokenUsage: () => ipcRenderer.invoke("shell-get-token-usage"),
  getSystemTotal: () => ipcRenderer.invoke("shell-get-system-total"),

  // ===== Проект =====
  selectProjectDir: () => ipcRenderer.invoke("shell-select-project-dir"),
  cancelInitPrompt: () => ipcRenderer.send("cancel-init-prompt"),
  onShowInitPrompt: (cb) =>
    ipcRenderer.on("shell-show-init-prompt", (_e, d) => cb(d)),
  initProject: (dir, isCompaction, extraPrompt, noDialog) =>
    ipcRenderer.invoke("shell-init-project", {
      dir,
      isCompaction,
      extraPrompt,
      noDialog,
    }),
  sendInitMessage: (text, projectDir) =>
    ipcRenderer.invoke("shell-send-init-message", { text, projectDir }),
  updateProjectDir: () =>
    ipcRenderer.invoke("shell-init-project", { noDialog: false }),
  getProjectDir: () => ipcRenderer.invoke("shell-get-project-dir"),
  onProjectDir: (cb) =>
    ipcRenderer.on("shell-project-dir", (_e, dir) => cb(dir)),

  // ===== Layout =====
  toggleSidebar: (width) =>
    ipcRenderer.invoke("shell-toggle-sidebar", { width }),
  setAiViewVisible: (visible) =>
    ipcRenderer.invoke("shell-set-ai-view-visible", { visible }),
  startSidebarDrag: () => ipcRenderer.send("shell-sidebar-drag-start"),
  endSidebarDrag: () => ipcRenderer.send("shell-sidebar-drag-end"),
  onSidebarDrag: (cb) => ipcRenderer.on("shell-sidebar-drag", (_e, w) => cb(w)),
  reportShellSize: (w, h) => ipcRenderer.send("shell-report-size", { w, h }),
  reportLayout: (rect) => ipcRenderer.send("shell-report-layout", rect),

  // ===== Окно =====
  windowMinimize: () => ipcRenderer.invoke("shell-window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("shell-window-maximize"),
  windowClose: () => ipcRenderer.invoke("shell-window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("shell-window-is-maximized"),

  // ===== Сессии =====
  listWebSessions: () => ipcRenderer.invoke("shell-list-web-sessions"),
  navigateWebSession: (url) =>
    ipcRenderer.invoke("shell-navigate-web-session", { url }),
  newWebConversation: () => ipcRenderer.invoke("shell-new-web-conversation"),
  onWebUrlChanged: (cb) => ipcRenderer.on("shell-web-url-changed", () => cb()),
  onHarnessBusy: (cb) =>
    ipcRenderer.on("shell-harness-busy", (_e, d) => cb(!!(d && d.busy))),
  onSessionsChanged: (cb) =>
    ipcRenderer.on("shell-sessions-changed", () => cb()),
  listAllSessions: () => ipcRenderer.invoke("shell-list-all-sessions"),
  navigateSession: (sessionId) =>
    ipcRenderer.invoke("shell-navigate-session", { sessionId }),
  setSessionArchived: (sessionId, archived) =>
    ipcRenderer.invoke("shell-set-session-archived", { sessionId, archived }),
  setSessionTitle: (sessionId, title) =>
    ipcRenderer.invoke("shell-set-session-title", { sessionId, title }),
  newConversationForProject: (projectDir) =>
    ipcRenderer.invoke("shell-new-conversation-for-project", { projectDir }),
  getDirInfo: (dir) => ipcRenderer.invoke("shell-get-dir-info", { dir }),
  setProjectArchived: (dir, archived) =>
    ipcRenderer.invoke("shell-set-project-archived", { dir, archived }),

  // ===== Файлы проекта =====
  listProjectTree: () => ipcRenderer.invoke("shell-list-project-tree"),
  writeProjectFile: (relPath, content) =>
    ipcRenderer.invoke("shell-write-project-file", { relPath, content }),
  readProjectFile: (relPath) =>
    ipcRenderer.invoke("shell-read-project-file", { relPath }),
  openFileExternal: (relPath) =>
    ipcRenderer.invoke("shell-open-project-file-external", { relPath }),

  // ===== Промпты =====
  listSnippets: () => ipcRenderer.invoke("shell-list-snippets"),
  getSnippets: () => ipcRenderer.invoke("shell-list-snippets"),
  saveSnippets: (list) =>
    ipcRenderer.invoke("shell-save-snippets", { snippets: list }),
  triggerSnippet: (content, autoSend) =>
    ipcRenderer.invoke("shell-trigger-snippet", { content, autoSend }),
  appendSnippet: (text) => ipcRenderer.invoke("shell-append-snippet", { text }),
  onSnippetsChanged: (cb) =>
    ipcRenderer.on("shell-snippets-changed", () => cb()),

  // ===== Скиллы / агенты =====
  listSkills: () => ipcRenderer.invoke("shell-list-skills"),
  listAgents: () => ipcRenderer.invoke("shell-list-agents"),
  createAgentFile: (name, scope) =>
    ipcRenderer.invoke("shell-create-agent-file", { name, scope }),
  openAgentFile: (agentPath) =>
    ipcRenderer.invoke("shell-open-agent-file", { agentPath }),
  renameAgent: (agentPath, newName) =>
    ipcRenderer.invoke("shell-rename-agent", { agentPath, newName }),
  deleteAgentFile: (agentPath) =>
    ipcRenderer.invoke("shell-delete-agent-file", { agentPath }),

  // ===== MCP =====
  listMcpServers: () => ipcRenderer.invoke("shell-list-mcp-servers"),
  enableMcpServer: (name) =>
    ipcRenderer.invoke("shell-enable-mcp-server", { name }),
  disableMcpServer: (name) =>
    ipcRenderer.invoke("shell-disable-mcp-server", { name }),

  // ===== Профили =====
  listProfiles: () => ipcRenderer.invoke("shell-list-profiles"),
  listProviders: () => ipcRenderer.invoke("shell-list-providers"),
  createProfileWindow: (providerId) =>
    ipcRenderer.invoke("shell-create-profile-window", { providerId }),
  openProfileWindow: (profileId) =>
    ipcRenderer.invoke("shell-open-profile-window", { profileId }),
  deleteProfileWindow: (profileId) =>
    ipcRenderer.invoke("shell-delete-profile", { profileId }),
  setProfileAutoOpen: (profileId, on) =>
    ipcRenderer.invoke("shell-set-profile-auto-open", {
      profileId,
      autoOpen: on,
    }),

  // ===== Token / auto-compact =====
  overlayAction: (action) =>
    ipcRenderer.invoke("shell-overlay-action", { action }),
  onTaskUpdate: (cb) =>
    ipcRenderer.on("shell-task-update", (_e, d) => cb(d || {})),
  killProcess: () => ipcRenderer.invoke("shell-kill-process"),
  getAutoCompact: () => ipcRenderer.invoke("shell-get-auto-compact"),
  saveAutoCompact: (data) =>
    ipcRenderer.invoke("shell-save-auto-compact", data),
  triggerCompact: () => ipcRenderer.invoke("shell-trigger-compact"),

  // ===== Настройки =====
  getSettings: () => ipcRenderer.invoke("shell-get-settings"),
  saveSettings: (data) => ipcRenderer.invoke("shell-save-settings", data),
  resetSettings: () => ipcRenderer.invoke("shell-reset-settings"),
  onPlatformMode: (cb) =>
    ipcRenderer.on("shell-platform-mode", (_e, d) => cb(d)),

  // ===== Фоны / шрифты / петы =====
  listBackgrounds: () => ipcRenderer.invoke("shell-list-backgrounds"),
  openBackgroundsFolder: () =>
    ipcRenderer.invoke("shell-open-backgrounds-folder"),
  listFonts: () => ipcRenderer.invoke("shell-list-fonts"),
  openFontsFolder: () => ipcRenderer.invoke("shell-open-fonts-folder"),
  listPets: () => ipcRenderer.invoke("shell-list-pets"),
  openPetsFolder: () => ipcRenderer.invoke("shell-open-pets-folder"),

  // ===== Логи =====
  getLogInfo: () => ipcRenderer.invoke("shell-get-log-info"),
  setLogEnabled: (enabled) =>
    ipcRenderer.invoke("shell-set-log-enabled", { enabled }),
  deleteLogs: () => ipcRenderer.invoke("shell-delete-logs"),
  openLogDir: () => ipcRenderer.invoke("shell-open-log-dir"),

  // ===== Тема =====
  themeGet: () => ipcRenderer.invoke("shell-theme-get"),
  themeSet: (id) => ipcRenderer.invoke("shell-theme-set", { id }),
  themeList: () => ipcRenderer.invoke("shell-theme-list"),
  themeSubscribe: () => ipcRenderer.invoke("shell-theme-subscribe"),
  onThemeChanged: (cb) =>
    ipcRenderer.on("shell-theme-changed", (_e, snap) => cb(snap)),

  // ===== О приложении =====
  getAppInfo: () => ipcRenderer.invoke("shell-get-app-info"),
  checkUpdate: () => ipcRenderer.invoke("shell-check-update"),
  getAssetUrl: (rel) => ipcRenderer.invoke("shell-get-asset-url", { rel }),
  // ===== Git =====
  gitBranchStatus: () => ipcRenderer.invoke("shell-git-branch-status"),
  gitListBranches: () => ipcRenderer.invoke("shell-git-list-branches"),
  gitCheckout: (opts) => ipcRenderer.invoke("shell-git-checkout", opts || {}),
  gitCommit: (message) => ipcRenderer.invoke("shell-git-commit", { message }),
  gitPush: (opts) => ipcRenderer.invoke("shell-git-push", opts || {}),
  gitPull: (opts) => ipcRenderer.invoke("shell-git-pull", opts || {}),
  gitFetch: (opts) => ipcRenderer.invoke("shell-git-fetch", opts || {}),
  gitPublish: () => ipcRenderer.invoke("shell-git-publish"),
  gitSync: () => ipcRenderer.invoke("shell-git-sync"),
  openExternal: (url) => ipcRenderer.invoke("shell-open-external", { url }),
};

contextBridge.exposeInMainWorld("shellAPI", shellAPI);
