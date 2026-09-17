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
    chatFeed: !!s.telegramChatFeed,
    approvalMode: s.toolApprovalMode || "off",
  };
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
  if (items.length === 0) return "☑ Список задач пуст.";
  const icon = { pending: "☐", in_progress: "◔", completed: "☑" };
  const done = items.filter((t) => t.status === "completed").length;
  const lines = items.map((t) => (icon[t.status] || "☐") + " " + t.content);
  return "☑ Задачи (" + done + "/" + items.length + "):\n" + lines.join("\n");
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

  const lines = ["❓ <b>Вопрос от ИИ</b>"];
  items.forEach((q, qi) => {
    lines.push("");
    lines.push(qi + 1 + ". " + _qEsc(q.question));
  });
  lines.push("");
  lines.push("<i>Выберите вариант кнопкой ниже.</i>");
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
      text: "Вопрос уже закрыт",
    });
    return;
  }

  const q = entry.questions[qi];
  const opt = (q.options || [])[oi];
  if (!opt) {
    await telegramBot.answerCallbackQuery(cbq.id, {
      text: "Вариант не найден",
    });
    return;
  }

  entry.answers[qi] = { question: q.question, answer: String(opt.label || "") };
  await telegramBot.answerCallbackQuery(cbq.id, {
    text: "Принято: " + String(opt.label || "").slice(0, 40),
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
    ? "JS-скрипт"
    : String((info && info.toolName) || "инструмент");
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
    "🔐 <b>Подтверждение команды</b>\n<b>" +
    escapeHtml(name) +
    "</b>" +
    (body ? "\n<pre>" + body + "</pre>" : "") +
    "\n<i>Разрешить выполнение?</i>";
  const res = await telegramBot.sendMessage(msg, {
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "✅ Разрешить", callback_data: token },
          { text: "❌ Отклонить", callback_data: token + "d" },
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
      text: "Запрос уже закрыт",
    });
    return;
  }
  _pendingApprovals.delete(ref.requestId);
  _approvalCallbackTokens.delete(entry.token);
  _approvalCallbackTokens.delete(entry.token + "d");
  await telegramBot.answerCallbackQuery(cbq.id, {
    text: ref.approved ? "Команда разрешена" : "Команда отклонена",
  });
  if (entry.messageId) {
    const status = ref.approved ? "✅ Разрешено" : "❌ Отклонено";
    await telegramBot.editMessageText(
      entry.messageId,
      "🔐 <b>Подтверждение команды</b>\n" + status,
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

/** Перерисовать сообщение с вопросами: отметить выбранное, убрать лишние кнопки. */
async function _refreshQuestionMessage(requestId, entry) {
  if (!entry.messageId) return;
  const lines = ["❓ <b>Вопрос от ИИ</b>"];
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
    title: "⚙️ <b>Настройки Cookie Code</b>",
    text: "Что настраиваем?",
    items: [
      { goto: "ui", label: "🎨 Интерфейс" },
      { goto: "glass", label: "🪟 Стекло и панель" },
      { goto: "agent", label: "🤖 Агент и приватность" },
      { goto: "tg", label: "📡 Telegram-бот" },
    ],
  },
  ui: {
    title: "🎨 <b>Интерфейс</b>",
    text: "Общие визуальные эффекты.",
    items: [
      { key: "customizationEnabled", label: "Кастомизация вкл", type: "bool" },
      { key: "rgbUsername", label: "RGB-переливание ника", type: "bool" },
      {
        key: "language",
        label: "Язык UI",
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
    title: "🪟 <b>Стекло и панель</b>",
    text: "Прозрачность, размытие и цвета панели Cookie Code.",
    items: [
      {
        key: "backgroundBlur",
        label: "Размытие фона",
        type: "number",
        step: 2,
        min: 0,
        max: 30,
        unit: "px",
      },
      {
        key: "headerBlur",
        label: "Размытие шапки",
        type: "number",
        step: 2,
        min: 0,
        max: 30,
        unit: "px",
      },
      {
        key: "sidebarBlur",
        label: "Размытие сайдбара",
        type: "number",
        step: 2,
        min: 0,
        max: 30,
        unit: "px",
      },
      {
        key: "headerOpacity",
        label: "Прозрачность шапки",
        type: "number",
        step: 5,
        min: 0,
        max: 100,
        unit: "%",
      },
      {
        key: "sidebarOpacity",
        label: "Прозрачность сайдбара",
        type: "number",
        step: 5,
        min: 0,
        max: 100,
        unit: "%",
      },
      {
        key: "toolBlockOpacity",
        label: "Прозрачность tool-блоков",
        type: "number",
        step: 5,
        min: 0,
        max: 100,
        unit: "%",
      },
      {
        key: "toolBlockBlur",
        label: "Размытие tool-блоков",
        type: "number",
        step: 2,
        min: 0,
        max: 30,
        unit: "px",
      },
      {
        key: "overlayOpacity",
        label: "Прозрачность панели",
        type: "number",
        step: 5,
        min: 0,
        max: 100,
        unit: "%",
      },
      {
        key: "overlayBlur",
        label: "Размытие панели",
        type: "number",
        step: 2,
        min: 0,
        max: 30,
        unit: "px",
      },
      {
        key: "overlayWidth",
        label: "Ширина панели",
        type: "number",
        step: 20,
        min: 200,
        max: 600,
        unit: "px",
      },
      {
        key: "overlayBtnRadius",
        label: "Скругление кнопок",
        type: "number",
        step: 2,
        min: 0,
        max: 24,
        unit: "px",
      },
      { key: "overlayBgColor", label: "Цвет подложки", type: "color" },
      { key: "overlayPrimaryColor", label: "Акцентный цвет", type: "color" },
    ],
    back: true,
  },
  agent: {
    title: "🤖 <b>Агент и приватность</b>",
    text: "Подтверждения, служебные сообщения, форматтеры.",
    items: [
      {
        key: "toolApprovalMode",
        label: "Подтверждение tools",
        type: "enum",
        values: [
          ["off", "⚪ Off"],
          ["risky", "🟡 Risky"],
          ["all", "🔴 All"],
        ],
      },
      {
        key: "hideSystemMessages",
        label: "Скрывать служебные сообщения",
        type: "bool",
      },
      { key: "formattersEnabled", label: "Авто-форматтеры", type: "bool" },
      { key: "fileChipEnabled", label: "Пути как чипы", type: "bool" },
      { key: "showProducedFiles", label: "Затронутые файлы", type: "bool" },
      {
        key: "dangerousPatterns",
        label: "Опасные паттерны",
        type: "multiline",
      },
    ],
    back: true,
  },
  tg: {
    title: "📡 <b>Telegram-бот</b>",
    text: "Управление ботом и уведомлениями.",
    items: [
      { key: "telegramEnabled", label: "Бот включён", type: "bool" },
      { key: "telegramNotifyTools", label: "Уведомления о tool", type: "bool" },
      { key: "telegramChatFeed", label: "Принимать из TG", type: "bool" },
      {
        key: "telegramBotToken",
        label: "Токен бота",
        type: "text",
        secret: true,
      },
      { key: "telegramChatId", label: "Chat ID", type: "text" },
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

function _formatValue(item, value) {
  if (item.type === "bool") return value ? "✅ ВКЛ" : "⚪ ВЫКЛ";
  if (item.type === "enum") {
    const found = (item.values || []).find(([v]) => v === value);
    return found ? found[1] : String(value);
  }
  if (item.type === "number") return String(value) + (item.unit || "");
  if (item.type === "color") return String(value || "");
  if (item.type === "text" || item.type === "multiline") {
    if (item.secret)
      return value ? "••••" + String(value).slice(-4) : "(пусто)";
    const s = String(value == null ? "" : value);
    return s.length > 20 ? s.slice(0, 20) + "…" : s || "(пусто)";
  }
  return String(value);
}

function _renderPage(pageName) {
  const page = SETTINGS_PAGES[pageName];
  if (!page) return _renderPage("root");
  const lines = [page.title, "", page.text];
  const keyboard = [];
  if (page.items) {
    for (const item of page.items) {
      const v = _getVal(item.key);
      if (item.type === "bool") {
        const icon = v ? "✅" : "⚪";
        keyboard.push([
          { text: icon + " " + item.label, callback_data: "st_t_" + item.key },
        ]);
      } else if (item.type === "enum") {
        const cur = _formatValue(item, v);
        keyboard.push([
          { text: item.label + ": " + cur, callback_data: "st_noop" },
        ]);
        const opts = (item.values || []).map(([val, lbl]) => ({
          text: lbl,
          callback_data: "st_s_" + item.key + "__" + val,
        }));
        if (opts.length) keyboard.push(opts);
      } else if (item.type === "number") {
        const cur = _formatValue(item, v);
        keyboard.push([
          { text: "➖", callback_data: "st_n_" + item.key + "_-" },
          { text: item.label + ": " + cur, callback_data: "st_noop" },
          { text: "➕", callback_data: "st_n_" + item.key + "_+" },
        ]);
      } else if (item.type === "color") {
        keyboard.push([
          { text: "✏️ " + item.label, callback_data: "st_e_" + item.key },
          { text: String(v || ""), callback_data: "st_noop" },
        ]);
      } else if (item.type === "text" || item.type === "multiline") {
        keyboard.push([
          {
            text: "✏️ " + item.label + ": " + _formatValue(item, v),
            callback_data: "st_e_" + item.key,
          },
        ]);
      }
    }
  }
  if (page.back) {
    keyboard.push([{ text: "⬅️ Назад", callback_data: "st_page_root" }]);
  } else {
    keyboard.push([
      { text: "🔧 Агент", callback_data: "st_page_agent" },
      { text: "🎨 UI", callback_data: "st_page_ui" },
    ]);
    keyboard.push([
      { text: "🪟 Стекло", callback_data: "st_page_glass" },
      { text: "📡 Telegram", callback_data: "st_page_tg" },
    ]);
    keyboard.push([{ text: "🔄 Обновить", callback_data: "st_page_root" }]);
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
      text: ok ? (next ? "Включено" : "Выключено") : "Ошибка",
    });
    if (ok) {
      try {
        await applySettings();
      } catch (_) {}
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
      text: ok ? "Сохранено" : "Ошибка",
    });
    if (ok && key === "language") {
      try {
        await applySettings();
      } catch (_) {}
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
      text: ok ? String(val) + (item.unit || "") : "Ошибка",
    });
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
      text: "Отправьте новое значение",
    });
    const cur = _getVal(key);
    const hint =
      found.item.type === "multiline"
        ? "Отправьте новый список — по одному паттерну в строке. /cancel — отмена."
        : "Отправьте новое значение одним сообщением. /cancel — отмена.";
    const curText =
      found.item.type === "multiline"
        ? Array.isArray(cur)
          ? cur.join("\n")
          : String(cur || "")
        : String(cur == null ? "" : cur);
    await telegramBot.sendMessage(
      "✏️ <b>" +
        _esc(found.item.label) +
        "</b>\n" +
        hint +
        "\n\n<i>Текущее:</i>\n<pre>" +
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
      "❌ Не удалось остановить: " + escapeHtml(err.message),
    );
  }
  return telegramBot.sendMessage(
    "🛑 Остановлено. Убито процессов: <b>" + count + "</b>.",
    { parseMode: "HTML" },
  );
}

