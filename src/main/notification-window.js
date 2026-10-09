/**
 * Кастомное уведомление в стиле Material Design 3.
 *
 * Frameless-прозрачное окно Electron в правом нижнем углу экрана:
 *  - показывается поверх всех окон (alwaysOnTop, level 'screen-saver');
 *  - авто-скрывается через ~6 секунд;
 *  - клик по карточке — фокусирует родительское окно;
 *  - крестик — закрывает немедленно.
 *
 * Используется вместо системного Notification API для уведомлений
 * «AI завершил задачу» (см. ipc.js → show-ai-notification).
 */
const { BrowserWindow, screen } = require("electron");
const path = require("path");

const NOTIF_WIDTH = 380;
const NOTIF_HEIGHT = 196;
const MARGIN = 16;
const AUTO_HIDE_MS = 12000;

// Активное окно уведомления (одно за раз).
let activeWin = null;
let hideTimer = null;

/** Экранирование HTML. */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * HTML-разметка уведомления (MD3, тёмная тема).
 * @param {{title:string, body:string, iconDataUrl?:string}} opts
 */
function buildHtml(opts) {
  const title = esc(opts.title || "");
  const body = esc(opts.body || "");
  const icon = opts.iconDataUrl || "";
  const iconBlock = icon
    ? '<img alt="" class="icon-img" src="' + icon + '"/>'
    : '<span class="icon-fallback">C</span>';

  return (
    "<!DOCTYPE html><html lang='ru'><head><meta charset='utf-8'>" +
    "<style>" +
    "* { margin:0; padding:0; box-sizing:border-box; -webkit-user-select:none; user-select:none; }" +
    "html, body { width:100%; height:100%; background:transparent; overflow:hidden; }" +
    "body { font-family:'Inter','Segoe UI',Roboto,-apple-system,BlinkMacSystemFont,sans-serif; " +
    "  display:flex; align-items:flex-start; justify-content:center; padding:8px; }" +
    ".card { width:100%; background:#1C1B1F; color:#E6E1E5; " +
    "  border-radius:28px; padding:14px 16px; " +
    "  box-shadow:0 4px 8px 3px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.30); " +
    "  animation:notif-in .38s cubic-bezier(.05,.7,.1,1); }" +
    "@keyframes notif-in { from { opacity:0; transform:translateY(14px) scale(.98); } " +
    "  to { opacity:1; transform:none; } }" +
    ".card.hide { animation:notif-out .3s cubic-bezier(.3,0,.8,.15) forwards; }" +
    "@keyframes notif-out { to { opacity:0; transform:translateY(10px) scale(.98); } }" +
    ".head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }" +
    ".app { font-size:12px; font-weight:500; color:#A8A2AB; letter-spacing:.01em; }" +
    ".head-actions { display:flex; align-items:center; gap:2px; }" +
    ".icon-btn { width:28px; height:28px; border:none; border-radius:999px; " +
    "  background:transparent; color:#A8A2AB; cursor:pointer; display:grid; place-items:center; " +
    "  transition:background .15s, color .15s; }" +
    ".icon-btn:hover { background:rgba(230,225,229,0.08); color:#E6E1E5; }" +
    ".icon-btn svg { width:18px; height:18px; display:block; }" +
    ".row { display:flex; align-items:flex-start; gap:14px; }" +
    ".icon-wrap { flex:0 0 auto; width:52px; height:52px; border-radius:16px; " +
    "  background:#4A2620; display:grid; place-items:center; overflow:hidden; }" +
    ".icon-img { width:40px; height:40px; object-fit:contain; }" +
    ".icon-fallback { color:#F5EFE3; font-size:22px; font-weight:800; }" +
    ".text { flex:1 1 auto; min-width:0; padding-top:1px; }" +
    ".title { font-size:15px; font-weight:600; line-height:1.3; color:#E6E1E5; " +
    "  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }" +
    ".body { font-size:13px; color:#A8A2AB; margin-top:4px; display:flex; align-items:center; gap:8px; }" +
    ".dot { width:8px; height:8px; border-radius:50%; background:#F5A623; flex:0 0 auto; }" +
    // Hover-импакт: подъём + усиление тени + подсветка фона.
    ".card { transition:transform .18s cubic-bezier(.2,0,0,1), box-shadow .18s, background .18s; }" +
    ".card:hover { transform:translateY(-4px); background:#242229; " +
    "  box-shadow:0 10px 20px 6px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.4); }" +
    // Поле ввода ответа.
    ".reply { display:flex; gap:8px; margin-top:12px; align-items:center; }" +
    ".reply input { flex:1 1 auto; min-width:0; background:#2A282D; color:#E6E1E5; " +
    "  border:1px solid rgba(230,225,229,0.12); border-radius:12px; padding:9px 12px; " +
    "  font-size:13px; font-family:inherit; outline:none; transition:border-color .15s, background .15s; }" +
    ".reply input::placeholder { color:#8a8f99; }" +
    ".reply input:focus { border-color:#F5A623; background:#2E2B31; }" +
    ".send { flex:0 0 auto; width:36px; height:36px; border:none; border-radius:12px; " +
    "  background:#F5A623; color:#2A1A00; cursor:pointer; display:grid; place-items:center; " +
    "  transition:transform .15s, filter .15s; }" +
    ".send:hover { filter:brightness(1.08); }" +
    ".send:active { transform:scale(0.94); }" +
    ".send svg { width:18px; height:18px; display:block; }" +
    "</style></head><body>" +
    '<div class="card" id="card">' +
    '  <div class="head">' +
    '    <span class="app">Cookie Code</span>' +
    '    <div class="head-actions">' +
    '      <button class="icon-btn" id="btn-close" title="Закрыть">' +
    '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '          <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    "      </button>" +
    "    </div>" +
    "  </div>" +
    '  <div class="row" id="notif-body">' +
    '    <div class="icon-wrap">' +
    iconBlock +
    "    </div>" +
    '    <div class="text">' +
    '      <div class="title">' +
    title +
    "</div>" +
    '      <div class="body"><span class="dot"></span>' +
    body +
    "</div>" +
    "    </div>" +
    "  </div>" +
    '  <div class="reply">' +
    '    <input id="reply-input" type="text" placeholder="Ответить в чат…" autocomplete="off" />' +
    '    <button class="send" id="btn-send" title="Отправить">' +
    '      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2v6z"/></svg>' +
    "    </button>" +
    "  </div>" +
    "</div>" +
    "<script>" +
    "  const card = document.getElementById('card');" +
    "  const input = document.getElementById('reply-input');" +
    "  const btnSend = document.getElementById('btn-send');" +
    "  const btnClose = document.getElementById('btn-close');" +
    "  function hideAndClose() {" +
    "    card.classList.add('hide');" +
    "    setTimeout(() => { try { window.close(); } catch(_){} }, 280);" +
    "  }" +
    "  function submitReply() {" +
    "    const text = (input.value || '').trim();" +
    "    if (!text) return;" +
    "    try { window.electronAPI && window.electronAPI.notifReply && window.electronAPI.notifReply(text); } catch(_){}" +
    "    hideAndClose();" +
    "    try { window.electronAPI && window.electronAPI.notifClose && window.electronAPI.notifClose(); } catch(_){}" +
    "  }" +
    "  btnSend.addEventListener('click', (e) => { e.stopPropagation(); submitReply(); });" +
    "  input.addEventListener('keydown', (e) => {" +
    "    if (e.key === 'Enter') { e.preventDefault(); submitReply(); }" +
    "  });" +
    // Печать/фокус — продлеваем таймер (не закрывать, пока пользователь вводит).
    "  const hold = () => { try { window.electronAPI && window.electronAPI.notifHold && window.electronAPI.notifHold(); } catch(_){} };" +
    "  input.addEventListener('input', hold);" +
    "  input.addEventListener('focus', hold);" +
    "  input.addEventListener('click', (e) => e.stopPropagation());" +
    "  btnClose.addEventListener('click', (e) => {" +
    "    e.stopPropagation();" +
    "    hideAndClose();" +
    "    try { window.electronAPI && window.electronAPI.notifClose && window.electronAPI.notifClose(); } catch(_){}" +
    "  });" +
    // Клик по телу (не по полю/кнопкам) — фокус главного окна.
    "  document.getElementById('notif-body').addEventListener('click', () => {" +
    "    try { window.electronAPI && window.electronAPI.notifFocus && window.electronAPI.notifFocus(); } catch(_){}" +
    "    hideAndClose();" +
    "  });" +
    "  input.focus();" +
    "</script>" +
    "</body></html>"
  );
}

