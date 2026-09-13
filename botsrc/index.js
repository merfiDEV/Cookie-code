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
const { telegramBot } = require('./telegram');
const settingsStore = require('../src/main/settings-store');
const windowState = require('../src/main/window');

let started = false;

function _read() {
  const s = settingsStore.readSettings();
  return {
    enabled: !!s.telegramEnabled,
    token: s.telegramBotToken || '',
    chatId: s.telegramChatId || '',
    notifyTools: !!s.telegramNotifyTools,
    chatFeed: !!s.telegramChatFeed,
    approvalMode: s.toolApprovalMode || 'off',
  };
}

function _log(level, ...args) {
  const tag = '[Cookie Code][telegram]';
  if (level === 'error') console.error(tag, ...args);
  else if (level === 'warn') console.warn(tag, ...args);
  else console.log(tag, ...args);
}

/**
 * Отправить текст в активное окно DeepSeek как сообщение пользователя.
 * Использует тот же путь, что и оверлей: native Enter.
 * Вставляем текст в textarea и жмём Enter.
 */
async function _sendToChat(text) {
  try {
    const win = windowState.getMainWindow();
    if (!win || win.isDestroyed()) return { success: false, error: 'нет активного окна' };

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
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return', key: 'Enter' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: 'Return', key: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return', key: 'Enter' });
    return { success: true };
  } catch (err) {
    _log('error', 'sendToChat error:', err.message);
    return { success: false, error: err.message };
  }
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
  if (items.length === 0) return '☑ Список задач пуст.';
  const icon = { pending: '☐', in_progress: '◔', completed: '☑' };
  const done = items.filter((t) => t.status === 'completed').length;
  const lines = items.map((t) => (icon[t.status] || '☐') + ' ' + t.content);
  return '☑ Задачи (' + done + '/' + items.length + '):\n' + lines.join('\n');
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
  _onQuestionAnswered = typeof fn === 'function' ? fn : null;
}

/** Экранирование для HTML в тексте вопроса. */
function _qEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  if (!cfg.enabled || !cfg.token || !cfg.chatId) return { success: false, skipped: true };
  const items = Array.isArray(questions) ? questions : [];
  if (items.length === 0) return { success: false, skipped: true };

  const lines = ['❓ <b>Вопрос от ИИ</b>'];
  items.forEach((q, qi) => {
    lines.push('');
    lines.push((qi + 1) + '. ' + _qEsc(q.question));
  });
  lines.push('');
  lines.push('<i>Выберите вариант кнопкой ниже.</i>');
  const text = lines.join('\n');

  const entry = { questions: items, answers: new Array(items.length).fill(null), messageId: null, tokens: [] };
  _pendingQuestions.set(requestId, entry);

  // Клавиатура: по строке на каждый вариант каждого вопроса.
  // callback_data — короткий токен 't<number>', привязанный к (requestId, qi, oi).
  const keyboard = [];
  items.forEach((q, qi) => {
    const opts = Array.isArray(q.options) ? q.options : [];
    entry.tokens[qi] = [];
    opts.forEach((o, oi) => {
      const label = String(o.label || '').slice(0, 60);
      const token = 't' + (++_cbTokenCounter);
      _callbackTokens.set(token, { requestId, qi, oi });
      entry.tokens[qi][oi] = token;
      keyboard.push([{ text: (qi + 1) + ') ' + label, callback_data: token }]);
    });
  });

  const res = await telegramBot.sendMessage(text, {
    parseMode: 'HTML',
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
  const token = String(data || '');
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
    await telegramBot.answerCallbackQuery(cbq.id, { text: 'Вопрос уже закрыт' });
    return;
  }

  const q = entry.questions[qi];
  const opt = (q.options || [])[oi];
  if (!opt) {
    await telegramBot.answerCallbackQuery(cbq.id, { text: 'Вариант не найден' });
    return;
  }

  entry.answers[qi] = { question: q.question, answer: String(opt.label || '') };
  await telegramBot.answerCallbackQuery(cbq.id, { text: 'Принято: ' + String(opt.label || '').slice(0, 40) });

  // Обновляем сообщение: показываем выбранные ответы, убираем использованные кнопки.
  _refreshQuestionMessage(requestId, entry);

  // Если все вопросы отвечены — резолвим и чистим токены.
  if (entry.answers.every((a) => a && a.answer)) {
    _pendingQuestions.delete(requestId);
    for (const row of entry.tokens) {
      for (const t of (row || [])) _callbackTokens.delete(t);
    }
    if (typeof _onQuestionAnswered === 'function') {
      try { _onQuestionAnswered(requestId, entry.answers.slice()); } catch (err) {
        _log('error', 'onQuestionAnswered error:', err.message);
      }
    }
  }
}

