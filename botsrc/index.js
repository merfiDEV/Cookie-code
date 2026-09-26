/**
 * botsrc/index.js
 * Интеграция Telegram-бота с Cookie Code.
 *
 * Роли:
 *  - читает настройки (token/chatId/enabled/notifyTools/chatFeed) из settings-store;
 *  - запускает/останавливает polling;
 *  - notifyToolResult(toolName, ok, detail)  → уведомление в TG (diff-стиль для edit).
 *  - входящее сообщение из TG → sendToChat в активном окне DeepSeek.
 */
const { telegramBot, TelegramBot } = require("./telegram");
const settingsStore = require("../src/main/settings-store");
const windowState = require("../src/main/window");
const i18n = require("./i18n");

let started = false;

// ==================== Файловый лог ====================
const fs = require("fs");
const path = require("path");
let _logFile = null;
const LOG_MAX_BYTES = 512 * 1024; // 512 KB, затем ротация в .1

function _getLogFile() {
  if (_logFile) return _logFile;
  try {
    const { app } = require("electron");
    _logFile = path.join(app.getPath("userData"), "telegram-bot.log");
  } catch (_) {
    _logFile = path.join(__dirname, "telegram-bot.log");
  }
  return _logFile;
}

function _appendLogFile(line) {
  try {
    const file = _getLogFile();
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > LOG_MAX_BYTES) {
        fs.renameSync(file, file + ".1");
      }
    } catch (_) {}
    fs.appendFileSync(file, line + "\n", "utf-8");
  } catch (_) {}
}

function _read() {
  const s = settingsStore.readSettings();
  return {
    enabled: !!s.telegramEnabled,
    token: s.telegramBotToken || "",
    chatId: s.telegramChatId || "",
    notifyTools: !!s.telegramNotifyTools,
    notifyIgnore: Array.isArray(s.telegramToolNotifyIgnore)
      ? s.telegramToolNotifyIgnore.map((x) => String(x).trim().toLowerCase())
      : [],
    allowedUserId: String(s.telegramAllowedUserId || "").trim(),
    chatFeed: !!s.telegramChatFeed,
    approvalMode: s.toolApprovalMode || "off",
    lang: i18n.normalizeLang(s.telegramLanguage),
  };
}

/** Текущий язык бота. */
function _lang() {
  return i18n.getBotLang();
}

/** Строка i18n по текущему языку бота. */
function _t(key, vars) {
  return i18n.t(_lang(), key, vars);
}

/**
 * Выбирал ли пользователь язык бота явно.
 * Читаем сырой файл настроек: если ключа telegramLanguage нет — язык не выбран.
 */
function _langChosen() {
  try {
    const fs = require("fs");
    const file = settingsStore.getSettingsPath();
    if (!fs.existsSync(file)) return false;
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return !!(parsed && parsed.telegramLanguage != null);
  } catch (_) {
    return false;
  }
}

function _log(level, ...args) {
  const tag = "[Cookie Code][telegram]";
  const token = (() => {
    try {
      return settingsStore.readSettings().telegramBotToken;
    } catch (_) {
      return "";
    }
  })();
  const safe = args.map((a) =>
    typeof a === "string" ? TelegramBot.maskToken(a, token) : a,
  );
  if (level === "error") console.error(tag, ...safe);
  else if (level === "warn") console.warn(tag, ...safe);
  else console.log(tag, ...safe);
  // Дублируем в файл для отладки (уровни warn/error + info).
  try {
    const ts = new Date().toISOString();
    const text = safe
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    _appendLogFile(ts + " [" + level + "] " + text);
  } catch (_) {}
}

/**
 * Отправить текст в активное окно DeepSeek как сообщение пользователя.
 * Использует тот же путь, что и оверлей: native Enter.
 * Вставляем текст в textarea и жмём Enter.
 */
async function _sendToChat(text) {
  try {
    const win = windowState.getMainWindow();
    if (!win || win.isDestroyed())
      return { success: false, error: "нет активного окна" };

    const safe = JSON.stringify(String(text));
    const script = `(function(){
      const ta = document.querySelector('textarea[placeholder], textarea[name="search"], textarea.ds-scroll-area');
      if (!ta) return { ok: false, error: 'textarea not found' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${safe});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      return { ok: true };
    })()`;

    await win.webContents.executeJavaScript(script, true);
    // Небольшая пауза, чтобы React обработал ввод.
    await new Promise((r) => setTimeout(r, 150));
    // Отправляем нативный Enter (тот же приём, что chat-send-enter).
    win.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: "Return",
      key: "Enter",
    });
    win.webContents.sendInputEvent({
      type: "char",
      keyCode: "Return",
      key: "\r",
    });
    win.webContents.sendInputEvent({
      type: "keyUp",
      keyCode: "Return",
      key: "Enter",
    });
    return { success: true };
  } catch (err) {
    _log("error", "sendToChat error:", err.message);
    return { success: false, error: err.message };
  }
}

/** Выполнить JS в активном окне и вернуть результат. */
async function _evalInWindow(script) {
  const win = windowState.getMainWindow();
  if (!win || win.isDestroyed())
    return { success: false, error: "нет активного окна" };
  try {
    const result = await win.webContents.executeJavaScript(script, true);
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** Получить контекст активного окна (профиль/сессия/projectDir). */
function _activeContext() {
  try {
    const win = windowState.getMainWindow();
    if (win && !win.isDestroyed() && win.webContents) {
      return windowState.getContextByWebContents(win.webContents);
    }
  } catch (_) {}
  return null;
}

/** Получить id активного окна (для доступа к его todo-списку). */
function _activeSenderId() {
  try {
    const win = windowState.getMainWindow();
    if (win && !win.isDestroyed() && win.webContents) return win.webContents.id;
  } catch (_) {}
  return null;
}

/** Текст со списком задач (для /todos и уведомления о завершении). */
function formatTodos(todos) {
  const items = Array.isArray(todos) ? todos : [];
  if (items.length === 0) return _t("todos.empty");
  const icon = { pending: "☐", in_progress: "◔", completed: "☑" };
  const done = items.filter((t) => t.status === "completed").length;
  const lines = items.map((t) => (icon[t.status] || "☐") + " " + t.content);
  return (
    _t("todos.header", { done: done, total: items.length }) +
    "\n" +
    lines.join("\n")
  );
}

/**
 * Реестр активных вопросов, отправленных в Telegram.
 * key = requestId, value = { questions, answers: [], messageId, resolve }
 * Ответ из TG резолвит promise и вызывает onAnswered(requestId, answers).
 */
const _pendingQuestions = new Map();
/**
 * Карта callback_data → { requestId, qi, oi }.
 * callback_data ограничен 64 байтами, поэтому вместо requestId
 * используем короткий числовой токен.
 */
const _callbackTokens = new Map();
const _pendingApprovals = new Map();
const _approvalCallbackTokens = new Map();
/**
 * Реестр уведомлений о долгих процессах.
 * key = token ('k<number>') → { pid, messageId }
 */
const _longProcessTokens = new Map();
let _cbTokenCounter = 0;
let _onQuestionAnswered = null;

/** Установить колбэк, вызываемый при ответе на вопрос из TG. */
function setOnQuestionAnswered(fn) {
  _onQuestionAnswered = typeof fn === "function" ? fn : null;
}

/** Экранирование для HTML в тексте вопроса. */
function _qEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Отправить вопросы в Telegram с inline-клавиатурой.
 * Все вопросы — одним сообщением; кнопки callback_data = q<idx>_o<opt>.
 * @param {string} requestId  идентификатор запроса из ipc.js
 * @param {Array<{question: string, options: Array<{label: string, description?: string}>}>} questions
 * @returns {Promise<{success: boolean, error?: string, skipped?: boolean}>}
 */
async function askQuestion(requestId, questions) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.token || !cfg.chatId)
    return { success: false, skipped: true };
  const items = Array.isArray(questions) ? questions : [];
  if (items.length === 0) return { success: false, skipped: true };

  const lines = [_t("question.title")];
  items.forEach((q, qi) => {
    lines.push("");
    lines.push(qi + 1 + ". " + _qEsc(q.question));
  });
  lines.push("");
  lines.push(_t("question.hint"));
  const text = lines.join("\n");

  const entry = {
    questions: items,
    answers: new Array(items.length).fill(null),
    messageId: null,
    tokens: [],
  };
  _pendingQuestions.set(requestId, entry);

  // Клавиатура: по строке на каждый вариант каждого вопроса.
  // callback_data — короткий токен 't<number>', привязанный к (requestId, qi, oi).
  const keyboard = [];
  items.forEach((q, qi) => {
    const opts = Array.isArray(q.options) ? q.options : [];
    entry.tokens[qi] = [];
    opts.forEach((o, oi) => {
      const label = String(o.label || "").slice(0, 60);
      const token = "t" + ++_cbTokenCounter;
      _callbackTokens.set(token, { requestId, qi, oi });
      entry.tokens[qi][oi] = token;
      keyboard.push([{ text: qi + 1 + ") " + label, callback_data: token }]);
    });
  });

  const res = await telegramBot.sendMessage(text, {
    parseMode: "HTML",
    replyMarkup: { inline_keyboard: keyboard },
  });
  if (!res.success) {
    _pendingQuestions.delete(requestId);
    return res;
  }
  entry.messageId = res.messageId || null;
  return { success: true };
}

