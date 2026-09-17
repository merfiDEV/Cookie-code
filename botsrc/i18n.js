/**
 * botsrc/i18n.js
 * Строки Telegram-бота на русском (ru) и английском (en).
 *
 * Язык бота хранится в cuckoo-settings.json (ключ telegramLanguage)
 * и не зависит от языка UI приложения.
 */
const settingsStore = require("../src/main/settings-store");

const STRINGS = {
  ru: {
    // ===== Общие =====
    "common.saved": "✅ Сохранено: <b>{label}</b>",
    "common.saveFailed": "❌ Не удалось сохранить",
    "common.error": "Ошибка",
    "common.on": "✅ ВКЛ",
    "common.off": "⚪ ВЫКЛ",
    "common.empty": "(пусто)",
    "common.back": "⬅️ Назад",
    "common.refresh": "🔄 Обновить",
    "common.cancelHint": "/cancel — отмена.",
    "common.invalidColor":
      "⚠ Некорректный цвет. Ожидается hex вида <code>#8b93ff</code>.",
    "common.noWindow": "нет активного окна",

    // ===== /start — выбор языка =====
    "lang.choose": "🌐 <b>Выберите язык бота / Choose bot language</b>",
    "lang.ru": "🇷🇺 Русский",
    "lang.en": "🇬🇧 English",
    "lang.saved": "✅ Язык сохранён: <b>{lang}</b>",

    // ===== /help =====
    "help.title": "🦆 <b>Cookie Code — помощь</b>",
    "help.commands": "<b>Команды</b>",
    "help.cmd.settings": "/settings    — открыть меню настроек",
    "help.cmd.status": "/status      — статус: окно, проект, процессы",
    "help.cmd.stop": "/stop        — прервать задачу и убить процессы",
    "help.cmd.new": "/new         — новый чат",
    "help.cmd.diff": "/diff        — показать изменения (git diff)",
    "help.cmd.diagnostics": "/diagnostics — диагностика интеграции",
    "help.cmd.sessions": "/sessions    — список сессий проекта",
    "help.cmd.switch": "/switch &lt;id&gt; — переключиться на сессию",
    "help.cmd.log": "/log         — история коммитов (git log)",
    "help.cmd.show": "/show &lt;hash&gt; — diff коммита",
    "help.cmd.files": "/files &lt;hash&gt; — файлы коммита",
    "help.cmd.todos": "/todos       — список задач активного окна",
    "help.cmd.cancel": "/cancel      — отменить ввод / подтверждение",
    "help.cmd.help": "/help        — эта справка",
    "help.features": "<b>Возможности</b>",
    "help.feat.notify": "• Уведомления о вызовах инструментов",
    "help.feat.feed": "• Приём входящих сообщений в чат DeepSeek",
    "help.feat.approval":
      "• Подтверждение команд — кнопки «Разрешить / Отклонить»",
    "help.feat.questions": "• Вопросы от AI с вариантами ответа",
    "help.sync": "Настройки синхронизированы с десктопным приложением.",

    // ===== Меню настроек =====
    "settings.root.title": "⚙️ <b>Настройки Cookie Code</b>",
    "settings.root.text": "Что настраиваем?",
    "settings.page.ui": "🎨 Интерфейс",
    "settings.page.glass": "🪟 Стекло и панель",
    "settings.page.agent": "🤖 Агент и приватность",
    "settings.page.pets": "🐦 Чубрики",
    "settings.page.tg": "📡 Telegram-бот",
    "settings.page.lang": "🌐 Язык",

    "settings.ui.title": "🎨 <b>Интерфейс</b>",
    "settings.ui.text": "Общие визуальные эффекты.",
    "settings.glass.title": "🪟 <b>Стекло и панель</b>",
    "settings.glass.text": "Прозрачность, размытие и цвета панели Cookie Code.",
    "settings.agent.title": "🤖 <b>Агент и приватность</b>",
    "settings.agent.text": "Подтверждения, служебные сообщения, форматтеры.",
    "settings.pets.title": "🐦 <b>Чубрики (петы)</b>",
    "settings.pets.text": "Выбор спрайта и debug-режим. Файлы — в папке pets.",
    "label.petEnabled": "Пет включён",
    "label.petId": "Пет (спрайт)",
    "label.petDebugMode": "Debug-режим пета",
    "label.jsTimeoutSec": "Таймаут JS-скриптов",
    "settings.tg.title": "📡 <b>Telegram-бот</b>",
    "settings.tg.text": "Управление ботом и уведомлениями.",
    "settings.lang.title": "🌐 <b>Язык бота</b>",
    "settings.lang.text": "Язык меню, команд и уведомлений бота.",

    // Лейблы настроек
    "label.customizationEnabled": "Кастомизация вкл",
    "label.rgbUsername": "RGB-переливание ника",
    "label.language": "Язык UI",
    "label.telegramLanguage": "Язык бота",
    "label.backgroundBlur": "Размытие фона",
    "label.headerBlur": "Размытие шапки",
    "label.sidebarBlur": "Размытие сайдбара",
    "label.headerOpacity": "Прозрачность шапки",
    "label.sidebarOpacity": "Прозрачность сайдбара",
    "label.toolBlockOpacity": "Прозрачность tool-блоков",
    "label.toolBlockBlur": "Размытие tool-блоков",
    "label.overlayOpacity": "Прозрачность панели",
    "label.overlayBlur": "Размытие панели",
    "label.overlayWidth": "Ширина панели",
    "label.overlayBtnRadius": "Скругление кнопок",
    "label.overlayBgColor": "Цвет подложки",
    "label.overlayPrimaryColor": "Акцентный цвет",
    "label.toolApprovalMode": "Подтверждение tools",
    "label.hideSystemMessages": "Скрывать служебные сообщения",
    "label.formattersEnabled": "Авто-форматтеры",
    "label.fileChipEnabled": "Пути как чипы",
    "label.showProducedFiles": "Затронутые файлы",
    "label.dangerousPatterns": "Опасные паттерны",
    "label.telegramEnabled": "Бот включён",
    "label.telegramNotifyTools": "Уведомления о tool",
    "label.telegramChatFeed": "Принимать из TG",
    "label.telegramBotToken": "Токен бота",
    "label.telegramChatId": "Chat ID",
    "label.telegramAllowedUserId": "Разрешённый User ID",
    "label.telegramToolNotifyIgnore": "Исключить tool из уведомлений",

    // ===== Ввод значения настройки =====
    "input.prompt": "Отправьте новое значение",
    "input.hintOne":
      "Отправьте новое значение одним сообщением. /cancel — отмена.",
    "input.hintList":
      "Отправьте новый список — по одному паттерну в строке. /cancel — отмена.",
    "input.current": "<i>Текущее:</i>",
    "input.cancelled": "✖️ Ввод отменён.",
    "input.nothingToCancel": "Нечего отменять.",
    "input.approvalsCancelled": "✖️ Отменено подтверждений: {n}",

    // ===== Результаты колбэков =====
    "cb.enabled": "Включено",
    "cb.disabled": "Выключено",
    "cb.saved": "Сохранено",

    // ===== /status =====
    "status.title": "📊 <b>Статус Cookie Code</b>",
    "status.version": "📦 Версия: <b>{v}</b>",
    "status.window": "🪟 Окно: ",
    "status.window.ok": "активно",
    "status.window.none": "❌ нет",
    "status.project": "📁 Проект: ",
    "status.project.none": "не выбран",
    "status.provider": "🌐 Провайдер: ",
    "status.processes": "⚙️ Активных процессов: <b>{n}</b>",
    "status.todos": "☑️ Задачи: {done}/{total}",
    "status.bot": "📡 Бот: ",
    "status.bot.on": "✅ работает",
    "status.bot.warn": "⚠️ включён, но не опрашивает",
    "status.bot.off": "⚪ выключен",
    "status.lastError": "⚠️ Последняя ошибка: ",

    // ===== /stop =====
    "stop.failed": "❌ Не удалось остановить: {err}",
    "stop.done": "🛑 Остановлено. Убито процессов: <b>{n}</b>.",

    // ===== /new =====
    "new.done": "🆕 Новый чат открыт.",

    // ===== /diff =====
    "diff.noProject": "⚠️ Проект не выбран.",
    "diff.gitUnavailable": "⚠️ {reason}",
    "diff.gitDefault": "git недоступен",
    "diff.none": "✅ Изменений нет.",
    "diff.header": "📝 <b>Изменения ({n})</b>",
    "diff.unavailable": "(diff недоступен)",

    // ===== /diagnostics =====
    "diag.title": "🩺 <b>Диагностика</b>",

    // ===== /todos =====
    "todos.empty": "☑ Список задач пуст.",
    "todos.header": "☑ Задачи ({done}/{total}):",

    // ===== /sessions и /switch =====
    "sessions.empty": "📭 Сессий не найдено.",
    "sessions.title": "🗂 <b>Сессии</b> (стр. {page}/{pages})",
    "sessions.hint": "<i>Переключиться: /switch &lt;id&gt;</i>",
    "sessions.switched": "✅ Переключено на сессию: <code>{id}</code>",
    "sessions.switchFailed": "⚠️ Не удалось переключиться: {err}",
    "sessions.needId": "⚠️ Укажите id сессии: /switch &lt;id&gt;",

    // ===== /log, /show, /files =====
    "log.empty": "📭 Коммитов не найдено.",
    "log.title": "📜 <b>История коммитов</b> (стр. {page}/{pages})",
    "log.line": "<code>{short}</code> · {date} · {subject}",
    "log.hint": "<i>Diff: /show &lt;hash&gt; · Файлы: /files &lt;hash&gt;</i>",
    "show.needHash": "⚠️ Укажите хеш коммита: /show &lt;hash&gt;",
    "show.title": "📄 <b>Коммит {hash}</b>",
    "show.unavailable": "(diff недоступен)",
    "files.needHash": "⚠️ Укажите хеш коммита: /files &lt;hash&gt;",
    "files.title": "📁 <b>Файлы коммита {hash}</b>",
    "files.empty": "Файлов нет.",
    "files.status.added": "➕",
    "files.status.modified": "✏️",
    "files.status.deleted": "➖",
    "files.status.renamed": "➡️",
    "files.status.changed": "•",

    // ===== Вложения из Telegram =====
    "attach.saved": "📎 Файл получен: <b>{name}</b>",
    "attach.attaching": "⏳ Прикрепляю к чату…",
    "attach.done": "✅ Прикреплено к чату: <b>{name}</b>",
    "attach.failed": "⚠️ Не удалось прикрепить: {err}",
    "attach.downloading": "⏳ Скачиваю вложение…",
    "attach.tooBig": "⚠️ Файл слишком большой (макс. {max}MB).",
    "attach.unsupported": "⚠️ Пока поддерживаются только фото и документы.",

    // ===== Пагинация =====
    "page.prev": "◀️ Назад",
    "page.next": "Вперёд ▶️",

    // ===== Уведомления о tool =====
    "tool.editTitle": " ",
    "tool.editEmpty": "(пустое изменение)",
    "tool.old": "➖ было:",
    "tool.new": "➕ стало:",
    "tool.truncated": "…(обрезано)",
    "tool.truncatedTotal": "…(обрезано, всего {n} симв.)",
    "tool.result": "📤 ",
    "tool.in": " в ",
    "tool.items": " пункт(ов)",
    "tool.allDone": "🎉 <b>Все задачи выполнены</b> ({n}/{n})",

    // ===== Approval =====
    "approval.title": "🔐 <b>Подтверждение команды</b>",
    "approval.jsScript": "JS-скрипт",
    "approval.tool": "инструмент",
    "approval.ask": "<i>Разрешить выполнение?</i>",
    "approval.allow": "✅ Разрешить",
    "approval.deny": "❌ Отклонить",
    "approval.allowed": "Команда разрешена",
    "approval.denied": "Команда отклонена",
    "approval.allowedShort": "✅ Разрешено",
    "approval.deniedShort": "❌ Отклонено",
    "approval.closed": "Запрос уже закрыт",

    // ===== Вопросы от AI =====
    "question.title": "❓ <b>Вопрос от ИИ</b>",
    "question.hint": "<i>Выберите вариант кнопкой ниже.</i>",
    "question.closed": "Вопрос уже закрыт",
    "question.notFound": "Вариант не найден",
    "question.accepted": "Принято: {answer}",

    // ===== Уведомление об ответе AI =====
    "ai.truncated": "…(обрезано, всего {n} симв.)",

    // ===== Тестовое сообщение =====
    "test.send": "👋 Cookie Code: тестовое уведомление. Всё работает.",
  },

  en: {
    // ===== Common =====
    "common.saved": "✅ Saved: <b>{label}</b>",
    "common.saveFailed": "❌ Failed to save",
    "common.error": "Error",
    "common.on": "✅ ON",
    "common.off": "⚪ OFF",
    "common.empty": "(empty)",
    "common.back": "⬅️ Back",
    "common.refresh": "🔄 Refresh",
    "common.cancelHint": "/cancel — cancel.",
    "common.invalidColor":
      "⚠ Invalid color. Expected hex like <code>#8b93ff</code>.",
    "common.noWindow": "no active window",

    // ===== /start — language picker =====
    "lang.choose": "🌐 <b>Выберите язык бота / Choose bot language</b>",
    "lang.ru": "🇷🇺 Русский",
    "lang.en": "🇬🇧 English",
    "lang.saved": "✅ Language saved: <b>{lang}</b>",

    // ===== /help =====
    "help.title": "🦆 <b>Cookie Code — help</b>",
    "help.commands": "<b>Commands</b>",
    "help.cmd.settings": "/settings    — open settings menu",
    "help.cmd.status": "/status      — status: window, project, processes",
    "help.cmd.stop": "/stop        — abort task and kill processes",
    "help.cmd.new": "/new         — new chat",
    "help.cmd.diff": "/diff        — show changes (git diff)",
    "help.cmd.diagnostics": "/diagnostics — integration diagnostics",
    "help.cmd.sessions": "/sessions    — project sessions list",
    "help.cmd.switch": "/switch &lt;id&gt; — switch to a session",
    "help.cmd.log": "/log         — commit history (git log)",
    "help.cmd.show": "/show &lt;hash&gt; — commit diff",
    "help.cmd.files": "/files &lt;hash&gt; — commit files",
    "help.cmd.todos": "/todos       — tasks of the active window",
    "help.cmd.cancel": "/cancel      — cancel input / approval",
    "help.cmd.help": "/help        — this help",
    "help.features": "<b>Features</b>",
    "help.feat.notify": "• Notifications about tool calls",
    "help.feat.feed": "• Receive incoming messages into DeepSeek chat",
    "help.feat.approval": "• Command approval — “Allow / Deny” buttons",
    "help.feat.questions": "• AI questions with answer options",
    "help.sync": "Settings are synced with the desktop app.",

    // ===== Settings menu =====
    "settings.root.title": "⚙️ <b>Cookie Code settings</b>",
    "settings.root.text": "What to configure?",
    "settings.page.ui": "🎨 Interface",
    "settings.page.glass": "🪟 Glass &amp; panel",
    "settings.page.agent": "🤖 Agent &amp; privacy",
    "settings.page.pets": "🐦 Pets",
    "settings.page.tg": "📡 Telegram bot",
    "settings.page.lang": "🌐 Language",

    "settings.ui.title": "🎨 <b>Interface</b>",
    "settings.ui.text": "General visual effects.",
    "settings.glass.title": "🪟 <b>Glass &amp; panel</b>",
    "settings.glass.text":
      "Transparency, blur and colors of the Cookie Code panel.",
    "settings.agent.title": "🤖 <b>Agent &amp; privacy</b>",
    "settings.agent.text": "Approvals, system messages, formatters.",
    "settings.pets.title": "🐦 <b>Pets</b>",
    "settings.pets.text":
      "Sprite selection and debug mode. Files live in the pets folder.",
    "label.petEnabled": "Pet enabled",
    "label.petId": "Pet (sprite)",
    "label.petDebugMode": "Pet debug mode",
    "label.jsTimeoutSec": "JS script timeout",
    "settings.tg.title": "📡 <b>Telegram bot</b>",
    "settings.tg.text": "Bot control and notifications.",
    "settings.lang.title": "🌐 <b>Bot language</b>",
    "settings.lang.text":
      "Language of the bot menu, commands and notifications.",

    // Setting labels
    "label.customizationEnabled": "Customization",
    "label.rgbUsername": "RGB username",
    "label.language": "UI language",
    "label.telegramLanguage": "Bot language",
    "label.backgroundBlur": "Background blur",
    "label.headerBlur": "Header blur",
    "label.sidebarBlur": "Sidebar blur",
    "label.headerOpacity": "Header opacity",
    "label.sidebarOpacity": "Sidebar opacity",
    "label.toolBlockOpacity": "Tool block opacity",
    "label.toolBlockBlur": "Tool block blur",
    "label.overlayOpacity": "Panel opacity",
    "label.overlayBlur": "Panel blur",
    "label.overlayWidth": "Panel width",
    "label.overlayBtnRadius": "Button radius",
    "label.overlayBgColor": "Background color",
    "label.overlayPrimaryColor": "Accent color",
    "label.toolApprovalMode": "Tool approval",
    "label.hideSystemMessages": "Hide system messages",
    "label.formattersEnabled": "Auto-formatters",
    "label.fileChipEnabled": "Paths as chips",
    "label.showProducedFiles": "Touched files",
    "label.dangerousPatterns": "Dangerous patterns",
    "label.telegramEnabled": "Bot enabled",
    "label.telegramNotifyTools": "Tool notifications",
    "label.telegramChatFeed": "Receive from TG",
    "label.telegramBotToken": "Bot token",
    "label.telegramChatId": "Chat ID",
    "label.telegramAllowedUserId": "Allowed User ID",
    "label.telegramToolNotifyIgnore": "Tools excluded from notifications",

    // ===== Setting input =====
    "input.prompt": "Send a new value",
    "input.hintOne": "Send a new value in one message. /cancel — cancel.",
    "input.hintList":
      "Send a new list — one pattern per line. /cancel — cancel.",
    "input.current": "<i>Current:</i>",
    "input.cancelled": "✖️ Input cancelled.",
    "input.nothingToCancel": "Nothing to cancel.",
    "input.approvalsCancelled": "✖️ Approvals cancelled: {n}",

    // ===== Callback results =====
    "cb.enabled": "Enabled",
    "cb.disabled": "Disabled",
    "cb.saved": "Saved",

    // ===== /status =====
    "status.title": "📊 <b>Cookie Code status</b>",
    "status.version": "📦 Version: <b>{v}</b>",
    "status.window": "🪟 Window: ",
    "status.window.ok": "active",
    "status.window.none": "❌ none",
    "status.project": "📁 Project: ",
    "status.project.none": "not selected",
    "status.provider": "🌐 Provider: ",
    "status.processes": "⚙️ Active processes: <b>{n}</b>",
    "status.todos": "☑️ Tasks: {done}/{total}",
    "status.bot": "📡 Bot: ",
    "status.bot.on": "✅ running",
    "status.bot.warn": "⚠️ enabled but not polling",
    "status.bot.off": "⚪ disabled",
    "status.lastError": "⚠️ Last error: ",

    // ===== /stop =====
    "stop.failed": "❌ Failed to stop: {err}",
    "stop.done": "🛑 Stopped. Processes killed: <b>{n}</b>.",

    // ===== /new =====
    "new.done": "🆕 New chat opened.",

    // ===== /diff =====
    "diff.noProject": "⚠️ Project not selected.",
    "diff.gitUnavailable": "⚠️ {reason}",
    "diff.gitDefault": "git unavailable",
    "diff.none": "✅ No changes.",
    "diff.header": "📝 <b>Changes ({n})</b>",
    "diff.unavailable": "(diff unavailable)",

    // ===== /diagnostics =====
    "diag.title": "🩺 <b>Diagnostics</b>",

    // ===== /todos =====
    "todos.empty": "☑ Task list is empty.",
    "todos.header": "☑ Tasks ({done}/{total}):",

    // ===== /sessions and /switch =====
    "sessions.empty": "📭 No sessions found.",
    "sessions.title": "🗂 <b>Sessions</b> (page {page}/{pages})",
    "sessions.hint": "<i>Switch: /switch &lt;id&gt;</i>",
    "sessions.switched": "✅ Switched to session: <code>{id}</code>",
    "sessions.switchFailed": "⚠️ Failed to switch: {err}",
    "sessions.needId": "⚠️ Provide a session id: /switch &lt;id&gt;",

    // ===== /log, /show, /files =====
    "log.empty": "📭 No commits found.",
    "log.title": "📜 <b>Commit history</b> (page {page}/{pages})",
    "log.line": "<code>{short}</code> · {date} · {subject}",
    "log.hint": "<i>Diff: /show &lt;hash&gt; · Files: /files &lt;hash&gt;</i>",
    "show.needHash": "⚠️ Provide a commit hash: /show &lt;hash&gt;",
    "show.title": "📄 <b>Commit {hash}</b>",
    "show.unavailable": "(diff unavailable)",
    "files.needHash": "⚠️ Provide a commit hash: /files &lt;hash&gt;",
    "files.title": "📁 <b>Files in commit {hash}</b>",
    "files.empty": "No files.",
    "files.status.added": "➕",
    "files.status.modified": "✏️",
    "files.status.deleted": "➖",
    "files.status.renamed": "➡️",
    "files.status.changed": "•",

    // ===== Attachments from Telegram =====
    "attach.saved": "📎 File received: <b>{name}</b>",
    "attach.attaching": "⏳ Attaching to chat…",
    "attach.done": "✅ Attached to chat: <b>{name}</b>",
    "attach.failed": "⚠️ Failed to attach: {err}",
    "attach.downloading": "⏳ Downloading attachment…",
    "attach.tooBig": "⚠️ File too large (max {max}MB).",
    "attach.unsupported": "⚠️ Only photos and documents are supported yet.",

    // ===== Pagination =====
    "page.prev": "◀️ Back",
    "page.next": "Next ▶️",

    // ===== Tool notifications =====
    "tool.editTitle": " ",
    "tool.editEmpty": "(empty change)",
    "tool.old": "➖ before:",
    "tool.new": "➕ after:",
    "tool.truncated": "…(truncated)",
    "tool.truncatedTotal": "…(truncated, {n} chars total)",
    "tool.result": "📤 ",
    "tool.in": " in ",
    "tool.items": " item(s)",
    "tool.allDone": "🎉 <b>All tasks completed</b> ({n}/{n})",

    // ===== Approval =====
    "approval.title": "🔐 <b>Command approval</b>",
    "approval.jsScript": "JS script",
    "approval.tool": "tool",
    "approval.ask": "<i>Allow execution?</i>",
    "approval.allow": "✅ Allow",
    "approval.deny": "❌ Deny",
    "approval.allowed": "Command allowed",
    "approval.denied": "Command denied",
    "approval.allowedShort": "✅ Allowed",
    "approval.deniedShort": "❌ Denied",
    "approval.closed": "Request already closed",

    // ===== AI questions =====
    "question.title": "❓ <b>Question from AI</b>",
    "question.hint": "<i>Pick an option with the button below.</i>",
    "question.closed": "Question already closed",
    "question.notFound": "Option not found",
    "question.accepted": "Accepted: {answer}",

    // ===== AI response notification =====
    "ai.truncated": "…(truncated, {n} chars total)",

    // ===== Test message =====
    "test.send": "👋 Cookie Code: test notification. All good.",
  },
};

/** Нормализовать код языка к 'ru' | 'en'. */
function normalizeLang(lang) {
  return String(lang || "").toLowerCase() === "en" ? "en" : "ru";
}

/** Текущий язык бота из настроек (fallback 'ru'). */
function getBotLang() {
  try {
    const s = settingsStore.readSettings();
    return normalizeLang(s.telegramLanguage);
  } catch (_) {
    return "ru";
  }
}

/**
 * Получить строку по ключу для языка lang.
 * Поддерживает подстановку {name} из vars.
 */
function t(lang, key, vars) {
  const L = normalizeLang(lang);
  const table = STRINGS[L] || STRINGS.ru;
  let s = table[key];
  if (s == null) s = STRINGS.ru[key] != null ? STRINGS.ru[key] : key;
  if (vars && typeof vars === "object") {
    s = String(s).replace(/\{(\w+)\}/g, (m, name) =>
      vars[name] != null ? String(vars[name]) : m,
    );
  }
  return s;
}

module.exports = { STRINGS, t, getBotLang, normalizeLang };
