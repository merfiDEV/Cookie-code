/**
 * botsrc/telegram.js
 * Лёгкий Telegram-бот для Cookie Code (без внешних зависимостей).
 *
 * Возможности:
 *  - sendMessage(text)   — уведомления в Telegram (tool выполнился и т.п.)
 *  - startPolling()      — long-polling getUpdates, входящие сообщения →
 *                          отдаются в onMessage(chatId, text)
 *  - stopPolling()       — остановка опроса
 *  - getStatus()         — текущее состояние
 *
 * Токен и chat_id берутся из настроек Cookie Code (cuckoo-settings.json):
 *   telegramBotToken, telegramChatId, telegramEnabled
 *
 * Использует global fetch (Node 18+/Electron), без npm-зависимостей.
 */
const API_BASE = "https://api.telegram.org";

class TelegramBot {
  constructor() {
    this.token = "";
    this.chatId = "";
    this.polling = false;
    this.offset = 0;
    this.pollTimer = null;
    this.onMessage = null; // (chatId, text, msg) => void
    this.onCallback = null; // (chatId, data, cbq) => void
    this.onLog = null; // (level, ...args) => void
    this._lastError = null;
    this._pollDelayMs = 2000; // пауза при ошибке/пустом ответе
    this._queue = []; // очередь исходящих сообщений
    this._draining = false;
    this._minGapMs = 1100; // ~1 msg/sec на чат (лимит Telegram)
  }

  /** Замаскировать токен бота (bot<token>) в произвольной строке. */
  static maskToken(str, token) {
    const s = String(str == null ? "" : str);
    if (!token) return s;
    return s.split(token).join("bot<TOKEN>");
  }

  _log(level, ...args) {
    if (typeof this.onLog !== "function") return;
    const masked = args.map((a) =>
      typeof a === "string" ? TelegramBot.maskToken(a, this.token) : a,
    );
    try {
      this.onLog(level, ...masked);
    } catch (_) {}
  }

  /** Настроить токен/chat_id. Возвращает true, если параметры валидны. */
  configure(token, chatId) {
    this.token = String(token || "").trim();
    this.chatId = String(chatId || "").trim();
    return this.isConfigured();
  }

  isConfigured() {
    return !!this.token && !!this.chatId;
  }

  _apiUrl(method) {
    return API_BASE + "/bot" + this.token + "/" + method;
  }

  /**
   * Низкоуровневый вызов Telegram Bot API с retry на 429 (rate limit).
   * @param {string} method
   * @param {object} body
   * @param {{attempts?: number}} [opts]
   * @returns {Promise<{success:boolean, status?:number, data?:object, error?:string}>}
   */
  async _callApi(method, body, opts = {}) {
    if (!this.token) return { success: false, error: "token не задан" };
    const attempts = opts.attempts || 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const res = await fetch(this._apiUrl(method), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));

        // Rate limit: уважаем retry_after и повторяем.
        if (res.status === 429 || (data && data.error_code === 429)) {
          const retryAfter =
            (data && data.parameters && data.parameters.retry_after) || 3;
          this._log(
            "warn",
            method + ": 429 rate limit, retry через " + retryAfter + "с",
          );
          await this._sleep(retryAfter * 1000);
          continue;
        }