/** Обработать нажатие inline-кнопки с ответом на вопрос. */
async function _handleCallback(chatId, data, cbq) {
  const token = String(data || "");

  // Меню настроек /settings — обрабатываем раньше других, т.к. префикс 'st_'.
  if (token.startsWith("st_")) {
    try {
      await _handleSettingsCallback(token, cbq);
    } catch (err) {
      _log("error", "settings callback error:", err.message);
    }
    return;
  }

  const approvalRef = _approvalCallbackTokens.get(token);
  if (approvalRef) {
    await _handleApprovalCallback(approvalRef, cbq);
    return;
  }
  const longProcRef = _longProcessTokens.get(token);
  if (longProcRef) {
    await _handleLongProcessCallback(token, longProcRef, cbq);
    return;
  }
  const ref = _callbackTokens.get(token);
  if (!ref) {
    await telegramBot.answerCallbackQuery(cbq.id);
    return;
  }
  const { requestId, qi, oi } = ref;
  const entry = _pendingQuestions.get(requestId);
  if (!entry || entry.answers[qi] != null) {
    _callbackTokens.delete(token);
    await telegramBot.answerCallbackQuery(cbq.id, {
      text: _t("question.closed"),
    });
    return;
  }

  const q = entry.questions[qi];
  const opt = (q.options || [])[oi];
  if (!opt) {
    await telegramBot.answerCallbackQuery(cbq.id, {
      text: _t("question.notFound"),
    });
    return;
  }

  entry.answers[qi] = { question: q.question, answer: String(opt.label || "") };
  await telegramBot.answerCallbackQuery(cbq.id, {
    text: _t("question.accepted", {
      answer: String(opt.label || "").slice(0, 40),
    }),
  });

  // Обновляем сообщение: показываем выбранные ответы, убираем использованные кнопки.
  _refreshQuestionMessage(requestId, entry);

  // Если все вопросы отвечены — резолвим и чистим токены.
  if (entry.answers.every((a) => a && a.answer)) {
    _pendingQuestions.delete(requestId);
    for (const row of entry.tokens) {
      for (const t of row || []) _callbackTokens.delete(t);
    }
    if (typeof _onQuestionAnswered === "function") {
      try {
        _onQuestionAnswered(requestId, entry.answers.slice());
      } catch (err) {
        _log("error", "onQuestionAnswered error:", err.message);
      }
    }
  }
}

/** Отправить запрос подтверждения tool-вызова в Telegram. */
async function requestApproval(requestId, info) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.token || !cfg.chatId || cfg.approvalMode === "off") {
    return { success: false, skipped: true };
  }
  const id = String(requestId || "");
  if (!id) return { success: false, error: "requestId не задан" };

  const isJs = info && info.kind === "js";
  const name = isJs
    ? _t("approval.jsScript")
    : String((info && info.toolName) || _t("approval.tool"));
  let details = "";
  try {
    details = isJs
      ? String((info && info.code) || "")
      : JSON.stringify((info && info.params) || {}, null, 2);
  } catch (_) {
    details = "";
  }
  const body = escapeHtml(details.slice(0, 3000));
  const token = "a" + ++_cbTokenCounter;
  const entry = { messageId: null, token, resolve: null };
  const promise = new Promise((resolve) => {
    entry.resolve = resolve;
  });
  _pendingApprovals.set(id, entry);
  _approvalCallbackTokens.set(token, { requestId: id, approved: true });

  const msg =
    _t("approval.title") +
    "\n<b>" +
    escapeHtml(name) +
    "</b>" +
    (body ? "\n<pre>" + body + "</pre>" : "") +
    "\n" +
    _t("approval.ask");
  const res = await telegramBot.sendMessage(msg, {
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [
          { text: _t("approval.allow"), callback_data: token },
          { text: _t("approval.deny"), callback_data: token + "d" },
        ],
      ],
    },
  });
  if (!res.success) {
    _pendingApprovals.delete(id);
    _approvalCallbackTokens.delete(token);
    return res;
  }
  entry.messageId = res.messageId || null;
  _approvalCallbackTokens.set(token + "d", { requestId: id, approved: false });
  return promise;
}

async function _handleApprovalCallback(ref, cbq) {
  const entry = _pendingApprovals.get(ref.requestId);
  if (!entry) {
    await telegramBot.answerCallbackQuery(cbq.id, {
      text: _t("approval.closed"),
    });
    return;
  }
  _pendingApprovals.delete(ref.requestId);
  _approvalCallbackTokens.delete(entry.token);
  _approvalCallbackTokens.delete(entry.token + "d");
  await telegramBot.answerCallbackQuery(cbq.id, {
    text: ref.approved ? _t("approval.allowed") : _t("approval.denied"),
  });
  if (entry.messageId) {
    const status = ref.approved
      ? _t("approval.allowedShort")
      : _t("approval.deniedShort");
    await telegramBot.editMessageText(
      entry.messageId,
      _t("approval.title") + "\n" + status,
      {
        parseMode: "HTML",
        replyMarkup: { inline_keyboard: [] },
      },
    );
  }
  if (typeof entry.resolve === "function") {
    entry.resolve({ success: true, approved: ref.approved });
  }
}

/** Отменить запрос, если подтверждение уже получено в окне приложения. */
function cancelApproval(requestId) {
  const id = String(requestId || "");
  const entry = _pendingApprovals.get(id);
  if (!entry) return { success: true, skipped: true };
  _pendingApprovals.delete(id);
  _approvalCallbackTokens.delete(entry.token);
  _approvalCallbackTokens.delete(entry.token + "d");
  if (typeof entry.resolve === "function")
    entry.resolve({ success: false, skipped: true });
  return { success: true };
}

/**
 * Уведомить о долгоиграющем процессе и прислать кнопку «Убить процесс».
 * Вызывается из bash/pwsh инструментов, если команда не завершилась за N сек.
 * @param {number} pid      pid дочернего процесса
 * @param {string} command  текст команды (для сообщения)
 * @param {number} sec      порог в секундах (для текста)
 * @returns {Promise<{success:boolean, skipped?:boolean, error?:string}>}
 */
async function notifyLongProcess(pid, command, sec) {
  const cfg = _read();
  console.log(
    "[LongProc] notifyLongProcess cfg:",
    JSON.stringify({
      enabled: cfg.enabled,
      hasToken: !!cfg.token,
      chatId: cfg.chatId,
    }),
  );
  if (!cfg.enabled || !cfg.token || !cfg.chatId)
    return { success: false, skipped: true };
  const numPid = Number(pid);
  if (!numPid) return { success: false, error: "pid не задан" };

  const token = "k" + ++_cbTokenCounter;
  const cmd = String(command || "").slice(0, 500);
  const msg =
    _t("longproc.title") +
    "\n" +
    _t("longproc.body", { sec: sec || 10 }) +
    "\n<pre>" +
    escapeHtml(cmd) +
    "</pre>";
  const res = await telegramBot.sendMessage(msg, {
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [[{ text: _t("longproc.kill"), callback_data: token }]],
    },
  });
  if (!res.success) return res;
  _longProcessTokens.set(token, {
    pid: numPid,
    messageId: res.messageId || null,
  });
  return { success: true, token };
}

/** Обработать нажатие кнопки «Убить процесс». */
async function _handleLongProcessCallback(token, ref, cbq) {
  _longProcessTokens.delete(token);
  let killed = false;
  let notFound = false;
  try {
    const { processManager } = require("../src/main/process-manager");
    const r = await processManager.killProcess(ref.pid);
    killed = !!(r && r.success);
    notFound = !killed && !!(r && /не найден/.test(r.error || ""));
  } catch (err) {
    _log("error", "killProcess error:", err.message);
  }
  const statusText = killed
    ? _t("longproc.killed")
    : notFound
      ? _t("longproc.gone")
      : _t("longproc.killFailed");
  await telegramBot.answerCallbackQuery(cbq.id, {
    text: killed
      ? _t("longproc.killed")
      : notFound
        ? _t("longproc.gone")
        : _t("longproc.killFailed"),
  });
  if (ref.messageId) {
    await telegramBot.editMessageText(
      ref.messageId,
      _t("longproc.title") + "\n" + statusText,
      { parseMode: "HTML", replyMarkup: { inline_keyboard: [] } },
    );
  }
}

/** Перерисовать сообщение с вопросами: отметить выбранное, убрать лишние кнопки. */
async function _refreshQuestionMessage(requestId, entry) {
  if (!entry.messageId) return;
  const lines = [_t("question.title")];
  entry.questions.forEach((q, qi) => {
    lines.push("");
    const chosen = entry.answers[qi];
    lines.push(qi + 1 + ". " + _qEsc(q.question));
    if (chosen) lines.push("✅ " + _qEsc(chosen.answer));
  });

  // Оставляем кнопки только для неотвеченных вопросов.
  const keyboard = [];
  entry.questions.forEach((q, qi) => {
    if (entry.answers[qi]) return;
    const opts = Array.isArray(q.options) ? q.options : [];
    opts.forEach((o, oi) => {
      const label = String(o.label || "").slice(0, 60);
      const token =
        (entry.tokens[qi] && entry.tokens[qi][oi]) || "t" + ++_cbTokenCounter;
      if (!_callbackTokens.has(token))
        _callbackTokens.set(token, { requestId, qi, oi });
      keyboard.push([{ text: qi + 1 + ") " + label, callback_data: token }]);
    });
  });

  await telegramBot.editMessageText(entry.messageId, lines.join("\n"), {
    parseMode: "HTML",
    replyMarkup: keyboard.length
      ? { inline_keyboard: keyboard }
      : { inline_keyboard: [] },
  });
}

// ==================== Настройки через Telegram (/settings) ====================
//
// Все редактируемые настройки Cookie Code, кроме обоев.
//   key — ключ в cuckoo-settings.json; label — заголовок; type — bool/number/enum/text/multiline/color;
//   values — для enum; step/min/max — для number; secret — маскировать значение.

