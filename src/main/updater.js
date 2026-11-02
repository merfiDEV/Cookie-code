/**
 * Cookie Code 自动更新模块
 * 使用 electron-updater + generic provider（GitHub Releases）检查并下载更新。
 * 职责：检查更新、下载进度提示、下载完成提醒、网络错误友好提示。
 */
const { app, dialog, Notification } = require("electron");
const { autoUpdater } = require("electron-updater");

// ========== 日志配置 ==========
// 打包版禁用文件日志持久化：不加载 electron-log，也不写文件
if (app.isPackaged) {
  autoUpdater.logger = console;
} else {
  const log = require("electron-log");
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = "info";
}
autoUpdater.autoDownload = false; // 检测到更新后不自动下载，等用户确认
autoUpdater.autoInstallOnAppQuit = true; // 退出时自动安装（支持 NSIS）

// ========== 状态标志 ==========
let updateChecked = false; // 是否已执行过检查
let updateDownloaded = false; // 是否已下载完成
let isManualCheck = false; // 是否是用户手动触发的检查
let mainWindowRef = null; // 主窗口引用（用于弹出对话框）

/** 设置主窗口引用，用于对话框定位 */
function setMainWindow(win) {
  mainWindowRef = win;
}

/** 判断错误是否为网络连接类问题 */
function isNetworkError(error) {
  const msg = String(
    (error && (error.message || error.stack)) || "",
  ).toLowerCase();
  const networkKeywords = [
    "net::err",
    "err_connection",
    "err_name_not_resolved",
    "err_internet_disconnected",
    "err_network_changed",
    "err_proxy_connection_failed",
    "err_tunnel_connection_failed",
    "enotfound",
    "etimedout",
    "econnrefused",
    "econnreset",
    "cert_authority_invalid",
    "cert_common_name_invalid",
    "cert_date_invalid",
    "unable to resolve",
    "connect timeout",
    "network is unreachable",
    "socket hang up",
    "tls handshake",
  ];
  return networkKeywords.some((kw) => msg.includes(kw));
}

/** 判断错误是否为 GitHub 访问受限类问题 */
function isGitHubAccessError(error) {
  const msg = String(
    (error && (error.message || error.stack)) || "",
  ).toLowerCase();
  const githubKeywords = [
    "403",
    "404",
    "rate limit",
    "api.github.com",
    "github",
    "forbidden",
    "unauthorized",
  ];
  return githubKeywords.some((kw) => msg.includes(kw));
}

/** 显示系统通知（不打断用户） */
function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

/** 弹出更新失败对话框，提供重试/取消选项 */
async function showUpdateErrorDialog(error, isManual) {
  // 自动检查失败时，静默提示即可，不弹对话框打扰用户
  if (!isManual) {
    const detail =
      isNetworkError(error) || isGitHubAccessError(error)
        ? "Unable to connect to the update server (GitHub). Please check your network connection."
        : "An unknown error occurred. Please try again later.";
    showNotification("Update check failed", detail);
    return false; // 自动检查失败不弹对话框
  }

  // 手动检查失败时，弹出对话框并给出详细原因
  let message = "Update check failed";
  let detail = "";
  if (isNetworkError(error)) {
    message = "Unable to connect to the update server";
    detail =
      "Please check your network connection. The update server is hosted on GitHub and may require a proxy or VPN.\n\nError: " +
      (error.message || "");
  } else if (isGitHubAccessError(error)) {
    message = "Unable to access the GitHub update server";
    detail =
      "GitHub access is restricted or the update resources do not exist. Please verify the repository name and release version.\n\nError: " +
      (error.message || "");
  } else {
    detail = "An unknown error occurred.\n\nError: " + (error.message || "");
  }

  const options = {
    type: "error",
    title: "Update failed",
    message,
    detail,
    buttons: ["Retry", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  };
  const parent =
    mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : null;
  // dialog.showMessageBox 在 macOS 上必须使用 parent 参数，否则弹窗可能被隐藏

  const result = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  return result.response === 0; // 返回 true 表示用户点击了"重试"
}

/** 手动检查更新入口 */
async function checkForUpdates() {
  if (updateDownloaded) {
    // 已有下载完成的更新，直接提示安装
    const options = {
      type: "info",
      title: "Update ready",
      message: "The new version has been downloaded",
      detail: "Restart the app now to install the update?",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    };
    const parent =
      mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : null;
    const result = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
    return;
  }

  isManualCheck = true;
  updateChecked = false;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error("[Updater] 检查更新异常:", error);
    await showUpdateErrorDialog(error, true);
  }
}

// ========== 注册 autoUpdater 事件 ==========