/** Отправить запрос подтверждения tool-вызова в Telegram. */
async function requestApproval(requestId, info) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.token || !cfg.chatId || cfg.approvalMode === 'off') {
    return { success: false, skipped: true };
  }
  const id = String(requestId || '');
  if (!id) return { success: false, error: 'requestId не задан' };

  const isJs = info && info.kind === 'js';
  const name = isJs ? 'JS-скрипт' : String((info && info.toolName) || 'инструмент');
  let details = '';
  try {
    details = isJs
      ? String((info && info.code) || '')
      : JSON.stringify((info && info.params) || {}, null, 2);
  } catch (_) { details = ''; }
  const body = escapeHtml(details.slice(0, 3000));
  const token = 'a' + (++_cbTokenCounter);
  const entry = { messageId: null, token, resolve: null };
  const promise = new Promise((resolve) => { entry.resolve = resolve; });
  _pendingApprovals.set(id, entry);
  _approvalCallbackTokens.set(token, { requestId: id, approved: true });

  const msg = '🔐 <b>Подтверждение команды</b>\n<b>' + escapeHtml(name) + '</b>' +
    (body ? '\n<pre>' + body + '</pre>' : '') +
    '\n<i>Разрешить выполнение?</i>';
  const res = await telegramBot.sendMessage(msg, {
    parseMode: 'HTML',
    replyMarkup: { inline_keyboard: [[
      { text: '✅ Разрешить', callback_data: token },
      { text: '❌ Отклонить', callback_data: token + 'd' },
    ]] },
  });
  if (!res.success) {
    _pendingApprovals.delete(id);
    _approvalCallbackTokens.delete(token);
    return res;
  }
  entry.messageId = res.messageId || null;
  _approvalCallbackTokens.set(token + 'd', { requestId: id, approved: false });
  return promise;
}

async function _handleApprovalCallback(ref, cbq) {
  const entry = _pendingApprovals.get(ref.requestId);
  if (!entry) {
    await telegramBot.answerCallbackQuery(cbq.id, { text: 'Запрос уже закрыт' });
    return;
  }
  _pendingApprovals.delete(ref.requestId);
  _approvalCallbackTokens.delete(entry.token);
  _approvalCallbackTokens.delete(entry.token + 'd');
  await telegramBot.answerCallbackQuery(cbq.id, {
    text: ref.approved ? 'Команда разрешена' : 'Команда отклонена',
  });
  if (entry.messageId) {
    const status = ref.approved ? '✅ Разрешено' : '❌ Отклонено';
    await telegramBot.editMessageText(entry.messageId, '🔐 <b>Подтверждение команды</b>\n' + status, {
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: [] },
    });
  }
  if (typeof entry.resolve === 'function') {
    entry.resolve({ success: true, approved: ref.approved });
  }
}

/** Отменить запрос, если подтверждение уже получено в окне приложения. */
function cancelApproval(requestId) {
  const id = String(requestId || '');
  const entry = _pendingApprovals.get(id);
  if (!entry) return { success: true, skipped: true };
  _pendingApprovals.delete(id);
  _approvalCallbackTokens.delete(entry.token);
  _approvalCallbackTokens.delete(entry.token + 'd');
  if (typeof entry.resolve === 'function') entry.resolve({ success: false, skipped: true });
  return { success: true };
}