const SETTINGS_PAGES = {
  root: {
    titleKey: "settings.root.title",
    textKey: "settings.root.text",
    items: [
      { goto: "ui", labelKey: "settings.page.ui" },
      { goto: "glass", labelKey: "settings.page.glass" },
      { goto: "agent", labelKey: "settings.page.agent" },
      { goto: "pets", labelKey: "settings.page.pets" },
      { goto: "tg", labelKey: "settings.page.tg" },
      { goto: "lang", labelKey: "settings.page.lang" },
    ],
  },
  ui: {
    titleKey: "settings.ui.title",
    textKey: "settings.ui.text",
    items: [
      {
        key: "customizationEnabled",
        labelKey: "label.customizationEnabled",
        type: "bool",
      },
      { key: "rgbUsername", labelKey: "label.rgbUsername", type: "bool" },
      {
        key: "language",
        labelKey: "label.language",
        type: "enum",
        values: [
          ["ru", "🇷🇺 RU"],
          ["en", "🇬🇧 EN"],
        ],
      },
    ],
    back: true,
  },
  glass: {
    titleKey: "settings.glass.title",
    textKey: "settings.glass.text",
    items: [
      {
        key: "backgroundBlur",
        labelKey: "label.backgroundBlur",
        type: "number",
        step: 2,
        min: 0,
        max: 30,
        unit: "px",
      },
      {
        key: "headerBlur",
        labelKey: "label.headerBlur",
        type: "number",
        step: 2,
        min: 0,
        max: 30,
        unit: "px",
      },
      {
        key: "sidebarBlur",
        labelKey: "label.sidebarBlur",
        type: "number",
        step: 2,
        min: 0,
        max: 30,
        unit: "px",
      },
      {
        key: "headerOpacity",
        labelKey: "label.headerOpacity",
        type: "number",
        step: 5,
        min: 0,
        max: 100,
        unit: "%",
      },
      {
        key: "sidebarOpacity",
        labelKey: "label.sidebarOpacity",
        type: "number",
        step: 5,
        min: 0,
        max: 100,
        unit: "%",
      },
      {
        key: "toolBlockOpacity",
        labelKey: "label.toolBlockOpacity",
        type: "number",
        step: 5,
        min: 0,
        max: 100,
        unit: "%",
      },
      {
        key: "toolBlockBlur",
        labelKey: "label.toolBlockBlur",
        type: "number",
        step: 2,
        min: 0,
        max: 30,
        unit: "px",
      },
      {
        key: "overlayOpacity",
        labelKey: "label.overlayOpacity",
        type: "number",
        step: 5,
        min: 0,
        max: 100,
        unit: "%",
      },
      {
        key: "overlayBlur",
        labelKey: "label.overlayBlur",
        type: "number",
        step: 2,
        min: 0,
        max: 30,
        unit: "px",
      },
      {
        key: "overlayWidth",
        labelKey: "label.overlayWidth",
        type: "number",
        step: 20,
        min: 200,
        max: 600,
        unit: "px",
      },
      {
        key: "overlayBtnRadius",
        labelKey: "label.overlayBtnRadius",
        type: "number",
        step: 2,
        min: 0,
        max: 24,
        unit: "px",
      },
      {
        key: "overlayBgColor",
        labelKey: "label.overlayBgColor",
        type: "color",
      },
      {
        key: "overlayPrimaryColor",
        labelKey: "label.overlayPrimaryColor",
        type: "color",
      },
    ],
    back: true,
  },
  agent: {
    titleKey: "settings.agent.title",
    textKey: "settings.agent.text",
    items: [
      {
        key: "toolApprovalMode",
        labelKey: "label.toolApprovalMode",
        type: "enum",
        values: [
          ["off", "⚪ Off"],
          ["risky", "🟡 Risky"],
          ["all", "🔴 All"],
        ],
      },
      {
        key: "hideSystemMessages",
        labelKey: "label.hideSystemMessages",
        type: "bool",
      },
      {
        key: "formattersEnabled",
        labelKey: "label.formattersEnabled",
        type: "bool",
      },
      {
        key: "fileChipEnabled",
        labelKey: "label.fileChipEnabled",
        type: "bool",
      },
      {
        key: "showProducedFiles",
        labelKey: "label.showProducedFiles",
        type: "bool",
      },
      {
        key: "dangerousPatterns",
        labelKey: "label.dangerousPatterns",
        type: "multiline",
      },
      {
        key: "jsTimeoutSec",
        labelKey: "label.jsTimeoutSec",
        type: "number",
        step: 10,
        min: 10,
        max: 1000,
        unit: "s",
      },
    ],
    back: true,
  },
  pets: {
    titleKey: "settings.pets.title",
    textKey: "settings.pets.text",
    items: [
      {
        key: "petEnabled",
        labelKey: "label.petEnabled",
        type: "bool",
      },
      {
        key: "petId",
        labelKey: "label.petId",
        type: "enum",
        dynamicValues: () => {
          const pets = _listPets();
          if (!pets.length) {
            return [["", _t("common.empty")]];
          }
          return pets.map((p) => [p.id, p.id]);
        },
      },
      {
        key: "petDebugMode",
        labelKey: "label.petDebugMode",
        type: "bool",
      },
    ],
    back: true,
  },
  tg: {
    titleKey: "settings.tg.title",
    textKey: "settings.tg.text",
    items: [
      {
        key: "telegramEnabled",
        labelKey: "label.telegramEnabled",
        type: "bool",
      },
      {
        key: "telegramNotifyTools",
        labelKey: "label.telegramNotifyTools",
        type: "bool",
      },
      {
        key: "telegramChatFeed",
        labelKey: "label.telegramChatFeed",
        type: "bool",
      },
      {
        key: "telegramBotToken",
        labelKey: "label.telegramBotToken",
        type: "text",
        secret: true,
      },
      { key: "telegramChatId", labelKey: "label.telegramChatId", type: "text" },
      {
        key: "telegramAllowedUserId",
        labelKey: "label.telegramAllowedUserId",
        type: "text",
      },
      {
        key: "telegramToolNotifyIgnore",
        labelKey: "label.telegramToolNotifyIgnore",
        type: "multiline",
      },
    ],
    back: true,
  },
  lang: {
    titleKey: "settings.lang.title",
    textKey: "settings.lang.text",
    items: [
      {
        key: "telegramLanguage",
        labelKey: "label.telegramLanguage",
        type: "enum",
        values: [
          ["ru", "🇷🇺 Русский"],
          ["en", "🇬🇧 English"],
        ],
      },
    ],
    back: true,
  },
};

const _settingsState = new Map();
const _settingsWaiting = new Map();

function _findSetting(key) {
  for (const name of Object.keys(SETTINGS_PAGES)) {
    const page = SETTINGS_PAGES[name];
    if (!page.items) continue;
    for (const it of page.items)
      if (it.key === key) return { page: name, item: it };
  }
  return null;
}

/**
 * Список спрайтов петов из <userData>/pets (или [] при ошибке).
 * Возвращает [{id, label, file}].
 */
function _listPets() {
  try {
    const fs = require("fs");
    const path = require("path");
    const { app } = require("electron");
    const dir = path.join(app.getPath("userData"), "pets");
    if (!fs.existsSync(dir)) return [];
    const EXTS = [".png", ".gif", ".webp", ".jpg", ".jpeg"];
    return fs
      .readdirSync(dir)
      .filter((f) => EXTS.includes(path.extname(f).toLowerCase()))
      .sort()
      .map((f) => {
        const ext = path.extname(f);
        const base = f.slice(0, -ext.length);
        return { id: base, label: base, file: path.join(dir, f) };
      });
  } catch (_) {
    return [];
  }
}

function _getVal(key) {
  try {
    return settingsStore.readSettings()[key];
  } catch (_) {
    return undefined;
  }
}

function _setVal(key, value) {
  try {
    return !!settingsStore.setSetting(key, value);
  } catch (err) {
    _log("error", "setSetting error:", err.message);
    return false;
  }
}

function _esc(s) {
  return escapeHtml(s);
}

/** Локализованный лейбл настройки (или её ключ как fallback). */
function _label(item) {
  if (!item) return "";
  if (item.labelKey) return _t(item.labelKey);
  return item.label || item.key || "";
}

/**
 * Получить актуальный список значений для enum.
 * Если у item задан dynamicValues (функция), — вызываем её и получаем свежий
 * массив [value, label]. Иначе — статический item.values.
 */
function _enumValues(item) {
  if (typeof item.dynamicValues === "function") {
    try {
      const v = item.dynamicValues();
      if (Array.isArray(v) && v.length) return v;
    } catch (err) {
      _log("error", "dynamicValues error:", err.message);
    }
  }
  return item.values || [];
}

function _formatValue(item, value) {
  if (item.type === "bool") return value ? _t("common.on") : _t("common.off");
  if (item.type === "enum") {
    const found = _enumValues(item).find(([v]) => v === value);
    return found ? found[1] : String(value);
  }
  if (item.type === "number") return String(value) + (item.unit || "");
  if (item.type === "color") return String(value || "");
  if (item.type === "text" || item.type === "multiline") {
    if (item.secret)
      return value ? "••••" + String(value).slice(-4) : _t("common.empty");
    const s = String(value == null ? "" : value);
    return s.length > 20 ? s.slice(0, 20) + "…" : s || _t("common.empty");
  }
  return String(value);
}

function _renderPage(pageName) {
  const page = SETTINGS_PAGES[pageName];
  if (!page) return _renderPage("root");
  const lines = [
    page.titleKey ? _t(page.titleKey) : page.title,
    "",
    page.textKey ? _t(page.textKey) : page.text,
  ];
  const keyboard = [];
  if (page.items) {
    for (const item of page.items) {
      // Пункт-переход на другую страницу.
      if (item.goto) {
        keyboard.push([
          {
            text: _label(item),
            callback_data: "st_page_" + item.goto,
          },
        ]);
        continue;
      }
      const v = _getVal(item.key);
      const lbl = _label(item);
      if (item.type === "bool") {
        const icon = v ? "✅" : "⚪";
        keyboard.push([
          { text: icon + " " + lbl, callback_data: "st_t_" + item.key },
        ]);
      } else if (item.type === "enum") {
        const cur = _formatValue(item, v);
        keyboard.push([{ text: lbl + ": " + cur, callback_data: "st_noop" }]);
        const opts = _enumValues(item).map(([val, lblVal]) => ({
          text: lblVal,
          callback_data: "st_s_" + item.key + "__" + val,
        }));
        if (opts.length) keyboard.push(opts);
      } else if (item.type === "number") {
        const cur = _formatValue(item, v);
        keyboard.push([
          { text: "➖", callback_data: "st_n_" + item.key + "_-" },
          { text: lbl + ": " + cur, callback_data: "st_noop" },
          { text: "➕", callback_data: "st_n_" + item.key + "_+" },
        ]);
      } else if (item.type === "color") {
        keyboard.push([
          { text: "✏️ " + lbl, callback_data: "st_e_" + item.key },
          { text: String(v || ""), callback_data: "st_noop" },
        ]);
      } else if (item.type === "text" || item.type === "multiline") {
        keyboard.push([
          {
            text: "✏️ " + lbl + ": " + _formatValue(item, v),
            callback_data: "st_e_" + item.key,
          },
        ]);
      }
    }
  }
  if (page.back) {
    keyboard.push([{ text: _t("common.back"), callback_data: "st_page_root" }]);
  } else {
    // Корневая страница — переходы уже добавлены из items (goto).
    keyboard.push([
      { text: _t("common.refresh"), callback_data: "st_page_root" },
    ]);
  }
  return { text: lines.join("\n"), keyboard: { inline_keyboard: keyboard } };
}