/** /status — окно, проект, процессы, версия, polling. */
async function _cmdStatus() {
  const cfg = _read();
  const lines = ["📊 <b>Статус Cookie Code</b>", ""];

  let version = "?";
  try {
    version = require("electron").app.getVersion();
  } catch (_) {}
  lines.push("📦 Версия: <b>" + escapeHtml(version) + "</b>");

  const win = windowState.getMainWindow();
  const winOk = !!(win && !win.isDestroyed());
  lines.push("🪟 Окно: " + (winOk ? "активно" : "❌ нет"));

  const ctx = _activeContext();
  const projectDir =
    ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
  lines.push(
    "📁 Проект: " +
      (projectDir
        ? "<code>" + escapeHtml(projectDir) + "</code>"
        : "не выбран"),
  );
  if (ctx && ctx.providerId)
    lines.push("🌐 Провайдер: " + escapeHtml(ctx.providerId));

  let procCount = 0;
  try {
    const { processManager } = require("../src/main/process-manager");
    procCount =
      (processManager.activeProcesses && processManager.activeProcesses.size) ||
      0;
  } catch (_) {}
  lines.push("⚙️ Активных процессов: <b>" + procCount + "</b>");

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
  lines.push("☑️ Задачи: " + done + "/" + todos);

  const st = telegramBot.getStatus();
  lines.push(
    "📡 Бот: " +
      (cfg.enabled
        ? st.polling
          ? "✅ работает"
          : "⚠️ включён, но не опрашивает"
        : "⚪ выключен"),
  );
  if (st.lastError)
    lines.push(
      "⚠️ Последняя ошибка: " + escapeHtml(String(st.lastError).slice(0, 200)),
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
      "⚠️ " + escapeHtml(inner.error || "не удалось"),
    );
  return telegramBot.sendMessage("🆕 Новый чат открыт.");
}