/** Перерисовать сообщение с вопросами: отметить выбранное, убрать лишние кнопки. */
async function _refreshQuestionMessage(requestId, entry) {
  if (!entry.messageId) return;
  const lines = ['❓ <b>Вопрос от ИИ</b>'];
  entry.questions.forEach((q, qi) => {
    lines.push('');
    const chosen = entry.answers[qi];
    lines.push((qi + 1) + '. ' + _qEsc(q.question));
    if (chosen) lines.push('✅ ' + _qEsc(chosen.answer));
  });

  // Оставляем кнопки только для неотвеченных вопросов.
  const keyboard = [];
  entry.questions.forEach((q, qi) => {
    if (entry.answers[qi]) return;
    const opts = Array.isArray(q.options) ? q.options : [];
    opts.forEach((o, oi) => {
      const label = String(o.label || '').slice(0, 60);
      const token = (entry.tokens[qi] && entry.tokens[qi][oi]) || ('t' + (++_cbTokenCounter));
      if (!_callbackTokens.has(token)) _callbackTokens.set(token, { requestId, qi, oi });
      keyboard.push([{ text: (qi + 1) + ') ' + label, callback_data: token }]);
    });
  });

  await telegramBot.editMessageText(entry.messageId, lines.join('\n'), {
    parseMode: 'HTML',
    replyMarkup: keyboard.length ? { inline_keyboard: keyboard } : { inline_keyboard: [] },
  });
}

/** Входящее из TG → в чат DeepSeek (или команда). */
async function _handleIncoming(chatId, text) {
  const cfg = _read();
  const raw = String(text || '');
  const cmd = raw.trim().toLowerCase();

  // Команда /todos — показать список задач активного окна.
  if (cmd === '/todos' || cmd === '/todo') {
    let todos = [];
    try {
      const senderId = _activeSenderId();
      if (senderId != null) {
        const todoStore = require('../src/main/todo-store');
        todos = todoStore.getList(senderId);
      }
    } catch (err) {
      _log('error', '/todos error:', err.message);
    }
    await telegramBot.sendMessage(formatTodos(todos));
    return;
  }

  if (!cfg.chatFeed) {
    _log('info', 'chatFeed выключен — игнор входящего:', text);
    return;
  }
  _log('info', 'incoming → chat:', text);
  const res = await _sendToChat(text);
  if (!res.success) {
    await telegramBot.sendMessage('⚠ Не удалось отправить в чат: ' + (res.error || 'unknown'));
  }
}

/** Уведомить, что все задачи выполнены (со списком ниже). */
async function notifyAllDone(todos) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.notifyTools) return { success: false, skipped: true };
  const items = Array.isArray(todos) ? todos : [];
  if (items.length === 0) return { success: false, skipped: true };
  const lines = items.map((t) => '☑ ' + escapeHtml(t.content)).join('\n');
  const msg = '🎉 <b>Все задачи выполнены</b> (' + items.length + '/' + items.length + ')\n<blockquote>' + lines + '</blockquote>';
  return telegramBot.sendMessage(msg, { parseMode: 'HTML' });
}

/**
 * Человекочитаемое представление аргументов вызова инструмента.
 * Для edit показываем НОВЫЙ код (new_string) до 2000 символов.
 */
function formatToolArgs(toolName, args) {
  if (!args || typeof args !== 'object') return '';
  const a = args;

  switch (toolName) {
    case 'edit': {
      const file = a.file_path || a.path || '';
      const neu = a.new_string != null ? String(a.new_string) : '';
      const old = a.old_string != null ? String(a.old_string) : '';
      let s = '';
      if (file) s += '📄 ' + file + '\n';
      if (old) s += '➖ было:\n' + old.slice(0, 500) + (old.length > 500 ? '\n…(обрезано)' : '') + '\n';
      if (neu) s += '➕ стало:\n' + neu.slice(0, 2000) + (neu.length > 2000 ? '\n…(обрезано, всего ' + neu.length + ' симв.)' : '');
      return s;
    }
    case 'read':
    case 'readLines':
    case 'write':
      return a.file_path || a.path ? '📄 ' + (a.file_path || a.path) : '';
    case 'grep':
      return '🔎 ' + (a.pattern || '') + (a.path ? ' в ' + a.path : '') + (a.include ? ' (' + a.include + ')' : '');
    case 'glob':
      return '🔎 ' + (a.pattern || '') + (a.path ? ' в ' + a.path : '');
    case 'bash':
    case 'pwsh':
      return '💻 ' + (a.command || '');
    case 'todoWrite':
      return '☑ ' + (Array.isArray(a.todos) ? a.todos.length + ' пункт(ов)' : '');
    default: {
      // Общий случай — компактный JSON, кроме длинных полей.
      try {
        const shallow = {};
        for (const k of Object.keys(a)) {
          const v = a[k];
          if (typeof v === 'string' && v.length > 200) shallow[k] = v.slice(0, 200) + '…';
          else shallow[k] = v;
        }
        const s = JSON.stringify(shallow);
        return s && s !== '{}' ? '📥 ' + s : '';
      } catch (_) {
        return '';
      }
    }
  }
}