        if (!res.ok || !data.ok) {
          return {
            success: false,
            status: res.status,
            error: (data && data.description) || "HTTP " + res.status,
          };
        }
        return { success: true, status: res.status, data };
      } catch (err) {
        if (attempt < attempts - 1) {
          await this._sleep(1000 * (attempt + 1));
          continue;
        }
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: "rate limit: превышено число попыток" };
  }

  /**
   * Отправить сообщение в Telegram (через очередь, с троттлингом).
   * @param {string} text
   * @param {{chatId?: string, parseMode?: string, replyMarkup?: object}} [opts]
   * @returns {Promise<{success: boolean, error?: string, messageId?: number}>}
   */
  sendMessage(text, opts = {}) {
    if (!this.token)
      return Promise.resolve({ success: false, error: "token не задан" });
    const chatId = opts.chatId || this.chatId;
    if (!chatId)
      return Promise.resolve({ success: false, error: "chat_id не задан" });

    return new Promise((resolve) => {
      this._queue.push({
        method: "sendMessage",
        body: {
          chat_id: chatId,
          text: String(text || ""),
          parse_mode: opts.parseMode || undefined,
          disable_web_page_preview: true,
          reply_markup: opts.replyMarkup || undefined,
        },
        resolve,
      });
      this._drainQueue();
    });
  }

  /**
   * Отправить chat action (например 'typing'). Telegram показывает его ~5 секунд.
   * @param {string} action — 'typing' | 'upload_photo' | 'record_video' | ...
   * @param {{chatId?: string}} [opts]
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendChatAction(action, opts = {}) {
    if (!this.token) return { success: false, error: "token не задан" };
    const chatId = opts.chatId || this.chatId;
    if (!chatId) return { success: false, error: "chat_id не задан" };
    const r = await this._callApi("sendChatAction", {
      chat_id: chatId,
      action: String(action || "typing"),
    });
    return r.success ? { success: true } : { success: false, error: r.error };
  }

  /** Последовательно разгребает очередь с минимальным интервалом между запросами. */
  async _drainQueue() {
    if (this._draining) return;
    this._draining = true;
    while (this._queue.length > 0) {
      const job = this._queue.shift();
      const res = await this._callApi(job.method, job.body);
      if (res.success) {
        this._lastError = null;
        job.resolve({
          success: true,
          messageId: res.data.result && res.data.result.message_id,
        });
      } else {
        this._lastError = res.error;
        job.resolve({ success: false, error: res.error });
      }
      if (this._queue.length > 0) await this._sleep(this._minGapMs);
    }
    this._draining = false;
  }

  /**
   * Отправить документ/файл в Telegram.
   * @param {string} filePath — путь к файлу на диске
   * @param {{chatId?: string, caption?: string, fileName?: string}} [opts]
   * @returns {Promise<{success:boolean, messageId?:number, error?:string}>}
   */
  async sendDocument(filePath, opts = {}) {
    return this._sendFile("sendDocument", "document", filePath, opts);
  }

  /** Отправить фото в Telegram. */
  async sendPhoto(filePath, opts = {}) {
    return this._sendFile("sendPhoto", "photo", filePath, opts);
  }

  /** Общая реализация отправки файла через multipart/form-data. */
  async _sendFile(method, field, filePath, opts = {}) {
    if (!this.token) return { success: false, error: "token не задан" };
    const chatId = opts.chatId || this.chatId;
    if (!chatId) return { success: false, error: "chat_id не задан" };
    try {
      const fs = require("fs");
      const path = require("path");
      if (!fs.existsSync(filePath))
        return { success: false, error: "файл не найден: " + filePath };
      const buf = fs.readFileSync(filePath);
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (opts.caption) form.append("caption", String(opts.caption));
      const name = opts.fileName || path.basename(filePath);
      form.append(field, new Blob([buf]), name);

      const res = await fetch(this._apiUrl(method), {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const err = (data && data.description) || "HTTP " + res.status;
        this._lastError = err;
        return { success: false, error: err };
      }
      this._lastError = null;
      return {
        success: true,
        messageId: data.result && data.result.message_id,
      };
    } catch (err) {
      this._lastError = err.message;
      return { success: false, error: err.message };
    }
  }

  /**
   * Ответить на callback_query (убрать «часики» у нажатой кнопки).
   * @param {string} callbackQueryId
   * @param {{text?: string, showAlert?: boolean}} [opts]
   */
  async answerCallbackQuery(callbackQueryId, opts = {}) {
    const r = await this._callApi("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text: opts.text || undefined,
      show_alert: !!opts.showAlert,
    });
    return r.success ? { success: true } : { success: false, error: r.error };
  }

  /**
   * Отредактировать текст сообщения (и/или клавиатуру под ним).
   * @param {number} messageId
   * @param {string} text
   * @param {{chatId?: string, parseMode?: string, replyMarkup?: object}} [opts]
   */
  async editMessageText(messageId, text, opts = {}) {
    if (!this.token) return { success: false, error: "token не задан" };
    const chatId = opts.chatId || this.chatId;
    if (!chatId) return { success: false, error: "chat_id не задан" };
    const r = await this._callApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: String(text || ""),
      parse_mode: opts.parseMode || undefined,
      disable_web_page_preview: true,
      reply_markup: opts.replyMarkup || undefined,
    });
    return r.success ? { success: true } : { success: false, error: r.error };
  }

  /**
   * Короткий пинг бота: getMe. Полезно для проверки токена из UI.
   */
  async getMe() {
    if (!this.token) return { success: false, error: "token не задан" };
    try {
      const res = await fetch(this._apiUrl("getMe"));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return {
          success: false,
          error: (data && data.description) || "HTTP " + res.status,
        };
      }
      return { success: true, username: data.result && data.result.username };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Запустить long-polling.
   * @param {(chatId: string, text: string, rawMsg: object) => void} onMessage
   * @param {(chatId: string, data: string, cbq: object) => void} [onCallback]
   */
  startPolling(onMessage, onCallback) {
    if (this.polling) {
      // Обновляем обработчики на случай повторного старта.
      this.onMessage =
        typeof onMessage === "function" ? onMessage : this.onMessage;
      this.onCallback =
        typeof onCallback === "function" ? onCallback : this.onCallback;
      return { success: true, already: true };
    }
    if (!this.token) return { success: false, error: "token не задан" };
    this.onMessage = typeof onMessage === "function" ? onMessage : null;
    this.onCallback = typeof onCallback === "function" ? onCallback : null;
    this.polling = true;
    this._log("info", "Telegram polling запущен");
    this._pollLoop();
    return { success: true };
  }

  stopPolling() {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this._log("info", "Telegram polling остановлен");
    return { success: true };
  }

  async _pollLoop() {
    while (this.polling) {
      try {
        const res = await fetch(this._apiUrl("getUpdates"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offset: this.offset,
            timeout: 25, // long-poll: держим соединение до 25с
            allowed_updates: ["message", "callback_query"],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          this._log(
            "warn",
            "getUpdates error:",
            (data && data.description) || res.status,
          );
          await this._sleep(this._pollDelayMs);
          continue;
        }
        const updates = Array.isArray(data.result) ? data.result : [];
        for (const upd of updates) {
          if (typeof upd.update_id === "number") {
            this.offset = upd.update_id + 1;
          }

          // Нажатие inline-кнопки.
          const cbq = upd.callback_query;
          if (cbq) {
            const cbChat = String(
              cbq.message && cbq.message.chat && cbq.message.chat.id,
            );
            if (this.chatId && cbChat !== this.chatId) {
              this._log("warn", "Игнор callback из чужого чата:", cbChat);
              continue;
            }
            if (this.onCallback) {
              try {
                this.onCallback(cbChat, String(cbq.data || ""), cbq);
              } catch (e) {
                this._log("error", "onCallback handler error:", e.message);
              }
            }
            continue;
          }

          const msg = upd.message;
          if (!msg || !msg.text) continue;
          const fromChat = String(msg.chat && msg.chat.id);
          // Принимаем только сообщения от настроенного chat_id (если он задан).
          if (this.chatId && fromChat !== this.chatId) {
            this._log("warn", "Игнор сообщения из чужого чата:", fromChat);
            continue;
          }
          if (this.onMessage) {
            try {
              this.onMessage(fromChat, msg.text, msg);
            } catch (e) {
              this._log("error", "onMessage handler error:", e.message);
            }
          }
        }
        // Если пусто — небольшая пауза, чтобы не долбить API.
        if (updates.length === 0) {
          await this._sleep(this._pollDelayMs);
        }
      } catch (err) {
        this._lastError = err.message;
        this._log("warn", "getUpdates exception:", err.message);
        await this._sleep(this._pollDelayMs * 2);
      }
    }
  }

  _sleep(ms) {
    // Внимание: не используем this.pollTimer — иначе retry/очередь
    // перезапишут таймер long-polling. Обычный setTimeout.
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      polling: this.polling,
      hasToken: !!this.token,
      hasChatId: !!this.chatId,
      lastError: this._lastError,
    };
  }
}

// Singleton — бот один на приложение.
const telegramBot = new TelegramBot();
module.exports = { telegramBot, TelegramBot };