/** /diff — показать текущие изменения (git diff) в проекте. */
async function _cmdDiff() {
  const ctx = _activeContext();
  const projectDir =
    ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
  if (!projectDir) return telegramBot.sendMessage("⚠️ Проект не выбран.");

  const gitDiff = require("../src/main/git-diff");
  const status = await gitDiff.getStatus(projectDir);
  if (!status.success)
    return telegramBot.sendMessage(
      "⚠️ " + escapeHtml(status.reason || "git недоступен"),
    );
  const files = status.files || [];
  if (files.length === 0) return telegramBot.sendMessage("✅ Изменений нет.");

  const chunks = [];
  let total = 0;
  const MAX_TOTAL = 3000;
  for (const f of files) {
    if (total >= MAX_TOTAL) break;
    const d = await gitDiff.getFileDiff(projectDir, f.path, f.status);
    if (!d.success || !d.diff) continue;
    const text = d.diff.slice(0, MAX_TOTAL - total);
    chunks.push("===== " + f.path + " =====\n" + text);
    total += text.length;
  }

  const header = "📝 <b>Изменения (" + files.length + ")</b>\n";
  const fileList = files.map((f) => "• " + escapeHtml(f.path)).join("\n");
  const body = chunks.join("\n\n") || "(diff недоступен)";
  const msg =
    header +
    "<blockquote>" +
    escapeHtml(fileList) +
    "</blockquote>\n<pre>" +
    escapeHtml(body) +
    "</pre>";
  return telegramBot.sendMessage(msg, { parseMode: "HTML" });
}