async function _showSettingsMenu(chatId, pageName, messageId) {
  const state = _settingsState.get(chatId) || {};
  const page = SETTINGS_PAGES[pageName] ? pageName : "root";
  state.page = page;
  _settingsState.set(chatId, state);
  const { text, keyboard } = _renderPage(page);
  if (messageId) {
    return telegramBot.editMessageText(messageId, text, {
      parseMode: "HTML",
      replyMarkup: keyboard,
    });
  }
  const res = await telegramBot.sendMessage(text, {
    parseMode: "HTML",
    replyMarkup: keyboard,
  });
  if (res.success && res.messageId) {
    state.msgId = res.messageId;
    _settingsState.set(chatId, state);
  }
  return res;
}

async function _handleSettingsCallback(data, cbq) {
  const chatId = String(cbq.message && cbq.message.chat && cbq.message.chat.id);
  const msgId = cbq.message && cbq.message.message_id;
  const state = _settingsState.get(chatId) || { page: "root" };

  // ---- Пагинация списков (/sessions, /log) ----
  if (data.startsWith("st_pg_")) {
    const rest = data.slice("st_pg_".length);
    const sep = rest.lastIndexOf("_");
    const type = rest.slice(0, sep);
    const page = parseInt(rest.slice(sep + 1), 10) || 1;
    await telegramBot.answerCallbackQuery(cbq.id);
    const pager = _pagers.get(chatId + ":" + type);
    if (!pager) return;
    pager.page = page;
    if (type === "sessions") {
      await _cmdSessions(chatId, page);
    } else if (type === "log") {
      await _cmdLog(chatId, page);
    } else if (type === "todos") {
      await _cmdTodos(chatId, page);
    } else if (type === "diff") {
      await _cmdDiff(chatId, page);
    }
    return;
  }

  // ---- Выбор языка бота (/start) ----
  if (data.startsWith("st_lang_")) {
    const lang = i18n.normalizeLang(data.slice("st_lang_".length));
    const ok = _setVal("telegramLanguage", lang);
    await telegramBot.answerCallbackQuery(cbq.id, {
      text: ok
        ? i18n.t(lang, "lang.saved", { lang: i18n.t(lang, "lang." + lang) })
        : i18n.t(lang, "common.error"),
    });
    // Убираем клавиатуру выбора и показываем помощь на выбранном языке.
    if (msgId) {
      try {
        await telegramBot.editMessageText(
          msgId,
          i18n.t(lang, "lang.saved", {
            lang: i18n.t(lang, "lang." + lang),
          }),
          { parseMode: "HTML", replyMarkup: { inline_keyboard: [] } },
        );
      } catch (_) {}
    }
    await _cmdHelp();
    return;
  }
  if (data.startsWith("st_page_")) {
    await telegramBot.answerCallbackQuery(cbq.id);
    await _showSettingsMenu(chatId, data.slice("st_page_".length), msgId);
    return;
  }
  if (data.startsWith("st_t_")) {
    const key = data.slice("st_t_".length);
    const next = !_getVal(key);
    const ok = _setVal(key, next);
    await telegramBot.answerCallbackQuery(cbq.id, {
      text: ok
        ? next
          ? _t("cb.enabled")
          : _t("cb.disabled")
        : _t("common.error"),
    });
    if (ok) {
      try {
        await applySettings();
      } catch (_) {}
      _notifySettingsChanged({ [key]: next });
    }
    await _showSettingsMenu(chatId, state.page, msgId);
    return;
  }
  if (data.startsWith("st_s_")) {
    const rest = data.slice("st_s_".length);
    const sep = rest.indexOf("__");
    const key = rest.slice(0, sep);
    const val = rest.slice(sep + 2);
    const ok = _setVal(key, val);
    await telegramBot.answerCallbackQuery(cbq.id, {
      text: ok ? _t("cb.saved") : _t("common.error"),
    });
    if (ok) {
      if (key === "language") {
        try {
          await applySettings();
        } catch (_) {}
      }
      // Пуш в UI: enum мог изменить выбор пета, язык UI, режим approval и т.д.
      _notifySettingsChanged({ [key]: val });
    }
    await _showSettingsMenu(chatId, state.page, msgId);
    return;
  }
  if (data.startsWith("st_n_")) {
    const rest = data.slice("st_n_".length);
    const sep = rest.lastIndexOf("_");
    const key = rest.slice(0, sep);
    const sign = rest.slice(sep + 1);
    const found = _findSetting(key);
    if (!found) {
      await telegramBot.answerCallbackQuery(cbq.id);
      return;
    }
    const item = found.item;
    const step = item.step || 1;
    let val = Number(_getVal(key));
    if (!Number.isFinite(val)) val = 0;
    val += sign === "+" ? step : -step;
    if (typeof item.min === "number") val = Math.max(item.min, val);
    if (typeof item.max === "number") val = Math.min(item.max, val);
    const ok = _setVal(key, val);
    await telegramBot.answerCallbackQuery(cbq.id, {
      text: ok ? String(val) + (item.unit || "") : _t("common.error"),
    });
    if (ok) _notifySettingsChanged({ [key]: val });
    await _showSettingsMenu(chatId, state.page, msgId);
    return;
  }
  if (data.startsWith("st_e_")) {
    const key = data.slice("st_e_".length);
    const found = _findSetting(key);
    if (!found) {
      await telegramBot.answerCallbackQuery(cbq.id);
      return;
    }
    _settingsWaiting.set(chatId, { key });
    await telegramBot.answerCallbackQuery(cbq.id, {
      text: _t("input.prompt"),
    });
    const cur = _getVal(key);
    const hint =
      found.item.type === "multiline"
        ? _t("input.hintList")
        : _t("input.hintOne");
    const curText =
      found.item.type === "multiline"
        ? Array.isArray(cur)
          ? cur.join("\n")
          : String(cur || "")
        : String(cur == null ? "" : cur);
    await telegramBot.sendMessage(
      "✏️ <b>" +
        _esc(_label(found.item)) +
        "</b>\n" +
        hint +
        "\n\n" +
        _t("input.current") +
        "\n<pre>" +
        _esc(curText.slice(0, 1500)) +
        "</pre>",
      { parseMode: "HTML" },
    );
    return;
  }
  if (data === "st_noop") {
    await telegramBot.answerCallbackQuery(cbq.id);
    return;
  }
  await telegramBot.answerCallbackQuery(cbq.id);
}

/** /stop — прервать задачу и убить активные дочерние процессы. */
async function _cmdStop() {
  let count = 0;
  try {
    const win = windowState.getMainWindow();
    if (
      win &&
      !win.isDestroyed() &&
      win.webContents &&
      !win.webContents.isDestroyed()
    ) {
      try {
        win.webContents.stop();
      } catch (_) {}
    }
    const { processManager } = require("../src/main/process-manager");
    const r = await processManager.killAll();
    count = r.count || 0;
  } catch (err) {
    _log("error", "/stop error:", err.message);
    return telegramBot.sendMessage(
      _t("stop.failed", { err: escapeHtml(err.message) }),
    );
  }
  return telegramBot.sendMessage(_t("stop.done", { n: count }), {
    parseMode: "HTML",
  });
}

/** /status — окно, проект, процессы, версия, polling. */
async function _cmdStatus() {
  const cfg = _read();
  const lines = [_t("status.title"), ""];

  let version = "?";
  try {
    version = require("electron").app.getVersion();
  } catch (_) {}
  lines.push(_t("status.version", { v: escapeHtml(version) }));

  const win = windowState.getMainWindow();
  const winOk = !!(win && !win.isDestroyed());
  lines.push(
    _t("status.window") +
      (winOk ? _t("status.window.ok") : _t("status.window.none")),
  );

  const ctx = _activeContext();
  const projectDir =
    ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
  lines.push(
    _t("status.project") +
      (projectDir
        ? "<code>" + escapeHtml(projectDir) + "</code>"
        : _t("status.project.none")),
  );
  if (ctx && ctx.providerId)
    lines.push(_t("status.provider") + escapeHtml(ctx.providerId));

  let procCount = 0;
  try {
    const { processManager } = require("../src/main/process-manager");
    procCount =
      (processManager.activeProcesses && processManager.activeProcesses.size) ||
      0;
  } catch (_) {}
  lines.push(_t("status.processes", { n: procCount }));

  let todos = 0,
    done = 0;
  try {
    const sid = _activeSenderId();
    if (sid != null) {
      const list = require("../src/main/todo-store").getList(sid) || [];
      todos = list.length;
      done = list.filter((t) => t.status === "completed").length;
    }
  } catch (_) {}
  lines.push(_t("status.todos", { done: done, total: todos }));

  const st = telegramBot.getStatus();
  lines.push(
    _t("status.bot") +
      (cfg.enabled
        ? st.polling
          ? _t("status.bot.on")
          : _t("status.bot.warn")
        : _t("status.bot.off")),
  );
  if (st.lastError)
    lines.push(
      _t("status.lastError") + escapeHtml(String(st.lastError).slice(0, 200)),
    );

  return telegramBot.sendMessage(lines.join("\n"), { parseMode: "HTML" });
}

