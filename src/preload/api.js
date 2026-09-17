/**
 * 暴露给渲染进程的 API（contextBridge + window 兜底）
 * 由原 preload.js 拆分而来，行为保持不变。
 */
const { contextBridge, ipcRenderer } = require("electron");

// ========== 暴露给渲染进程的 API ==========
// 尝试 contextBridge，如果失败则直接挂载到 window（作为 fallback）
let electronAPI = {
  executeCommand: (command, id) => {
    return ipcRenderer.invoke("execute-command", { command, id });
  },
  initProject: () => {
    return ipcRenderer.invoke("init-project", { skipPrompt: false });
  },
  openPath: (targetPath) => {
    return ipcRenderer.invoke("open-path", { path: targetPath });
  },
  getFileIcons: () => {
    return ipcRenderer.invoke("get-file-icons");
  },
  updateProjectDir: () => {
    return ipcRenderer.invoke("init-project", { skipPrompt: true });
  },
  executeTool: (toolName, params, callId) => {
    return ipcRenderer.invoke("execute-tool", { toolName, params, callId });
  },
  executeJs: (code, callId) => {
    return ipcRenderer.invoke("execute-js", { code, callId });
  },
  setPlanMode: (enabled) => {
    return ipcRenderer.invoke("set-plan-mode", { enabled });
  },
  exitPlanModeResponse: (requestId, approved) => {
    ipcRenderer.send("exit-plan-mode-response", { requestId, approved });
  },
  killProcess: () => {
    return ipcRenderer.invoke("kill-process");
  },
  // ===== Telegram-бот =====
  telegramApply: () => ipcRenderer.invoke("telegram-apply"),
  telegramStatus: () => ipcRenderer.invoke("telegram-status"),
  telegramPing: () => ipcRenderer.invoke("telegram-ping"),
  telegramTest: () => ipcRenderer.invoke("telegram-test"),
  telegramNotifyAI: (text) =>
    ipcRenderer.invoke("telegram-notify-ai", { text }),
  telegramTypingStart: () => ipcRenderer.invoke("telegram-typing-start"),
  telegramTypingStop: () => ipcRenderer.invoke("telegram-typing-stop"),
  telegramApprovalRequest: (requestId, info) =>
    ipcRenderer.invoke("telegram-approval-request", { requestId, info }),
  telegramApprovalCancel: (requestId) =>
    ipcRenderer.invoke("telegram-approval-cancel", { requestId }),
  sendEnterToChat: () => {
    return ipcRenderer.invoke("chat-send-enter");
  },
  listSessions: () => {
    return ipcRenderer.invoke("list-sessions");
  },
  listProjectFiles: (query) => {
    return ipcRenderer.invoke("list-project-files", { query });
  },
  navigateSession: (sessionId) => {
    return ipcRenderer.invoke("navigate-session", { sessionId });
  },
  newChat: () => {
    return ipcRenderer.invoke("new-chat");
  },
  createProfileWindow: () => {
    return ipcRenderer.invoke("create-profile-window");
  },
  listProfiles: () => {
    return ipcRenderer.invoke("list-profiles");
  },
  openProfileWindow: (profileId) => {
    return ipcRenderer.invoke("open-profile-window", { profileId });
  },
  deleteProfileWindow: (profileId) => {
    return ipcRenderer.invoke("delete-profile", { profileId });
  },
  updateWindowName: (displayName) => {
    return ipcRenderer.invoke("update-window-name", { displayName });
  },
  showAiNotification: () => {
    return ipcRenderer.invoke("show-ai-notification");
  },
  // ========== MCP 相关 API ==========
  listMcpServers: () => {
    return ipcRenderer.invoke("list-mcp-servers");
  },
  upsertMcpServer: (server) => {
    return ipcRenderer.invoke("upsert-mcp-server", { server });
  },
  removeMcpServer: (name) => {
    return ipcRenderer.invoke("remove-mcp-server", { name });
  },
  enableMcpServer: (name) => {
    return ipcRenderer.invoke("enable-mcp-server", { name });
  },
  disableMcpServer: (name) => {
    return ipcRenderer.invoke("disable-mcp-server", { name });
  },
  getMcpTools: () => {
    return ipcRenderer.invoke("get-mcp-tools");
  },
  // ========== 平台相关 API ==========
  listProviders: () => {
    return ipcRenderer.invoke("list-providers");
  },
  selectPlatform: (providerId) => {
    return ipcRenderer.invoke("select-platform", { providerId });
  },
  createProfileWindowWithProvider: (providerId) => {
    return ipcRenderer.invoke("create-profile-window", { providerId });
  },
  importProvider: () => {
    return ipcRenderer.invoke("import-provider");
  },
  removeProvider: (filePath, providerId) => {
    return ipcRenderer.invoke("remove-provider", {
      path: filePath,
      providerId,
    });
  },
  replaceProvider: (providerId) => {
    return ipcRenderer.invoke("replace-provider", { providerId });
  },
  // ========== Cookie Code 用户设置 (settings.json) ==========
  getCuckooSettings: () => {
    return ipcRenderer.invoke("cuckoo-settings-get-all");
  },
  setCuckooSetting: (key, value) => {
    return ipcRenderer.invoke("cuckoo-settings-set", { key, value });
  },
  openCuckooSettingsFile: () => {
    return ipcRenderer.invoke("cuckoo-settings-open-file");
  },
  // ========== Событие «настройки изменились» (из TG-бота или других окон) ==========
  // Подписка: callback получает объект-patch ({key: value}) или null (перечитать всё).
  onSettingsChanged: (callback) => {
    const listener = (_event, patch) => callback(patch);
    ipcRenderer.on("cuckoo-settings-changed", listener);
    return () =>
      ipcRenderer.removeListener("cuckoo-settings-changed", listener);
  },
  // ========== Пользовательские фоны (userData/backgrounds) ==========
  listCustomBackgrounds: () => {
    return ipcRenderer.invoke("cuckoo-backgrounds-list");
  },
  openCustomBackgroundsFolder: () => {
    return ipcRenderer.invoke("cuckoo-backgrounds-open-folder");
  },
  // ========== Спрайты петов (userData/pets) ==========
  listPets: () => {
    return ipcRenderer.invoke("cuckoo-pets-list");
  },
  openPetsFolder: () => {
    return ipcRenderer.invoke("cuckoo-pets-open-folder");
  },
  importPet: () => {
    return ipcRenderer.invoke("cuckoo-pets-import");
  },
  // ========== Todo-задачи ==========
  getTodos: () => {
    return ipcRenderer.invoke("todo-get");
  },
  clearTodos: () => {
    return ipcRenderer.invoke("todo-clear");
  },
  onTodoUpdated: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("todo-updated", listener);
    return () => ipcRenderer.removeListener("todo-updated", listener);
  },
  // ========== Git diff (панель «Изменения») ==========
  gitStatus: () => {
    return ipcRenderer.invoke("git-status");
  },
  gitDiffFile: (filePath, status) => {
    return ipcRenderer.invoke("git-diff-file", { filePath, status });
  },
  gitLog: (limit) => {
    return ipcRenderer.invoke("git-log", { limit });
  },
  gitCommitFiles: (hash) => {
    return ipcRenderer.invoke("git-commit-files", { hash });
  },
  gitCommitFileDiff: (hash, filePath) => {
    return ipcRenderer.invoke("git-commit-file-diff", { hash, filePath });
  },
  gitCommitDiff: (hash) => {
    return ipcRenderer.invoke("git-commit-diff", { hash });
  },
  exportChat: (payload) => {
    return ipcRenderer.invoke("cuckoo-chat-export", payload);
  },
  // ========== API Уведомлений-баннеров (cuckoo-first-time-box style) ==========
  // Публичное API для показа модальных уведомлений сверху страницы
  // с произвольным текстом, кнопкой действия и крестиком закрытия.
  //
  // Использование:
  //   await window.electronAPI.showBannerNotification('Текст сообщения', {
  //     btnText: 'Кнопка действия', // строка, или null/false чтобы скрыть кнопку
  //     duration: 5000,             // мс до автозакрытия (0 = без таймера)
  //     onAction: () => {},         // callback при нажатии кнопки
  //     onClose: () => {}           // callback при закрытии крестиком
  //   });
  //   // Возвращает Promise<boolean>: true если нажата кнопка, false если закрыто крестиком/таймером
  //
  //   window.electronAPI.hideBannerNotification(); // принудительно закрыть баннер
  showBannerNotification: (text, options) => {
    const { showBannerNotification } = require("./overlay/ui");
    return showBannerNotification(text, options);
  },
  hideBannerNotification: () => {
    const { hideBannerNotification } = require("./overlay/ui");
    return hideBannerNotification();
  },
  // ========== Whats-new (список нововведений после обновления) ==========
  onWhatsNewShow: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("whats-new-show", listener);
    return () => ipcRenderer.removeListener("whats-new-show", listener);
  },
  openChangelogFile: () => {
    return ipcRenderer.invoke("whats-new-open-changelog");
  },
  // ========== Диагностика интеграции (выполняется в контексте страницы) ==========
  runDiagnosticsText: async () => {
    const { runDiagnostics, formatReportText } = require("./dom/diagnostics");
    const report = await runDiagnostics();
    return formatReportText(report);
  },
};

try {
  contextBridge.exposeInMainWorld("electronAPI", electronAPI);
} catch (err) {
  console.error("[Cookie Code] contextBridge.exposeInMainWorld 失败:", err);
}

// 无论 contextBridge 是否成功，都直接挂载到 window 作为备选
window.electronAPI = electronAPI;