/** Экранирование для HTML parse_mode. */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Уведомление о результате tool. */
async function notifyToolResult(toolName, ok, detail) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.notifyTools) return { success: false, skipped: true };
  const emoji = ok ? '✅' : '❌';
  const header = emoji + ' ' + escapeHtml(toolName);

  // detail может быть строкой (ошибка) или объектом { args, preview }.
  if (detail && typeof detail === 'object') {
    const { args, preview } = detail;
    const argsText = formatToolArgs(toolName, args);
    const parts = [];

    if (toolName === 'edit') {
      // Красивый diff-стиль: старый код как -, новый как +.
      const file = (args && (args.file_path || args.path)) || '';
      const oldS = args && args.old_string != null ? String(args.old_string) : '';
      const newS = args && args.new_string != null ? String(args.new_string) : '';
      const lines = [];
      const addLines = (prefix, s) => {
        for (const ln of s.split('\n')) lines.push(prefix + escapeHtml(ln));
      };
      if (oldS) addLines('➖ ', oldS.slice(0, 1000));
      if (newS) addLines('➕ ', newS.slice(0, 2000));
      const body = lines.join('\n') || '(пустое изменение)';
      const title = file ? ' ' + escapeHtml(file) : '';
      const msg = emoji + ' <b>edit</b>' + title + '\n<blockquote expandable>' + body + '</blockquote>';
      return telegramBot.sendMessage(msg, { parseMode: 'HTML' });
    }

    // Остальные инструменты: аргументы + результат в цитате <blockquote>.
    const bodyParts = [];
    if (argsText) bodyParts.push(argsText);
    if (preview) bodyParts.push('📤 ' + String(preview).replace(/\n{3,}/g, '\n\n').slice(0, 600));
    const bodyHtml = escapeHtml(bodyParts.join('\n'));
    const msg = header + (bodyHtml ? '\n<blockquote>' + bodyHtml + '</blockquote>' : '');
    return telegramBot.sendMessage(msg, { parseMode: 'HTML' });
  }

  // detail — строка.
  let msg = header;
  if (detail) msg += '\n<blockquote>' + escapeHtml(String(detail).slice(0, 600)) + '</blockquote>';
  return telegramBot.sendMessage(msg, { parseMode: 'HTML' });
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

/**
 * Отправить ответ AI в Telegram (для просмотра с телефона).
 * Обрезает слишком длинные ответы.
 */
async function notifyAIResponse(text) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.chatFeed) return { success: false, skipped: true };
  const s = String(text || '').trim();
  if (!s) return { success: false, skipped: true };
  const MAX = 3500;
  const body = s.length > MAX ? s.slice(0, MAX) + '\n…(обрезано, всего ' + s.length + ' симв.)' : s;
  return telegramBot.sendMessage('🤖 ' + body);
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
  return telegramBot.sendMessage('👋 Cookie Code: тестовое уведомление. Всё работает.');
}

module.exports = {
  applySettings,
  getStatus,
  ping,
  testSend,
  notifyToolResult,
  notifyAIResponse,
  notifyAllDone,
  requestApproval,
  cancelApproval,
  askQuestion,
  setOnQuestionAnswered,
  _handleIncoming,
  _handleCallback,
  _sendToChat,
};