/** /new — новый чат (очистка контекста текущей сессии). */
async function _cmdNew() {
  const res = await _evalInWindow(
    "(async () => { try { const r = await window.electronAPI.newChat(); return r; } catch (e) { return { success: false, error: e.message }; } })()",
  );
  if (!res.success)
    return telegramBot.sendMessage("⚠️ " + escapeHtml(res.error));
  const inner = res.result || {};
  if (inner.success === false)
    return telegramBot.sendMessage(
      "⚠️ " + escapeHtml(inner.error || _t("common.error")),
    );
  return telegramBot.sendMessage(_t("new.done"));
}

/** /diff [page] — показать текущие изменения (git diff) в проекте (с пагинацией). */
async function _cmdDiff(chatId, page) {
  const projectDir = _projectDir();
  if (!projectDir) return telegramBot.sendMessage(_t("diff.noProject"));

  const gitDiff = require("../src/main/git-diff");
  const status = await gitDiff.getStatus(projectDir);
  if (!status.success)
    return telegramBot.sendMessage(
      _t("diff.gitUnavailable", {
        reason: escapeHtml(status.reason || _t("diff.gitDefault")),
      }),
    );
  const files = status.files || [];
  if (files.length === 0) return telegramBot.sendMessage(_t("diff.none"));

  const pager = { items: files, page: page || 1, pageSize: 10 };
  if (chatId) _pagers.set(chatId + ":diff", pager);
  const size = pager.pageSize;
  const pages = Math.max(1, Math.ceil(files.length / size));
  let cur = Math.min(Math.max(1, pager.page), pages);
  pager.page = cur;
  const slice = files.slice((cur - 1) * size, cur * size);

  const chunks = [];
  let total = 0;
  const MAX_TOTAL = 3000;
  for (const f of slice) {
    if (total >= MAX_TOTAL) break;
    const d = await gitDiff.getFileDiff(projectDir, f.path, f.status);
    if (!d.success || !d.diff) continue;
    const text = d.diff.slice(0, MAX_TOTAL - total);
    chunks.push("===== " + f.path + " =====\n" + text);
    total += text.length;
  }

  const header =
    _t("diff.header", { n: files.length }) + " (" + cur + "/" + pages + ")\n";
  const fileList = slice.map((f) => "• " + escapeHtml(f.path)).join("\n");
  const body = chunks.join("\n\n") || _t("diff.unavailable");
  const msg =
    header +
    "<blockquote>" +
    escapeHtml(fileList) +
    "</blockquote>\n<pre>" +
    escapeHtml(body) +
    "</pre>";
  const keyboard = [];
  const nav = [];
  if (cur > 1)
    nav.push({
      text: _t("page.prev"),
      callback_data: "st_pg_diff_" + (cur - 1),
    });
  if (cur < pages)
    nav.push({
      text: _t("page.next"),
      callback_data: "st_pg_diff_" + (cur + 1),
    });
  if (nav.length) keyboard.push(nav);
  return telegramBot.sendMessage(msg, {
    parseMode: "HTML",
    replyMarkup: { inline_keyboard: keyboard },
  });
}

/** /diagnostics — отчёт диагностики интеграции. */
async function _cmdDiagnostics() {
  const res = await _evalInWindow(
    '(async () => { try { return await window.electronAPI.runDiagnosticsText(); } catch (e) { return "ERROR: " + e.message; } })()',
  );
  if (!res.success)
    return telegramBot.sendMessage("⚠️ " + escapeHtml(res.error));
  const text = String(res.result || _t("common.empty")).slice(0, 3500);
  return telegramBot.sendMessage(
    _t("diag.title") + "\n<pre>" + escapeHtml(text) + "</pre>",
    { parseMode: "HTML" },
  );
}

/** /todos — список задач активного окна (с пагинацией). */
async function _cmdTodos(chatId, page) {
  let todos = [];
  try {
    const senderId = _activeSenderId();
    if (senderId != null) {
      const todoStore = require("../src/main/todo-store");
      todos = todoStore.getList(senderId);
    }
  } catch (err) {
    _log("error", "/todos error:", err.message);
  }
  if (!Array.isArray(todos) || todos.length === 0) {
    return telegramBot.sendMessage(_t("todos.empty"));
  }
  const icon = { pending: "☐", in_progress: "◔", completed: "☑" };
  const pager = { items: todos, page: page || 1, pageSize: 10 };
  _pagers.set(chatId + ":todos", pager);
  const done = todos.filter((t) => t.status === "completed").length;
  const rendered = _renderPager(
    "todos",
    pager,
    (t) => (icon[t.status] || "☐") + " " + escapeHtml(t.content),
    (p, pages) =>
      _t("todos.header", { done: done, total: todos.length }) +
      " (" +
      p +
      "/" +
      pages +
      ")",
    "",
  );
  return telegramBot.sendMessage(rendered.text, {
    parseMode: "HTML",
    replyMarkup: rendered.keyboard,
  });
}

/** Текущий projectDir активного окна. */
function _projectDir() {
  const ctx = _activeContext();
  return (
    (ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir) ||
    null
  );
}

// Пагинация: key = `${chatId}:${type}` → { items, page, pageSize }
const _pagers = new Map();

/** Отрисовать страницу списка с навигацией. */
function _renderPager(type, pager, renderItem, titleFn, hint) {
  const size = pager.pageSize || 10;
  const total = pager.items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  let page = Math.min(Math.max(1, pager.page), pages);
  pager.page = page;
  const slice = pager.items.slice((page - 1) * size, page * size);
  const lines = [titleFn(page, pages)];
  if (hint) lines.push(hint);
  lines.push("");
  for (const it of slice) lines.push(renderItem(it));
  const keyboard = [];
  const nav = [];
  if (page > 1)
    nav.push({
      text: _t("page.prev"),
      callback_data: "st_pg_" + type + "_" + (page - 1),
    });
  if (page < pages)
    nav.push({
      text: _t("page.next"),
      callback_data: "st_pg_" + type + "_" + (page + 1),
    });
  if (nav.length) keyboard.push(nav);
  return { text: lines.join("\n"), keyboard: { inline_keyboard: keyboard } };
}

/** /sessions — список сессий проекта. */
async function _cmdSessions(chatId, page) {
  const projectDir = _projectDir();
  if (!projectDir) return telegramBot.sendMessage(_t("diff.noProject"));
  let sessions = [];
  try {
    const ctx = _activeContext();
    const store = ctx && ctx.sessionStore;
    const all = store.readSessionStore();
    sessions = Object.keys(all).filter((id) => all[id] === projectDir);
  } catch (err) {
    return telegramBot.sendMessage("⚠ " + escapeHtml(err.message));
  }
  if (sessions.length === 0)
    return telegramBot.sendMessage(_t("sessions.empty"));
  const pager = { items: sessions, page: page || 1, pageSize: 10 };
  _pagers.set(chatId + ":sessions", pager);
  const rendered = _renderPager(
    "sessions",
    pager,
    (id) => "• <code>" + escapeHtml(id) + "</code>",
    (p, pages) => _t("sessions.title", { page: p, pages: pages }),
    _t("sessions.hint"),
  );
  return telegramBot.sendMessage(rendered.text, {
    parseMode: "HTML",
    replyMarkup: rendered.keyboard,
  });
}

/** /switch <id> — переключиться на сессию. */
async function _cmdSwitch(chatId, id) {
  if (!id)
    return telegramBot.sendMessage(_t("sessions.needId"), {
      parseMode: "HTML",
    });
  const res = await _evalInWindow(
    "(async () => { try { return await window.electronAPI.navigateSession(" +
      JSON.stringify(id) +
      "); } catch (e) { return { success:false, error:e.message }; } })()",
  );
  const inner = (res && res.result) || {};
  if (!res.success || inner.success === false)
    return telegramBot.sendMessage(
      _t("sessions.switchFailed", {
        err: escapeHtml(
          (inner && inner.error) || (res && res.error) || "unknown",
        ),
      }),
    );
  return telegramBot.sendMessage(
    _t("sessions.switched", { id: escapeHtml(id) }),
    { parseMode: "HTML" },
  );
}

/** /log — история коммитов. */
async function _cmdLog(chatId, page) {
  const projectDir = _projectDir();
  if (!projectDir) return telegramBot.sendMessage(_t("diff.noProject"));
  const gitDiff = require("../src/main/git-diff");
  const r = await gitDiff.getLog(projectDir, 100);
  if (!r.success)
    return telegramBot.sendMessage(
      _t("diff.gitUnavailable", {
        reason: escapeHtml(r.reason || _t("diff.gitDefault")),
      }),
    );
  const commits = r.commits || [];
  if (commits.length === 0) return telegramBot.sendMessage(_t("log.empty"));
  const pager = { items: commits, page: page || 1, pageSize: 10 };
  _pagers.set(chatId + ":log", pager);
  const rendered = _renderPager(
    "log",
    pager,
    (c) =>
      _t("log.line", {
        short: escapeHtml(c.short),
        date: escapeHtml(String(c.date || "").slice(0, 16)),
        subject: escapeHtml(c.subject),
      }),
    (p, pages) => _t("log.title", { page: p, pages: pages }),
    _t("log.hint"),
  );
  return telegramBot.sendMessage(rendered.text, {
    parseMode: "HTML",
    replyMarkup: rendered.keyboard,
  });
}

/** /show <hash> — diff коммита. */
async function _cmdShow(chatId, hash) {
  if (!hash)
    return telegramBot.sendMessage(_t("show.needHash"), {
      parseMode: "HTML",
    });
  const projectDir = _projectDir();
  if (!projectDir) return telegramBot.sendMessage(_t("diff.noProject"));
  const gitDiff = require("../src/main/git-diff");
  const r = await gitDiff.getCommitDiff(projectDir, hash);
  if (!r.success)
    return telegramBot.sendMessage(
      _t("diff.gitUnavailable", {
        reason: escapeHtml(r.reason || _t("diff.gitDefault")),
      }),
    );
  const body = String(r.diff || "").slice(0, 3500) || _t("show.unavailable");
  const msg =
    _t("show.title", { hash: escapeHtml(hash) }) +
    "\n<pre>" +
    escapeHtml(body) +
    "</pre>";
  return telegramBot.sendMessage(msg, { parseMode: "HTML" });
}