/** Закрыть активное уведомление (если есть). */
function closeActive() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (activeWin && !activeWin.isDestroyed()) {
    try {
      activeWin.destroy();
    } catch (_) {}
  }
  activeWin = null;
}

/**
 * Показать уведомление.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.iconDataUrl] — data:image/... иконка приложения
 * @param {() => void} [opts.onClick] — клик по карточке (фокус окна)
 */
function show(opts = {}) {
  // Одно уведомление за раз — предыдущее закрываем.
  closeActive();

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const work = display.workArea;
  const x = Math.round(work.x + work.width - NOTIF_WIDTH - MARGIN);
  const y = Math.round(work.y + work.height - NOTIF_HEIGHT - MARGIN);

  const preloadPath = path.join(__dirname, "notification-preload.js");
  const html = buildHtml(opts);
  const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(html);

  const win = new BrowserWindow({
    width: NOTIF_WIDTH,
    height: NOTIF_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  activeWin = win;

  win.loadURL(dataUrl);
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.showInactive();
  });

  // Авто-скрытие (можно отложить через cuckoo-notif-hold, пока печатают).
  const startHideTimer = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.webContents
          .executeJavaScript(
            "document.getElementById('card').classList.add('hide');",
            true,
          )
          .catch(() => {});
        setTimeout(() => {
          if (win && !win.isDestroyed()) win.destroy();
        }, 320);
      }
    }, AUTO_HIDE_MS);
  };
  startHideTimer();

  win.on("closed", () => {
    if (activeWin === win) activeWin = null;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  });

  // Запросы из preload уведомления.
  const { ipcMain } = require("electron");
  const focusHandler = () => {
    try {
      if (typeof opts.onClick === "function") opts.onClick();
    } catch (_) {}
    closeActive();
  };
  const closeHandler = () => closeActive();
  // Ответ из окна уведомления — пересылаем в главное окно (в его preload),
  // откуда chat-input.js вставит текст в чат и отправит.
  const replyHandler = (_e, text) => {
    try {
      const target = opts.mainWindow;
      if (target && !target.isDestroyed()) {
        target.webContents.send("cuckoo-notif-reply", String(text || ""));
        // Заодно фокусируем главное окно, чтобы пользователь видел отправку.
        if (target.isMinimized()) target.restore();
        if (!target.isVisible()) target.show();
        target.focus();
      }
    } catch (err) {
      console.error("[Cookie Code] notif reply error:", err.message);
    }
    closeActive();
  };
  // Пока пользователь печатает — не авто-скрываем.
  const holdHandler = () => startHideTimer();

  ipcMain.on("cuckoo-notif-focus", focusHandler);
  ipcMain.on("cuckoo-notif-close", closeHandler);
  ipcMain.on("cuckoo-notif-reply", replyHandler);
  ipcMain.on("cuckoo-notif-hold", holdHandler);
  win.on("closed", () => {
    ipcMain.removeListener("cuckoo-notif-focus", focusHandler);
    ipcMain.removeListener("cuckoo-notif-close", closeHandler);
    ipcMain.removeListener("cuckoo-notif-reply", replyHandler);
    ipcMain.removeListener("cuckoo-notif-hold", holdHandler);
  });

  return win;
}

module.exports = { show, closeActive };