/** /diagnostics — отчёт диагностики интеграции. */
async function _cmdDiagnostics() {
  const res = await _evalInWindow(
    '(async () => { try { return await window.electronAPI.runDiagnosticsText(); } catch (e) { return "ERROR: " + e.message; } })()',
  );
  if (!res.success)
    return telegramBot.sendMessage("⚠️ " + escapeHtml(res.error));
  const text = String(res.result || "(пусто)").slice(0, 3500);
  return telegramBot.sendMessage(
    "🩺 <b>Диагностика</b>\n<pre>" + escapeHtml(text) + "</pre>",
    { parseMode: "HTML" },
  );
}

async function _cmdHelp() {
  const text = [
    "🦆 <b>Cookie Code — помощь</b>",
    "",
    "<b>Команды</b>",
    "/settings    — открыть меню настроек",
    "/status      — статус: окно, проект, процессы",
    "/stop        — прервать задачу и убить процессы",
    "/new         — новый чат",
    "/diff        — показать изменения (git diff)",
    "/diagnostics — диагностика интеграции",
    "/todos       — список задач активного окна",
    "/cancel      — отменить ввод / подтверждение",
    "/help        — эта справка",
    "",
    "<b>Возможности</b>",
    "• Уведомления о вызовах инструментов",
    "• Приём входящих сообщений в чат DeepSeek",
    "• Подтверждение команд — кнопки «Разрешить / Отклонить»",
    "• Вопросы от AI с вариантами ответа",
    "",
    "Настройки синхронизированы с десктопным приложением.",
  ].join("\n");
  return telegramBot.sendMessage(text, { parseMode: "HTML" });
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
      await telegramBot.sendMessage(
        "⚠ Некорректный цвет. Ожидается hex вида <code>#8b93ff</code>.",
        { parseMode: "HTML" },
      );
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
      key === "telegramEnabled")
  ) {
    try {
      await applySettings();
    } catch (_) {}
  }
  await telegramBot.sendMessage(
    ok
      ? "✅ Сохранено: <b>" + _esc(item.label) + "</b>"
      : "❌ Не удалось сохранить",
    { parseMode: "HTML" },
  );
  const state = _settingsState.get(chatId);
  if (state && state.msgId)
    await _showSettingsMenu(chatId, state.page || "root", state.msgId);
  return true;
}