/** /files <hash> — файлы коммита. */
async function _cmdFiles(chatId, hash) {
  if (!hash)
    return telegramBot.sendMessage(_t("files.needHash"), {
      parseMode: "HTML",
    });
  const projectDir = _projectDir();
  if (!projectDir) return telegramBot.sendMessage(_t("diff.noProject"));
  const gitDiff = require("../src/main/git-diff");
  const r = await gitDiff.getCommitFiles(projectDir, hash);
  if (!r.success)
    return telegramBot.sendMessage(
      _t("diff.gitUnavailable", {
        reason: escapeHtml(r.reason || _t("diff.gitDefault")),
      }),
    );
  const files = r.files || [];
  if (files.length === 0) return telegramBot.sendMessage(_t("files.empty"));
  const icon = {
    added: _t("files.status.added"),
    modified: _t("files.status.modified"),
    deleted: _t("files.status.deleted"),
    renamed: _t("files.status.renamed"),
    changed: _t("files.status.changed"),
  };
  const lines = files.map(
    (f) => (icon[f.status] || "•") + " " + escapeHtml(f.path),
  );
  const msg =
    _t("files.title", { hash: escapeHtml(hash) }) + "\n" + lines.join("\n");
  return telegramBot.sendMessage(msg, { parseMode: "HTML" });
}

async function _cmdHelp() {
  const text = [
    _t("help.title"),
    "",
    _t("help.commands"),
    _t("help.cmd.settings"),
    _t("help.cmd.status"),
    _t("help.cmd.stop"),
    _t("help.cmd.new"),
    _t("help.cmd.diff"),
    _t("help.cmd.diagnostics"),
    _t("help.cmd.sessions"),
    _t("help.cmd.switch"),
    _t("help.cmd.log"),
    _t("help.cmd.show"),
    _t("help.cmd.files"),
    _t("help.cmd.todos"),
    _t("help.cmd.cancel"),
    _t("help.cmd.help"),
    "",
    _t("help.features"),
    _t("help.feat.notify"),
    _t("help.feat.feed"),
    _t("help.feat.approval"),
    _t("help.feat.questions"),
    "",
    _t("help.sync"),
  ].join("\n");
  return telegramBot.sendMessage(text, { parseMode: "HTML" });
}

/** Показать выбор языка бота (/start при первом запуске). */
async function _cmdChooseLang() {
  const text = _t("lang.choose");
  return telegramBot.sendMessage(text, {
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [
          { text: i18n.t("ru", "lang.ru"), callback_data: "st_lang_ru" },
          { text: i18n.t("ru", "lang.en"), callback_data: "st_lang_en" },
        ],
      ],
    },
  });
}

async function _cmdSettings(chatId) {
  _settingsState.set(chatId, { page: "root" });
  return _showSettingsMenu(chatId, "root");
}

async function _handleSettingsInput(chatId, text) {
  const waiting = _settingsWaiting.get(chatId);
  if (!waiting) return false;
  const { key } = waiting;
  const found = _findSetting(key);
  if (!found) {
    _settingsWaiting.delete(chatId);
    return false;
  }
  _settingsWaiting.delete(chatId);
  const item = found.item;
  let value = text;
  if (item.type === "multiline") {
    value = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (item.type === "color") {
    value = text.trim();
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
      await telegramBot.sendMessage(_t("common.invalidColor"), {
        parseMode: "HTML",
      });
      return true;
    }
  } else if (item.type === "text") {
    value = text.trim();
  }
  const ok = _setVal(key, value);
  if (
    ok &&
    (key === "telegramBotToken" ||
      key === "telegramChatId" ||
      key === "telegramEnabled" ||
      key === "telegramAllowedUserId")
  ) {
    try {
      await applySettings();
    } catch (_) {}
  }
  if (ok) _notifySettingsChanged({ [key]: value });
  await telegramBot.sendMessage(
    ok
      ? _t("common.saved", { label: _esc(_label(item)) })
      : _t("common.saveFailed"),
    { parseMode: "HTML" },
  );
  const state = _settingsState.get(chatId);
  if (state && state.msgId)
    await _showSettingsMenu(chatId, state.page || "root", state.msgId);
  return true;
}

/** Папка для временных вложений из Telegram (userData/tgtemp). */
function _tgTempDir() {
  try {
    const { app } = require("electron");
    return require("path").join(app.getPath("userData"), "tgtemp");
  } catch (_) {
    return require("path").join(__dirname, "tgtemp");
  }
}

/**
 * Отправить сообщение из поля ввода активного окна.
 * Приоритет: клик по кнопке отправки → нативный Enter (как chat-send-enter).
 */