autoUpdater.on("checking-for-update", () => {
  console.log("[Updater] 正在检查更新...");
  if (isManualCheck) {
    showNotification("Checking for updates", "Looking for a new version...");
  }
});

autoUpdater.on("update-available", async (info) => {
  console.log("[Updater] 发现新版本:", info.version);
  const options = {
    type: "info",
    title: "New version available",
    message: "New version v" + info.version + " is available",
    detail:
      "Download the update now? It will be installed automatically when you quit.",
    buttons: ["Download now", "Not now"],
    defaultId: 0,
    cancelId: 1,
  };
  const parent =
    mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : null;
  const result = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  if (result.response === 0) {
    showNotification(
      "Download started",
      "Downloading v" + info.version + "...",
    );
    autoUpdater.downloadUpdate().catch((err) => {
      console.error("[Updater] 下载失败:", err);
    });
  } else {
    isManualCheck = false;
  }
});

autoUpdater.on("update-not-available", () => {
  console.log("[Updater] 已是最新版本");
  if (isManualCheck) {
    showNotification(
      "Up to date",
      "You are already running the latest version.",
    );
  }
  isManualCheck = false;
});

autoUpdater.on("download-progress", (progressObj) => {
  const percent = Math.round(progressObj.percent);
  console.log("[Updater] 下载进度:", percent + "%");
  // 仅在手动检查时显示进度通知
  if (isManualCheck && percent % 10 === 0) {
    showNotification("Downloading update", "Downloaded " + percent + "%");
  }
});

autoUpdater.on("update-downloaded", (info) => {
  updateDownloaded = true;
  console.log("[Updater] 新版本已下载:", info.version);

  // 弹窗询问是否立即安装
  const options = {
    type: "info",
    title: "Update ready",
    message: "New version v" + info.version + " has been downloaded",
    detail: "Restart the app now to install the update?",
    buttons: ["Restart now", "Later"],
    defaultId: 0,
    cancelId: 1,
  };
  const parent =
    mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : null;

  const dialogPromise = parent
    ? dialog.showMessageBox(parent, options)
    : dialog.showMessageBox(options);

  dialogPromise.then((result) => {
    isManualCheck = false;
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on("error", async (error) => {
  console.error("[Updater] 更新错误:", error);
  const shouldRetry = await showUpdateErrorDialog(error, isManualCheck);
  if (shouldRetry) {
    // 用户点击重试
    isManualCheck = true;
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error("[Updater] 重试检查更新失败:", err);
        isManualCheck = false;
      });
    }, 1000);
  } else {
    isManualCheck = false;
  }
});

// ========== 启动时自动检查 ==========
function initAutoUpdater(win) {
  setMainWindow(win);

  // 仅在生产环境（打包后）才检查更新
  if (!app.isPackaged) {
    console.log("[Updater] 开发环境，跳过自动检查更新");
    return;
  }

  // 应用启动后延迟 5 秒检查，避免影响启动速度
  setTimeout(() => {
    console.log("[Updater] 启动自动检查更新");
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("[Updater] 启动检查更新失败:", error);
    });
  }, 5000);
}

/**
 * Ручная проверка обновлений с результатом (для UI).
 * Возвращает { status, version?, error? }:
 *   'dev'         — недоступно в dev-режиме
 *   'ready'       — уже скачано, ждёт установки (version)
 *   'available'   — доступна новая версия (version)
 *   'up-to-date'  — обновлений нет
 *   'error'       — ошибка (error)
 */
function checkForUpdatesWithResult() {
  if (!app.isPackaged) {
    return Promise.resolve({ status: "dev" });
  }
  if (updateDownloaded) {
    return Promise.resolve({ status: "ready" });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(res);
    };
    const onAvailable = (info) => {
      // не скачиваем автоматически — сообщаем UI
      finish({ status: "available", version: info && info.version });
    };
    const onNotAvailable = () => finish({ status: "up-to-date" });
    const onError = (err) => {
      finish({ status: "error", error: (err && err.message) || String(err) });
    };
    const cleanup = () => {
      autoUpdater.removeListener("update-available", onAvailable);
      autoUpdater.removeListener("update-not-available", onNotAvailable);
      autoUpdater.removeListener("error", onError);
    };
    autoUpdater.on("update-available", onAvailable);
    autoUpdater.on("update-not-available", onNotAvailable);
    autoUpdater.on("error", onError);
    // 15с таймаут
    setTimeout(() => finish({ status: "error", error: "timeout" }), 15000);
    isManualCheck = true;
    autoUpdater.checkForUpdates().catch((err) => {
      finish({ status: "error", error: (err && err.message) || String(err) });
    });
  });
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
  checkForUpdatesWithResult,
  setMainWindow,
  isNetworkError,
  isGitHubAccessError,
};