/** Входящее из TG → в чат DeepSeek (или команда). */
async function _handleIncoming(chatId, text) {
  const cfg = _read();
  const raw = String(text || "");
  const cmd = raw.trim().toLowerCase();

  // ---- Служебные команды ----
  if (cmd === "/help" || cmd === "/start") {
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
    await _cmdDiff();
    return;
  }
  if (cmd === "/diagnostics" || cmd === "/diag") {
    await _cmdDiagnostics();
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
    if (hadSettings) await telegramBot.sendMessage("✖️ Ввод отменён.");
    else if (cancelledApprovals > 0)
      await telegramBot.sendMessage(
        "✖️ Отменено подтверждений: " + cancelledApprovals,
      );
    else await telegramBot.sendMessage("Нечего отменять.");
    return;
  }
  // Команда /todos — показать список задач активного окна.
  if (cmd === "/todos" || cmd === "/todo") {
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
    await telegramBot.sendMessage(formatTodos(todos));
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
    await telegramBot.sendMessage(
      "⚠ Не удалось отправить в чат: " + (res.error || "unknown"),
    );
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
    "🎉 <b>Все задачи выполнены</b> (" +
    items.length +
    "/" +
    items.length +
    ")\n<blockquote>" +
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
          "➖ было:\n" +
          old.slice(0, 500) +
          (old.length > 500 ? "\n…(обрезано)" : "") +
          "\n";
      if (neu)
        s +=
          "➕ стало:\n" +
          neu.slice(0, 2000) +
          (neu.length > 2000
            ? "\n…(обрезано, всего " + neu.length + " симв.)"
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
        (a.path ? " в " + a.path : "") +
        (a.include ? " (" + a.include + ")" : "")
      );
    case "glob":
      return "🔎 " + (a.pattern || "") + (a.path ? " в " + a.path : "");
    case "bash":
    case "pwsh":
      return "💻 " + (a.command || "");
    case "todoWrite":
      return (
        "☑ " + (Array.isArray(a.todos) ? a.todos.length + " пункт(ов)" : "")
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

/** Уведомление о результате tool. */
async function notifyToolResult(toolName, ok, detail) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.notifyTools)
    return { success: false, skipped: true };
  const emoji = ok ? "✅" : "❌";
  const header = emoji + " " + escapeHtml(toolName);

  // detail может быть строкой (ошибка) или объектом { args, preview }.
  if (detail && typeof detail === "object") {
    const { args, preview } = detail;
    const argsText = formatToolArgs(toolName, args);
    const parts = [];

    if (toolName === "edit") {
      // Красивый diff-стиль: старый код как -, новый как +.
      const file = (args && (args.file_path || args.path)) || "";
      const oldS =
        args && args.old_string != null ? String(args.old_string) : "";
      const newS =
        args && args.new_string != null ? String(args.new_string) : "";
      const lines = [];
      const addLines = (prefix, s) => {
        for (const ln of s.split("\n")) lines.push(prefix + escapeHtml(ln));
      };
      if (oldS) addLines("➖ ", oldS.slice(0, 1000));
      if (newS) addLines("➕ ", newS.slice(0, 2000));
      const body = lines.join("\n") || "(пустое изменение)";
      const title = file ? " " + escapeHtml(file) : "";
      const msg =
        emoji +
        " <b>edit</b>" +
        title +
        "\n<blockquote expandable>" +
        body +
        "</blockquote>";
      return telegramBot.sendMessage(msg, { parseMode: "HTML" });
    }

    // Остальные инструменты: аргументы + результат в цитате <blockquote>.
    const bodyParts = [];
    if (argsText) bodyParts.push(argsText);
    if (preview)
      bodyParts.push(
        "📤 " +
          String(preview)
            .replace(/\n{3,}/g, "\n\n")
            .slice(0, 600),
      );
    const bodyHtml = escapeHtml(bodyParts.join("\n"));
    const msg =
      header + (bodyHtml ? "\n<blockquote>" + bodyHtml + "</blockquote>" : "");
    return telegramBot.sendMessage(msg, { parseMode: "HTML" });
  }

  // detail — строка.
  let msg = header;
  if (detail)
    msg +=
      "\n<blockquote>" +
      escapeHtml(String(detail).slice(0, 600)) +
      "</blockquote>";
  return telegramBot.sendMessage(msg, { parseMode: "HTML" });
}

/** Применить настройки: пересоздать конфиг бота и (при необходимости) запустить polling. */
async function applySettings() {
  const cfg = _read();
  telegramBot.configure(cfg.token, cfg.chatId);

  if (cfg.enabled && cfg.token) {
    telegramBot.startPolling(_handleIncoming, _handleCallback);
    started = true;
  } else {
    telegramBot.stopPolling();
    started = false;
  }
  return telegramBot.getStatus();
}

function getStatus() {
  return Object.assign({ started }, telegramBot.getStatus());
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
  telegramBot.configure(cfg.token, cfg.chatId);
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
      ? s.slice(0, MAX) + "\n…(обрезано, всего " + s.length + " симв.)"
      : s;
  return telegramBot.sendMessage("🤖 " + body);
}

/** Пингануть бота (getMe) для проверки токена. */
async function ping() {
  const cfg = _read();
  telegramBot.configure(cfg.token, cfg.chatId);
  return telegramBot.getMe();
}

/** Отправить тестовое сообщение. */
async function testSend() {
  const cfg = _read();
  telegramBot.configure(cfg.token, cfg.chatId);
  return telegramBot.sendMessage(
    "👋 Cookie Code: тестовое уведомление. Всё работает.",
  );
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
  askQuestion,
  setOnQuestionAnswered,
  _handleIncoming,
  _handleCallback,
  _sendToChat,
};