async function _sendInWindow(win) {
  try {
    const wc = win.webContents;
    const clickScript = `(function(){
      const sels = ['button[type="submit"]','button[aria-label*="send"]','button[aria-label*="发送"]','button[data-testid="send-button"]','button[data-testid="send"]','.send-btn','.submit-btn'];
      for (const s of sels) {
        try { const b = document.querySelector(s); if (b && !b.disabled && b.offsetParent !== null) { b.click(); return true; } } catch (_) {}
      }
      return false;
    })()`;
    // 1) Пытаемся кликнуть кнопку отправки (до ~3 c, она может стать
    //    активной не сразу после вставки вложения).
    for (let i = 0; i < 10; i++) {
      let clicked = false;
      try {
        clicked = await wc.executeJavaScript(clickScript, true);
      } catch (_) {}
      if (clicked) return { success: true, via: "button" };
      await new Promise((r) => setTimeout(r, 300));
    }
    // 2) Нативный Enter (keyCode Enter — как в chat-send-enter).
    wc.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    wc.sendInputEvent({ type: "char", keyCode: "Enter", key: "\r" });
    wc.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    return { success: true, via: "enter" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Вставить изображение в поле чата (clipboard + Ctrl+V) — надёжный путь как у read_photo.
 */
async function _insertImageToWindow(absPath, caption, send) {
  try {
    const { clipboard, nativeImage } = require("electron");
    const win = windowState.getMainWindow();
    if (!win || win.isDestroyed())
      return { success: false, error: _t("common.noWindow") };
    const img = nativeImage.createFromPath(absPath);
    if (img.isEmpty()) return { success: false, error: "empty image" };
    clipboard.writeImage(img);
    const safe = JSON.stringify(String(caption || ""));
    const script = `(function(){
      const ta = document.querySelector('textarea[placeholder], textarea[name="search"], textarea.ds-scroll-area');
      if (!ta) return { ok: false, error: 'textarea not found' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${safe});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      return { ok: true };
    })()`;
    await win.webContents.executeJavaScript(script, true);
    await new Promise((r) => setTimeout(r, 150));
    win.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: "V",
      modifiers: ["control"],
    });
    win.webContents.sendInputEvent({
      type: "keyUp",
      keyCode: "V",
      modifiers: ["control"],
    });
    await new Promise((r) => setTimeout(r, 500));
    if (send) {
      await new Promise((r) => setTimeout(r, 300));
      await _sendInWindow(win);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Прикрепить произвольный файл к чату через скрытый <input type=file>.
 */
async function _attachFileToWindow(absPath, caption, send) {
  try {
    const fs = require("fs");
    const path = require("path");
    const {
      guessMimeType,
      buildInjectCode,
      UPLOAD_TIMEOUT_MS,
      MAX_FILE_SIZE,
    } = require("../tools/AttachFileTool");
    const win = windowState.getMainWindow();
    if (!win || win.isDestroyed())
      return { success: false, error: _t("common.noWindow") };
    const stat = fs.statSync(absPath);
    if (stat.size > MAX_FILE_SIZE) return { success: false, error: "too big" };
    const buf = fs.readFileSync(absPath);
    const fileName = path.basename(absPath);
    const mimeType = guessMimeType(fileName);
    const code = buildInjectCode(
      buf.toString("base64"),
      fileName,
      mimeType,
      UPLOAD_TIMEOUT_MS,
    );
    const result = await win.webContents.executeJavaScript(code, true);
    if (!result || result.success !== true)
      return {
        success: false,
        error: (result && result.error) || "attach failed",
      };
    if (caption || send) {
      const safe = JSON.stringify(String(caption || ""));
      const script = `(function(){
        const ta = document.querySelector('textarea[placeholder], textarea[name="search"], textarea.ds-scroll-area');
        if (!ta) return { ok: false };
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, ${safe});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
        return { ok: true };
      })()`;
      await win.webContents.executeJavaScript(script, true);
      await new Promise((r) => setTimeout(r, 300));
      if (send) await _sendInWindow(win);
    }
    return { success: true, fileName: result.fileName || fileName };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** Обработать вложение из Telegram: скачать → /tgtemp → прикрепить → удалить. */
async function _handleAttachment(chatId, msg) {
  const { telegramBot } = require("./telegram");
  const fs = require("fs");
  const path = require("path");
  const caption = String((msg && msg.caption) || "").trim();
  let fileId = null;
  let name = "";
  let isImage = false;
  if (msg.photo && msg.photo.length) {
    const p = msg.photo[msg.photo.length - 1];
    fileId = p.file_id;
    name = "photo_" + Date.now() + ".jpg";
    isImage = true;
  } else if (msg.document) {
    fileId = msg.document.file_id;
    name = msg.document.file_name || "document_" + Date.now();
    const mime = String(msg.document.mime_type || "");
    isImage = mime.startsWith("image/");
  }
  if (!fileId) {
    await telegramBot.sendMessage(_t("attach.unsupported"));
    return;
  }
  await telegramBot.sendMessage(_t("attach.downloading"));
  const dest = path.join(_tgTempDir(), name);
  const dl = await telegramBot.downloadFile(fileId, dest);
  if (!dl.success) {
    await telegramBot.sendMessage(
      _t("attach.failed", { err: escapeHtml(dl.error) }),
    );
    return;
  }
  await telegramBot.sendMessage(
    _t("attach.saved", { name: escapeHtml(name) }),
    { parseMode: "HTML" },
  );
  const at = isImage
    ? await _insertImageToWindow(dest, caption, true)
    : await _attachFileToWindow(dest, caption, true);
  if (at.success) {
    await telegramBot.sendMessage(
      _t("attach.done", { name: escapeHtml(name) }),
      { parseMode: "HTML" },
    );
  } else {
    await telegramBot.sendMessage(
      _t("attach.failed", { err: escapeHtml(at.error || "unknown") }),
      { parseMode: "HTML" },
    );
  }
  try {
    fs.unlinkSync(dest);
  } catch (_) {}
}

/** Входящее из TG → в чат DeepSeek (или команда). */
async function _handleIncoming(chatId, text, msg) {
  const cfg = _read();
  const raw = String(text || "");
  const trimmed = raw.trim();
  // Команда = первое слово; убираем суффикс @BotName (Telegram добавляет его
  // в группах) и приводим к нижнему регистру.
  const cmd = (trimmed.split(/\s+/)[0] || "")
    .toLowerCase()
    .replace(/@[a-z0-9_]+$/, "");
  // Аргументы команды (всё после первого слова).
  const cmdArgs = trimmed.split(/\s+/).slice(1).join(" ").trim();

  // ---- Вложения (фото/документы) ----
  // Подпись (caption) обрабатывается внутри _handleAttachment, поэтому
  // после вложения дальше не идём (иначе caption уйдёт вторым сообщением).
  if (msg && (msg.photo || msg.document)) {
    await _handleAttachment(chatId, msg);
    return;
  }

  // ---- Служебные команды ----
  if (cmd === "/start") {
    // При первом запуске предлагаем выбрать язык бота.
    if (!_langChosen()) {
      await _cmdChooseLang();
      return;
    }
    await _cmdHelp();
    return;
  }
  if (cmd === "/help") {
    await _cmdHelp();
    return;
  }
  if (cmd === "/settings" || cmd === "/setting" || cmd === "/config") {
    await _cmdSettings(chatId);
    return;
  }
  if (cmd === "/stop" || cmd === "/kill") {
    await _cmdStop();
    return;
  }
  if (cmd === "/status" || cmd === "/stat") {
    await _cmdStatus();
    return;
  }
  if (cmd === "/new") {
    await _cmdNew();
    return;
  }
  if (cmd === "/diff") {
    await _cmdDiff(chatId, 1);
    return;
  }
  if (cmd === "/diagnostics" || cmd === "/diag") {
    await _cmdDiagnostics();
    return;
  }
  if (cmd === "/sessions") {
    await _cmdSessions(chatId, 1);
    return;
  }
  if (cmd === "/switch") {
    await _cmdSwitch(chatId, cmdArgs);
    return;
  }
  if (cmd === "/log") {
    await _cmdLog(chatId, 1);
    return;
  }
  if (cmd === "/show") {
    await _cmdShow(chatId, cmdArgs);
    return;
  }
  if (cmd === "/files") {
    await _cmdFiles(chatId, cmdArgs);
    return;
  }
  if (cmd === "/cancel") {
    const hadSettings = _settingsWaiting.delete(chatId);
    // Отменяем все ожидающие approval (AI больше не ждёт подтверждения).
    let cancelledApprovals = 0;
    for (const id of Array.from(_pendingApprovals.keys())) {
      const r = cancelApproval(id);
      if (r && r.success && !r.skipped) cancelledApprovals++;
    }
    if (hadSettings) await telegramBot.sendMessage(_t("input.cancelled"));
    else if (cancelledApprovals > 0)
      await telegramBot.sendMessage(
        _t("input.approvalsCancelled", { n: cancelledApprovals }),
      );
    else await telegramBot.sendMessage(_t("input.nothingToCancel"));
    return;
  }
  // Команда /todos — показать список задач активного окна.
  if (cmd === "/todos" || cmd === "/todo") {
    await _cmdTodos(chatId, 1);
    return;
  }

  // ---- Ожидание ввода значения настройки ----
  if (_settingsWaiting.has(chatId)) {
    const handled = await _handleSettingsInput(chatId, raw);
    if (handled) return;
  }

  // ---- Обычное сообщение ----
  if (!cfg.chatFeed) {
    _log("info", "chatFeed выключен — игнор входящего:", text);
    return;
  }
  _log("info", "incoming → chat:", text);
  const res = await _sendToChat(text);
  if (!res.success) {
    await telegramBot.sendMessage("⚠ " + (res.error || "unknown"));
  }
}

/** Уведомить, что все задачи выполнены (со списком ниже). */
async function notifyAllDone(todos) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.notifyTools)
    return { success: false, skipped: true };
  const items = Array.isArray(todos) ? todos : [];
  if (items.length === 0) return { success: false, skipped: true };
  const lines = items.map((t) => "☑ " + escapeHtml(t.content)).join("\n");
  const msg =
    _t("tool.allDone", { n: items.length }) +
    "\n<blockquote>" +
    lines +
    "</blockquote>";
  return telegramBot.sendMessage(msg, { parseMode: "HTML" });
}

/**
 * Человекочитаемое представление аргументов вызова инструмента.
 * Для edit показываем НОВЫЙ код (new_string) до 2000 символов.
 */
function formatToolArgs(toolName, args) {
  if (!args || typeof args !== "object") return "";
  const a = args;

  switch (toolName) {
    case "edit": {
      const file = a.file_path || a.path || "";
      const neu = a.new_string != null ? String(a.new_string) : "";
      const old = a.old_string != null ? String(a.old_string) : "";
      let s = "";
      if (file) s += "📄 " + file + "\n";
      if (old)
        s +=
          _t("tool.old") +
          "\n" +
          old.slice(0, 500) +
          (old.length > 500 ? "\n" + _t("tool.truncated") : "") +
          "\n";
      if (neu)
        s +=
          _t("tool.new") +
          "\n" +
          neu.slice(0, 2000) +
          (neu.length > 2000
            ? "\n" + _t("tool.truncatedTotal", { n: neu.length })
            : "");
      return s;
    }
    case "read":
    case "readLines":
    case "write":
      return a.file_path || a.path ? "📄 " + (a.file_path || a.path) : "";
    case "grep":
      return (
        "🔎 " +
        (a.pattern || "") +
        (a.path ? _t("tool.in") + a.path : "") +
        (a.include ? " (" + a.include + ")" : "")
      );
    case "glob":
      return "🔎 " + (a.pattern || "") + (a.path ? _t("tool.in") + a.path : "");
    case "bash":
    case "pwsh":
      return "💻 " + (a.command || "");
    case "todoWrite":
      return (
        "☑ " + (Array.isArray(a.todos) ? a.todos.length + _t("tool.items") : "")
      );
    default: {
      // Общий случай — компактный JSON, кроме длинных полей.
      try {
        const shallow = {};
        for (const k of Object.keys(a)) {
          const v = a[k];
          if (typeof v === "string" && v.length > 200)
            shallow[k] = v.slice(0, 200) + "…";
          else shallow[k] = v;
        }
        const s = JSON.stringify(shallow);
        return s && s !== "{}" ? "📥 " + s : "";
      } catch (_) {
        return "";
      }
    }
  }
}

/** Экранирование для HTML parse_mode. */
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ==================== Компактные уведомления (стиль «Tech») ====================
//
// Формат одного действия:
//   🔧 Editing D:/code/ICE/crulh/cuckoo-code-master/...  (×3)
//   💻 terminal
//   cd "D:/code/ICE/crulh/cuckoo-code-mas...
//
// Несколько однотипных действий подряд схлопываются в (×N).
// Стиль задан пользователем как эталон — не менять без его просьбы.

// Время (мс), в течение которого подряд идущие уведомления того же типа
// можно склеить в одно сообщение с пометкой (×N).
const TECH_BATCH_MS = 1200;
// Максимальная длина строки пути/команды (обрезаем многоточием).
const TECH_LINE_MAX = 48;

let _techBatchTimer = null;
let _techBatch = null; // { emoji, label, detail, count }

/** Обрезать длинную строку до TECH_LINE_MAX с «...» в конце. */
function _techTrunc(s) {
  const str = String(s == null ? "" : s);
  if (str.length <= TECH_LINE_MAX) return str;
  return str.slice(0, TECH_LINE_MAX - 3) + "...";
}

/**
 * Иконка + короткая подпись действия по имени инструмента.
 * @returns {{emoji:string, label:string}}
 */
function _techIcon(toolName) {
  switch (String(toolName || "").toLowerCase()) {
    case "edit":
      return { emoji: "🔧", label: "Editing" };
    case "write":
      return { emoji: "📝", label: "Writing" };
    case "read":
    case "readlines":
    case "read_lines":
    case "readfile":
    case "read_file":
      return { emoji: "📖", label: "Reading" };
    case "bash":
      return { emoji: "💻", label: "terminal" };
    case "pwsh":
      return { emoji: "💻", label: "pwsh" };
    case "grep":
      return { emoji: "🔎", label: "Grep" };
    case "glob":
      return { emoji: "🔎", label: "Glob" };
    case "todoWrite":
    case "todowrite":
      return { emoji: "☑", label: "Todos" };
    case "webFetch":
    case "webfetch":
      return { emoji: "🌐", label: "Fetch" };
    default:
      return { emoji: "🔧", label: String(toolName || "tool") };
  }
}

/**
 * Короткая деталь действия — путь файла или текст команды.
 * Для bash/pwsh берём первую строку команды (обычно это и есть суть).
 */
function _techDetail(toolName, args) {
  if (!args || typeof args !== "object") return "";
  const a = args;
  const name = String(toolName || "").toLowerCase();
  if (name === "bash" || name === "pwsh") {
    const cmd = String(a.command || "");
    return cmd.split("\n")[0];
  }
  // read/readLines/read_lines и прочие «читающие» — путь в file_path/filePath.
  return String(a.file_path || a.filePath || a.path || a.pattern || "");
}

// Максимальная длина результата в уведомлении.
const TECH_RESULT_MAX = 600;

/** Отправить накопленное уведомление (или ничего, если пусто). */
function _techFlush() {
  const b = _techBatch;
  _techBatch = null;
  if (_techBatchTimer) {
    clearTimeout(_techBatchTimer);
    _techBatchTimer = null;
  }
  if (!b) return null;

  const suffix = b.count > 1 ? " (×" + b.count + ")" : "";
  // Заголовок: «🔧 Editing path (×N)» либо «💻 terminal (×N)» без детали.
  const header = b.command
    ? b.emoji + " " + b.label + suffix
    : b.emoji + " " + b.label + " " + _techTrunc(b.detail) + suffix;

  // Тело: 1) команда/путь, 2) результат — каждый блок своей цитатой.
  let msg = header;
  let body = "";
  if (b.command) body = _techTrunc(b.command);
  else if (b.detail && _techTrunc(b.detail) !== b.detail) body = b.detail;
  if (body) msg += "\n<blockquote>" + escapeHtml(body) + "</blockquote>";

  // Результат выполнения — второй цитатой (если есть и не пустой).
  const result = String(b.preview || "").replace(/\n{3,}/g, "\n\n").trim();
  if (result) {
    const shown =
      result.length > TECH_RESULT_MAX
        ? result.slice(0, TECH_RESULT_MAX) + "\n…(обрезано)"
        : result;
    msg += "\n<blockquote>" + escapeHtml(shown) + "</blockquote>";
  }
  return telegramBot.sendMessage(msg, { parseMode: "HTML" });
}

// Служебные tool-вызовы, которые не являются «работой» и не должны попадать
// в компактные уведомления: вопрос к пользователю, выход из режима плана и т.п.
// Они и так приходят отдельными сообщениями («❓ Вопрос от ИИ», approval и пр.).
const TECH_SERVICE_TOOLS = new Set([
  "ask_user_question",
  "askuserquestion",
  "exit_plan_mode",
  "exitplanmode",
]);

/**
 * Поставить уведомление в батч: если пришло такое же действие в течение
 * TECH_BATCH_MS — увеличиваем счётчик (×N), иначе шлём предыдущее и начинаем новое.
 */
function _techQueue(toolName, args, preview) {
  const icon = _techIcon(toolName);
  const detail = _techDetail(toolName, args);
  const name = String(toolName || "").toLowerCase();
  const command = name === "bash" || name === "pwsh"
    ? String((args && args.command) || "")
    : "";
  const result = String(preview || "");

  if (
    _techBatch &&
    _techBatch.emoji === icon.emoji &&
    _techBatch.label === icon.label &&
    _techBatch.detail === detail &&
    _techBatch.command === command
  ) {
    _techBatch.count++;
    // Результат последнего вызова в серии — показываем его.
    if (result) _techBatch.preview = result;
  } else {
    const prev = _techBatch;
    _techBatch = {
      emoji: icon.emoji,
      label: icon.label,
      detail,
      command,
      preview: result,
      count: 1,
    };
    if (prev) _techFlush();
    if (_techBatchTimer) clearTimeout(_techBatchTimer);
    _techBatchTimer = setTimeout(() => _techFlush(), TECH_BATCH_MS);
    return null;
  }
  if (_techBatchTimer) clearTimeout(_techBatchTimer);
  _techBatchTimer = setTimeout(() => _techFlush(), TECH_BATCH_MS);
  return null;
}

/** Уведомление о результате tool (компактный стиль «Tech»). */
async function notifyToolResult(toolName, ok, detail) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.notifyTools)
    return { success: false, skipped: true };
  // Служебные вызовы (вопрос к пользователю и т.п.) в уведомления не шлём —
  // у них есть собственное сообщение.
  const _toolLower = String(toolName || "").toLowerCase();
  if (TECH_SERVICE_TOOLS.has(_toolLower)) {
    return { success: false, skipped: true };
  }
  // Умные уведомления: пропускаем инструменты из списка исключений.
  if (cfg.notifyIgnore.length > 0 && cfg.notifyIgnore.includes(_toolLower)) {
    return { success: false, skipped: true };
  }

  const args = detail && typeof detail === "object" ? detail.args : null;
  const preview = detail && typeof detail === "object" ? detail.preview : detail;

  // Ошибка — шлём сразу, отдельным сообщением, с обрезанным текстом ошибки.
  if (!ok) {
    const icon = _techIcon(toolName);
    let msg = "❌ " + icon.emoji + " " + icon.label + " " + _techTrunc(_techDetail(toolName, args));
    if (preview)
      msg += "\n" + _techTrunc(String(preview).replace(/\n{3,}/g, "\n\n"));
    return telegramBot.sendMessage(escapeHtml(msg), { parseMode: "HTML" });
  }

  // Успех — в батч (одинаковые подряд схлопываются в ×N).
  _techQueue(toolName, args, preview);
  return { success: true, batched: true };
}

/** Применить настройки: пересоздать конфиг бота и (при необходимости) запустить polling. */
/**
 * Разослать всем открытым окнам приложения событие "настройки изменились".
 * Вызывается после каждого изменения settings.json через TG-бота, чтобы UI
 * мгновенно подхватил изменения (перечитал настройки и применил эффекты).
 *
 * @param {object} [patch]  объект с изменёнными ключами { key: value };
 *                          если не задан — окна перечитают всё целиком.
 */
function _notifySettingsChanged(patch) {
  try {
    const wins = windowState.getAllWindows ? windowState.getAllWindows() : [];
    for (const win of wins) {
      try {
        if (!win || win.isDestroyed()) continue;
        if (!win.webContents || win.webContents.isDestroyed()) continue;
        win.webContents.send("cuckoo-settings-changed", patch || null);
      } catch (_) {}
    }
  } catch (_) {}
}

async function applySettings() {
  const cfg = _read();
  telegramBot.configure(cfg.token, cfg.chatId, cfg.allowedUserId);

  if (cfg.enabled && cfg.token) {
    telegramBot.startPolling(_handleIncoming, _handleCallback);
    started = true;
    // Меню команд в Telegram ("/").
    _registerCommands().catch(() => {});
  } else {
    telegramBot.stopPolling();
    started = false;
  }
  return telegramBot.getStatus();
}

function getStatus() {
  return Object.assign({ started }, telegramBot.getStatus());
}

/** Зарегистрировать список команд бота (меню "/" в Telegram) на текущем языке. */
async function _registerCommands() {
  const lang = _lang();
  const t = (k) => i18n.t(lang, k);
  // Описания команд (короткие, без префикса пути).
  const desc = {
    ru: {
      start: "начать / справка",
      help: "справка",
      settings: "настройки",
      status: "статус",
      stop: "остановить задачу",
      new: "новый чат",
      diff: "изменения (git diff)",
      log: "история коммитов",
      show: "diff коммита",
      files: "файлы коммита",
      sessions: "список сессий",
      switch: "переключить сессию",
      diagnostics: "диагностика",
      todos: "список задач",
      cancel: "отменить ввод",
    },
    en: {
      start: "start / help",
      help: "help",
      settings: "settings",
      status: "status",
      stop: "stop task",
      new: "new chat",
      diff: "changes (git diff)",
      log: "commit history",
      show: "commit diff",
      files: "commit files",
      sessions: "sessions list",
      switch: "switch session",
      diagnostics: "diagnostics",
      todos: "todo list",
      cancel: "cancel",
    },
  }[lang];
  const cmds = Object.keys(desc).map((c) => ({
    command: c,
    description: desc[c],
  }));
  return telegramBot.setMyCommands(cmds);
}

// ==================== «ИИ печатает…» ====================
//
// Telegram показывает статус «печатает…» ~5 секунд после sendChatAction('typing').
// Пока идёт стриминг ответа, раз в 4 секунды продлеваем индикатор.
// startTyping() — включить, stopTyping() — выключить (по завершении генерации).

let _typingTimer = null;

function startTyping() {
  const cfg = _read();
  if (!cfg.enabled || !cfg.token || !cfg.chatId)
    return { success: false, skipped: true };
  telegramBot.configure(cfg.token, cfg.chatId, cfg.allowedUserId);
  if (_typingTimer) return { success: true, already: true };
  const tick = () => {
    telegramBot.sendChatAction("typing").catch(() => {});
  };
  tick();
  _typingTimer = setInterval(tick, 4000);
  return { success: true };
}

function stopTyping() {
  // Telegram гасит «печатает…» сам через ~5с после последнего sendChatAction.
  // Достаточно прекратить продление индикатора.
  if (_typingTimer) {
    clearInterval(_typingTimer);
    _typingTimer = null;
  }
  return { success: true };
}

/**
 * Отправить ответ AI в Telegram (для просмотра с телефона).
 * Обрезает слишком длинные ответы.
 */
async function notifyAIResponse(text) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.chatFeed) return { success: false, skipped: true };
  const s = String(text || "").trim();
  if (!s) return { success: false, skipped: true };
  const MAX = 3500;
  const body =
    s.length > MAX
      ? s.slice(0, MAX) + "\n" + _t("ai.truncated", { n: s.length })
      : s;
  return telegramBot.sendMessage("🤖 " + body);
}

/** Пингануть бота (getMe) для проверки токена. */
async function ping() {
  const cfg = _read();
  telegramBot.configure(cfg.token, cfg.chatId, cfg.allowedUserId);
  return telegramBot.getMe();
}

/** Отправить тестовое сообщение. */
async function testSend() {
  const cfg = _read();
  telegramBot.configure(cfg.token, cfg.chatId, cfg.allowedUserId);
  return telegramBot.sendMessage(_t("test.send"));
}

module.exports = {
  applySettings,
  getStatus,
  ping,
  testSend,
  notifyToolResult,
  notifyAIResponse,
  startTyping,
  stopTyping,
  notifyAllDone,
  requestApproval,
  cancelApproval,
  notifyLongProcess,
  askQuestion,
  setOnQuestionAnswered,
  _handleIncoming,
  _handleCallback,
  _sendToChat,
};
