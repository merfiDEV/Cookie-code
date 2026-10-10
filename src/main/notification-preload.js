/**
 * Preload для окна кастомного уведомления.
 * Прокидывает в страницу уведомления IPC-мост: фокус, закрытие,
 * отправка ответа в чат и продление таймера (пока печатают).
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  notifFocus: () => ipcRenderer.send("cuckoo-notif-focus"),
  notifClose: () => ipcRenderer.send("cuckoo-notif-close"),
  notifReply: (text) => ipcRenderer.send("cuckoo-notif-reply", text),
  notifHold: () => ipcRenderer.send("cuckoo-notif-hold"),
});
