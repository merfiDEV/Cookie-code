/**
 * Простой i18n для UI Cookie Code.
 *
 * Использование:
 *   const { t, getLanguage, setLanguage } = require('../i18n/i18n');
 *   t('overlay.btn.init')  // → «Инициализировать проект» или «Initialize project»
 *
 * Язык хранится в settings.json (ключ language, 'ru' | 'en').
 * При смене языка рекомендуется location.reload() — просто и надёжно.
 */

const DEFAULTS = { ru: "", en: "" };

// ========== Словарь ==========
const KEYS = {
  // ---- Оверлей: заголовки и общие ----
  "overlay.title": { ru: "Cookie Code", en: "Cookie Code" },
  "overlay.btn.minimize": { ru: "Свернуть панель", en: "Collapse panel" },
  "overlay.label.currentDir": {
    ru: "Текущий каталог проекта",
    en: "Current project directory",
  },
  "overlay.btn.changeDir": { ru: "🔄 Изменить", en: "🔄 Change" },
  "overlay.btn.changeDir.title": {
    ru: "Изменить каталог проекта",
    en: "Change project directory",
  },
  "overlay.dir.notSelected": { ru: "Не выбрано", en: "Not selected" },

  // ---- Оверлей: кнопки ----
  "overlay.btn.init": {
    ru: "Инициализировать проект",
    en: "Initialize project",
  },
  "overlay.btn.init.loading": {
    ru: "⏳ Инициализация...",
    en: "⏳ Initializing...",
  },
  "overlay.btn.windowManager": { ru: "Окна", en: "Windows" },
  "overlay.btn.windowManager.title": {
    ru: "Управление окнами",
    en: "Manage windows",
  },
  "overlay.btn.mcp": { ru: "MCP", en: "MCP" },
  "overlay.btn.mcp.title": {
    ru: "Управление MCP-инструментами",
    en: "Manage MCP tools",
  },
  "overlay.btn.tg": { ru: "Telegram", en: "Telegram" },
  "overlay.btn.tg.title": {
    ru: "Настройки Telegram-бота",
    en: "Telegram bot settings",
  },
  "tg.title": { ru: "Telegram-бот", en: "Telegram bot" },
  "tg.label.token": {
    ru: "Токен бота (@BotFather)",
    en: "Bot token (@BotFather)",
  },
  "tg.label.chatId": { ru: "Chat ID", en: "Chat ID" },
  "tg.label.allowedUserId": {
    ru: "Разрешённый User ID (пусто — любой)",
    en: "Allowed User ID (empty — any)",
  },
  "tg.label.notifyIgnore": {
    ru: "Исключить tool из уведомлений (по одному в строке)",
    en: "Exclude tools from notifications (one per line)",
  },
  "tg.label.enabled": { ru: "Включить бота", en: "Enable bot" },
  "tg.label.notifyTools": {
    ru: "Уведомления о tool",
    en: "Tool notifications",
  },
  "tg.label.chatFeed": {
    ru: "Принимать сообщения из TG в чат",
    en: "Accept messages from TG into chat",
  },
  "tg.btn.save": { ru: "Сохранить", en: "Save" },
  "tg.btn.ping": { ru: "Проверить токен", en: "Check token" },
  "tg.btn.test": { ru: "Тестовое сообщение", en: "Test message" },
  "tg.status.off": { ru: "Выключен", en: "Disabled" },
  "tg.status.on": { ru: "Работает", en: "Running" },
  "overlay.btn.genDoc": { ru: "Создать описание", en: "Generate docs" },
  "overlay.btn.genDoc.title": {
    ru: "Попросить AI сгенерировать описание проекта (CUCKOO.md)",
    en: "Ask AI to generate a project description (CUCKOO.md)",
  },
  "overlay.btn.immersive": { ru: "Погружение", en: "Immersive" },
  "overlay.btn.immersive.title": {
    ru: "Переключить в режим погружения",
    en: "Switch to immersive mode",
  },
  "overlay.btn.manualParse": { ru: "Разобрать вручную", en: "Manual parse" },
  "overlay.btn.manualParse.title": {
    ru: "Вручную разобрать вызовы инструментов в текущем ответе",
    en: "Manually parse tool calls in the latest reply",
  },
  "overlay.btn.manualParse.loading": { ru: "Разбор...", en: "Parsing..." },
  // ---- Перенос контекста (Context Port) ----
  "overlay.btn.contextPort": {
    ru: "Перенести контекст",
    en: "Transfer context",
  },
  "overlay.btn.contextPort.title": {
    ru: "Перенести контекст этого чата в новый (с AI-суммаризацией)",
    en: "Transfer this chat's context to a new one (with AI summary)",
  },
  "contextPort.confirm": {
    ru: "Перенести контекст текущего чата в новый?\n\nИстория будет сжата AI в конспект, затем новый чат откроется автоматически.",
    en: "Transfer this chat's context to a new one?\n\nThe history will be summarized by AI, then a new chat opens automatically.",
  },
  "contextPort.confirmOk": { ru: "Перенести", en: "Transfer" },
  "contextPort.cancel": { ru: "Отмена", en: "Cancel" },
  "contextPort.started": {
    ru: "Перенос запущен…",
    en: "Transfer started…",
  },
  "contextPort.empty": {
    ru: "В чате нет сообщений для переноса",
    en: "No messages to transfer",
  },
  "contextPort.error": { ru: "Ошибка переноса", en: "Transfer error" },
  "overlay.toast.executing": {
    ru: "Команда уже выполняется, ручной разбор не нужен",
    en: "A command is already running, no manual parse needed",
  },
  "overlay.toast.manualParseTriggered": {
    ru: "Запущен ручной разбор последнего ответа AI",
    en: "Manual parse of the latest AI reply triggered",
  },
  "overlay.toast.manualParseError": {
    ru: "Ошибка ручного разбора: {msg}",
    en: "Manual parse error: {msg}",
  },
  "overlay.badge.toolDetected": {
    ru: "Cookie Code — обнаружен вызов инструмента",
    en: "Cookie Code — tool call detected",
  },
  "overlay.badge.jsDetected": {
    ru: "Cookie Code — обнаружен JS-скрипт",
    en: "Cookie Code — JS tool script detected",
  },
  "overlay.toast.execStarted": {
    ru: "Начато выполнение команды",
    en: "Command execution started",
  },
  "overlay.preview.toolPrefix": {
    ru: "[Инструмент] {name}",
    en: "[Tool] {name}",
  },
  "overlay.preview.params": {
    ru: "Параметры: {json}",
    en: "Parameters: {json}",
  },
  "overlay.preview.jsPrefix": { ru: "[JS-скрипт]", en: "[JS tool script]" },
  "overlay.status.jsFailed": {
    ru: "❌ Ошибка выполнения JS-скрипта",
    en: "❌ JS script execution failed",
  },
  "overlay.status.sysError": {
    ru: "❌ Системная ошибка",
    en: "❌ System error",
  },
  "overlay.status.jsOk": {
    ru: "✅ JS-скрипт выполнен успешно",
    en: "✅ JS script executed successfully",
  },
  "overlay.status.jsExit": {
    ru: "⚠ JS-скрипт завершён с кодом {code}",
    en: "⚠ JS script finished with code {code}",
  },
  "overlay.status.toolOk": {
    ru: "✅ Инструмент {name} выполнен успешно",
    en: "✅ Tool {name} executed successfully",
  },
  "overlay.status.toolFailed": {
    ru: "❌ Инструмент {name} выполнен с ошибкой",
    en: "❌ Tool {name} failed",
  },
  "overlay.output.scriptDone": {
    ru: "(скрипт выполнен, без вывода)",
    en: "(script finished, no output)",
  },
  "overlay.output.unknownError": {
    ru: "Неизвестная ошибка",
    en: "Unknown error",
  },
  "overlay.output.execFailed": {
    ru: "Ошибка выполнения",
    en: "Execution failed",
  },
  "toolResult.success": { ru: "Результат", en: "Result" },
  "toolResult.error": { ru: "Ошибка выполнения", en: "Execution error" },
  "toolResult.denied": { ru: "Отклонено пользователем", en: "Denied by user" },
  "overlay.output.systemException": {
    ru: "Системное исключение: {msg}",
    en: "System exception: {msg}",
  },

  // ---- Оверлей: сессии ----
  "overlay.label.convTokens": {
    ru: "Токены диалога",
    en: "Conversation tokens",
  },
  "overlay.label.sessions": { ru: "Сессии", en: "Sessions" },
  "overlay.btn.refreshSessions": { ru: "🔄 Обновить", en: "🔄 Refresh" },
  "overlay.sessions.empty": { ru: "Нет сессий", en: "No sessions" },

  // ---- Оверлей: задержка отправки ----
  "overlay.label.sendDelay": { ru: "Задержка отправки", en: "Send delay" },
  "overlay.label.delayRange": { ru: "до", en: "to" },
  "overlay.label.delaySeconds": { ru: "сек", en: "sec" },
  "overlay.btn.saveDelay": { ru: "Сохранить задержку", en: "Save delay" },
  "overlay.delay.saved": {
    ru: "Задержка сохранена: {min} - {max} сек",
    en: "Delay saved: {min} - {max} sec",
  },
  "overlay.delay.errMin": {
    ru: "Минимум должен быть неотрицательным числом (сек)",
    en: "Min must be a non-negative number (sec)",
  },
  "overlay.delay.errMax": {
    ru: "Максимум не может быть меньше минимума",
    en: "Max cannot be less than min",
  },
  "overlay.delay.errLimit": {
    ru: "Максимум не может превышать 10 секунд",
    en: "Max cannot exceed 10 seconds",
  },

  // ---- Оверлей: задача/результат/история ----
  "overlay.label.task": { ru: "Обнаружена задача:", en: "Task detected:" },
  "overlay.task.running": { ru: "Выполняется", en: "Running" },
  "overlay.task.kill": { ru: "⏹ Остановить процесс", en: "⏹ Kill process" },
  "overlay.task.kill.title": {
    ru: "Экстренно завершить все активные дочерние процессы",
    en: "Emergency-kill all active child processes",
  },
  "overlay.task.killed": {
    ru: "Процесс остановлен ({count})",
    en: "Process stopped ({count})",
  },
  "overlay.task.stopped": { ru: "Задача остановлена", en: "Task stopped" },
  "overlay.task.killNone": {
    ru: "Нет активных процессов",
    en: "No active processes",
  },
  "overlay.task.killError": {
    ru: "Не удалось остановить процесс",
    en: "Failed to kill process",
  },
  "overlay.cmd.none": { ru: "Нет", en: "None" },
  "overlay.label.result": { ru: "Результат:", en: "Result:" },
  "overlay.label.history": { ru: "История", en: "History" },
  "overlay.btn.clearHistory": { ru: "Очистить историю", en: "Clear history" },
  "overlay.history.empty": { ru: "Пока пусто", en: "No history yet" },

  // ---- Оверлей: window manager ----
  "wm.title": { ru: "Управление окнами", en: "Window manager" },
  "wm.btn.close": { ru: "Закрыть", en: "Close" },
  "wm.btn.newWindow": { ru: "Новое окно", en: "New window" },
  "wm.label.list": { ru: "Окна", en: "Windows" },
  "wm.btn.refresh": { ru: "🔄 Обновить", en: "🔄 Refresh" },
  "wm.empty": { ru: "Нет окон", en: "No windows" },
  "wm.toast.created": {
    ru: "Создано новое окно DeepSeek",
    en: "New DeepSeek window created",
  },

  // ---- Оверлей: MCP ----
  "mcp.title": { ru: "MCP-инструменты", en: "MCP tools" },
  "mcp.label.configured": { ru: "Настроены", en: "Configured" },
  "mcp.empty": { ru: "Нет", en: "None" },
  "mcp.btn.save": { ru: "Сохранить настройки", en: "Save config" },

  // ---- Оверлей: бейдж и первый диалог ----
  "badge.title": { ru: "Cookie Code работает", en: "Cookie Code is running" },
  "firstTime.text": {
    ru: "При первом создании диалога нужно инициализировать проект и выбрать каталог, иначе работа невозможна",
    en: "When starting the first conversation, initialize a project and pick a directory — otherwise the app cannot work",
  },
  "init.success.text": {
    ru: "Проект успешно инициализирован!",
    en: "Project initialized successfully!",
  },
  "init.success.btn": { ru: "Отлично", en: "Great" },

  // ---- Настройки: общее ----
  "settings.title": { ru: "Cookie Code", en: "Cookie Code" },
  "settings.subtitle": {
    ru: "Настройки интерфейса и фонового изображения",
    en: "Interface and background settings",
  },
  "settings.section.customization": {
    ru: "Кастомизация Cookie Code",
    en: "Cookie Code customization",
  },
  "settings.customization.enabled": {
    ru: "Кастомизация включена",
    en: "Customization enabled",
  },
  "settings.customization.disabled": {
    ru: "Кастомизация выключена",
    en: "Customization disabled",
  },
  "settings.customization.enable": {
    ru: "Включить всё",
    en: "Enable everything",
  },
  "settings.customization.disable": {
    ru: "Выключить всё",
    en: "Disable everything",
  },
  "settings.customization.reloading": {
    ru: "Применение...",
    en: "Applying...",
  },
  "settings.section.blur": { ru: "Размытие", en: "Blur" },
  "settings.section.opacity": {
    ru: "Прозрачность панелей",
    en: "Panel opacity",
  },
  "settings.section.effects": { ru: "Эффекты", en: "Effects" },
  "settings.section.inputGlass": {
    ru: "Стеклянное поле ввода",
    en: "Glass input field",
  },
  "settings.inputGlass.hint": {
    ru: "Матовое стекло для поля ввода сообщения DeepSeek",
    en: "Frosted glass for the DeepSeek message input field",
  },
  "settings.inputGlass.blur": {
    ru: "Размытие поля ввода (стекло)",
    en: "Input field blur (glass)",
  },
  "settings.inputGlass.opacity": {
    ru: "Плотность фона поля ввода",
    en: "Input field background density",
  },
  "settings.inputGlass.enabled": {
    ru: "Стекло поля ввода включено",
    en: "Input field glass enabled",
  },
  "settings.section.dangerous": {
    ru: "Опасные команды (regex, по одной на строку)",
    en: "Dangerous commands (regex, one per line)",
  },
  "settings.section.background": { ru: "Фон страницы", en: "Page background" },
  // ---- Чубрики (петы) ----
  "settings.section.pets": { ru: "Чубрики", en: "Pets" },
  "settings.pets.chromaBtn": { ru: "🎨 Фон", en: "🎨 BG" },
  "settings.pets.chromaTitle": {
    ru: "Вырезать цвет фона (chroma-key)",
    en: "Remove background color (chroma-key)",
  },
  "settings.pets.chromaModalTitle": {
    ru: "Вырезать фон GIF",
    en: "Remove GIF background",
  },
  "settings.pets.chromaHint": {
    ru: "Кликните по картинке, чтобы выбрать цвет фона. Все пиксели этого цвета станут прозрачными во всех кадрах.",
    en: "Click the image to pick the background color. All pixels of that color become transparent in every frame.",
  },
  "settings.pets.chromaPicked": {
    ru: "Выбран цвет: {color}",
    en: "Picked color: {color}",
  },
  "settings.pets.chromaTolerance": {
    ru: "Допуск (похожесть оттенков)",
    en: "Tolerance (color similarity)",
  },
  "settings.pets.chromaApply": { ru: "Применить", en: "Apply" },
  "settings.pets.chromaCancel": { ru: "Отмена", en: "Cancel" },
  "settings.pets.chromaNoColor": {
    ru: "Сначала выберите цвет кликом по картинке",
    en: "Pick a color by clicking the image first",
  },
  "settings.pets.chromaDone": {
    ru: "Готово! Фон удалён во всех кадрах.",
    en: "Done! Background removed in all frames.",
  },
  "settings.pets.chromaError": {
    ru: "Ошибка: {msg}",
    en: "Error: {msg}",
  },
  "settings.pets.chromaProcessing": {
    ru: "Обработка…",
    en: "Processing…",
  },
  "settings.pets.chromaPreviewHint": {
    ru: "Превью — 1-й кадр. Цвет применяется ко всем кадрам.",
    en: "Preview is frame 1. Color is applied to every frame.",
  },
  "settings.pets.enabledTitle": { ru: "Пет включён", en: "Pet enabled" },
  "settings.pets.enabledHint": {
    ru: "Показывать чубрика на экране. По умолчанию — да.",
    en: "Show the pet on screen. Enabled by default.",
  },
  "settings.pets.pickTitle": { ru: "Выбрать пета", en: "Choose a pet" },
  "settings.pets.pickHint": {
    ru: "PNG/GIF/WebP/JPG. Большие картинки автоматически сжимаются до 600×600. Кликните на превью, чтобы выбрать.",
    en: "PNG/GIF/WebP/JPG. Large images are auto-resized to 600×600. Click a preview to select.",
  },
  "settings.pets.import": { ru: "Загрузить…", en: "Upload…" },
  "settings.pets.reset": { ru: "Сбросить", en: "Reset" },
  // ---- Таймаут JS-скриптов ----
  "settings.jsTimeout.title": {
    ru: "Таймаут выполнения JS-скриптов",
    en: "JS script execution timeout",
  },
  "settings.jsTimeout.hint": {
    ru: "Максимальное время выполнения одного блока кода от AI. От 10 до 1000 секунд. По умолчанию 60 сек.",
    en: "Maximum execution time for a single AI code block. From 10 to 1000 seconds. Default is 60 sec.",
  },
  "settings.jsTimeout.unit": { ru: "сек", en: "sec" },
  "settings.jsTimeout.save": { ru: "Сохранить", en: "Save" },
  "settings.jsTimeout.saved": {
    ru: "Таймаут сохранён: {sec} сек",
    en: "Timeout saved: {sec} sec",
  },
  "settings.jsTimeout.invalid": {
    ru: "Введите число от 10 до 1000",
    en: "Enter a number between 10 and 1000",
  },
  "settings.pets.resetDone": {
    ru: "Настройки пета сброшены к дефолтам",
    en: "Pet settings reset to defaults",
  },
  "settings.pets.refresh": { ru: "Обновить", en: "Refresh" },
  "settings.pets.openFolder": { ru: "Открыть папку", en: "Open folder" },
  "settings.pets.empty": {
    ru: "В папке пока нет PNG/GIF. Нажмите «Открыть папку» и положите туда спрайт.",
    en: 'No PNG/GIF in the folder yet. Click "Open folder" and drop a sprite there.',
  },
  "settings.pets.debugTitle": {
    ru: "Debug-режим пета",
    en: "Pet debug mode",
  },
  "settings.pets.debugHint": {
    ru: "Разблокирует горячие клавиши: F8 — прицел (посадить пета), F9 — рамка поля, F10 — режим, F11 — сброс размера.",
    en: "Unlocks hotkeys: F8 — aim (place the pet), F9 — field frame, F10 — mode, F11 — reset size.",
  },
  "settings.pets.importError": {
    ru: "Не удалось загрузить пета: {msg}",
    en: "Failed to upload pet: {msg}",
  },
  "settings.pets.importCompressed": {
    ru: "Пет сжат: {w1}×{h1} → {w2}×{h2}",
    en: "Pet compressed: {w1}×{h1} → {w2}×{h2}",
  },
  "settings.bg.openFolder": {
    ru: "Открыть папку фонов",
    en: "Open backgrounds folder",
  },
  "settings.bg.refresh": { ru: "Обновить", en: "Refresh" },
  "settings.bg.hint": {
    ru: "Свои картинки: положите файлы (.webp/.jpg/.png/.gif) в папку и нажмите «Обновить».",
    en: "Custom images: drop files (.webp/.jpg/.png/.gif) into the folder and click Refresh.",
  },
  // ---- Шрифт ----
  "settings.section.font": { ru: "Шрифт", en: "Font" },
  "settings.font.openFolder": {
    ru: "Открыть папку шрифтов",
    en: "Open fonts folder",
  },
  "settings.font.refresh": { ru: "Обновить", en: "Refresh" },
  "settings.font.weight": { ru: "Жирность", en: "Weight" },
  "settings.font.hint": {
    ru: "Свои шрифты: положите файлы (.ttf/.otf/.woff/.woff2) в папку и нажмите «Обновить». Шрифт применяется ко всему интерфейсу и странице.",
    en: "Custom fonts: drop files (.ttf/.otf/.woff/.woff2) into the folder and click Refresh. The font applies to the whole UI and page.",
  },
  "settings.section.language": { ru: "Язык", en: "Language" },
  // ---- Категории / подвкладки настроек ----
  "settings.tab.theme": { ru: "Тема и стекло", en: "Theme & Glass" },
  "settings.tab.overlay": { ru: "Панель Cookie", en: "Cookie Panel" },
  "settings.tab.bg": { ru: "Фон страницы", en: "Page Background" },
  "settings.tab.telegram": { ru: "Telegram-бот", en: "Telegram Bot" },
  "settings.tab.system": {
    ru: "Система и безопасность",
    en: "System & Security",
  },
  "settings.section.maintenance": {
    ru: "Обслуживание и сброс",
    en: "Maintenance & Reset",
  },
  "settings.section.service": { ru: "Сервис", en: "Service" },
  // ---- Статистика ----
  "settings.section.stats": { ru: "Статистика", en: "Statistics" },
  "settings.stats.enabled": {
    ru: "Собирать статистику",
    en: "Collect statistics",
  },
  "settings.stats.enabledHint": {
    ru: "Локальный учёт сессий, сообщений, токенов и активных дней (дашборд на домашней странице).",
    en: "Local tracking of sessions, messages, tokens and active days (dashboard on the home page).",
  },
  "settings.stats.debugTitle": {
    ru: "Debug-режим статистики",
    en: "Statistics debug mode",
  },
  "settings.stats.debugHint": {
    ru: "Горячие клавиши: F6 — рамка дашборда, F7 — обновить данные.",
    en: "Hotkeys: F6 — dashboard frame, F7 — refresh data.",
  },
  "settings.stats.reset": {
    ru: "Сбросить статистику",
    en: "Reset statistics",
  },
  "settings.stats.resetConfirm": {
    ru: "Сбросить всю накопленную статистику? Это необратимо.",
    en: "Reset all collected statistics? This cannot be undone.",
  },
  "settings.stats.resetDone": {
    ru: "Статистика сброшена",
    en: "Statistics reset",
  },
  "settings.stats.hint": {
    ru: "Дашборд виден только на домашней странице и сам скрывается при входе в чат.",
    en: "The dashboard is visible only on the home page and hides itself when you enter a chat.",
  },
  // ---- Настройки: диагностика интеграции ----
  "settings.section.diagnostics": {
    ru: "Диагностика интеграции",
    en: "Integration diagnostics",
  },
  "settings.diagnostics.title": {
    ru: "Проверка селекторов и методов провайдера",
    en: "Check provider selectors and methods",
  },
  "settings.diagnostics.hint": {
    ru: "Если после обновления DeepSeek что-то сломалось — запустите диагностику и скопируйте отчёт в issue.",
    en: "If something breaks after a DeepSeek update — run diagnostics and paste the report into an issue.",
  },
  "settings.diagnostics.run": {
    ru: "Запустить диагностику",
    en: "Run diagnostics",
  },
  "settings.diagnostics.running": { ru: "Проверка...", en: "Checking..." },
  "settings.diagnostics.modalTitle": {
    ru: "Отчёт диагностики",
    en: "Diagnostics report",
  },
  "settings.diagnostics.copy": {
    ru: "📋 Копировать отчёт",
    en: "📋 Copy report",
  },
  "settings.diagnostics.copied": { ru: "✅ Скопировано", en: "✅ Copied" },

  // ---- Настройки: слайдеры ----
  "settings.blur.bg": {
    ru: "Размытие фонового изображения",
    en: "Background image blur",
  },
  "settings.blur.header": {
    ru: "Размытие шапки (стекло)",
    en: "Header blur (glass)",
  },
  "settings.blur.sidebar": {
    ru: "Размытие сайдбара (стекло)",
    en: "Sidebar blur (glass)",
  },
  "settings.blur.toolblock": {
    ru: "Размытие tool-блоков (стекло)",
    en: "Tool block blur (glass)",
  },
  "settings.opacity.header": { ru: "Прозрачность шапки", en: "Header opacity" },
  "settings.opacity.sidebar": {
    ru: "Прозрачность сайдбара",
    en: "Sidebar opacity",
  },
  "settings.opacity.toolblock": {
    ru: "Прозрачность tool-блоков",
    en: "Tool block opacity",
  },

  // ---- Настройки: панель Cookie Code ----
  "settings.section.overlay": {
    ru: "Панель Cookie Code",
    en: "Cookie Code Panel",
  },
  "settings.overlay.opacity": {
    ru: "Прозрачность фона панели",
    en: "Panel background opacity",
  },
  "settings.overlay.blur": {
    ru: "Размытие панели (стекло)",
    en: "Panel blur (glass)",
  },
  "settings.overlay.width": { ru: "Ширина панели", en: "Panel width" },
  "settings.overlay.bgColor": {
    ru: "Цвет фона панели",
    en: "Panel background color",
  },
  "settings.overlay.btnColor": {
    ru: "Основной цвет кнопок",
    en: "Primary button color",
  },
  "settings.overlay.btnRadius": {
    ru: "Скругление кнопок панели",
    en: "Button corner radius",
  },

  // ---- Настройки: эффекты ----
  "settings.effect.rgb": {
    ru: "RGB-переливание ника",
    en: "RGB animated username",
  },

  // ---- Настройки: опасные команды ----
  "settings.dangerous.hint": {
    ru: "Пустой список = все команды разрешены",
    en: "Empty list = all commands allowed",
  },
  "settings.dangerous.save": { ru: "Сохранить", en: "Save" },
  "settings.dangerous.saving": { ru: "Сохранение...", en: "Saving..." },
  "settings.dangerous.saved": { ru: "✅ Сохранено", en: "✅ Saved" },
  "settings.dangerous.error": { ru: "❌ Ошибка", en: "❌ Error" },

  // ---- Экспорт ответа AI ----
  "export.btn.title": { ru: "Экспорт ответа", en: "Export response" },
  "export.menu.pdf": { ru: "📄 Скачать PDF", en: "📄 Download PDF" },
  "export.menu.docx": { ru: "📝 Скачать DOCX", en: "📝 Download DOCX" },
  "export.status.working": { ru: "Сохранение...", en: "Saving..." },
  "export.status.ok": { ru: "✅ Сохранено", en: "✅ Saved" },
  "export.status.err": { ru: "❌ Ошибка", en: "❌ Error" },

  // ---- Настройки: кнопки внизу ----
  "settings.btn.openConfig": {
    ru: "Открыть файл настроек",
    en: "Open configuration file",
  },
  "settings.btn.openConfig.title": {
    ru: "Открыть cuckoo-settings.json в системном редакторе",
    en: "Open cuckoo-settings.json in the system editor",
  },
  "settings.btn.openConfig.opened": {
    ru: "✅ Файл открыт",
    en: "✅ File opened",
  },
  "settings.btn.openConfig.error": {
    ru: "❌ Не удалось открыть",
    en: "❌ Failed to open",
  },
  "settings.btn.clearStorage": {
    ru: "Очистить мета-данные",
    en: "Clear meta data",
  },
  "settings.btn.clearStorage.title": {
    ru: "Очистить сохранённые мета-данные и историю ошибок",
    en: "Clear saved meta data and error history",
  },
  "settings.btn.reset": { ru: "Сбросить настройки", en: "Reset settings" },
  "settings.btn.resetting": { ru: "Сброс...", en: "Resetting..." },
  "settings.btn.clearing": { ru: "Очистка...", en: "Clearing..." },

  // ---- Настройки: язык ----
  "settings.lang.ru": { ru: "Русский", en: "Russian" },
  "settings.lang.en": { ru: "Английский", en: "English" },

  // ---- Slash-команды ----
  "cmd.menu.title": { ru: "Команды", en: "Commands" },
  "cmd.menu.files": { ru: "Файлы проекта", en: "Project files" },
  "cmd.review.description": {
    ru: "Проверить текущие изменения проекта",
    en: "Review current project changes",
  },
  "cmd.summarize.description": {
    ru: "Сделать краткий итог текущей сессии",
    en: "Summarize the current session",
  },
  "plan.toggle.label": { ru: "План", en: "Plan" },
  "plan.dialog.title": { ru: "План на утверждение", en: "Plan for approval" },
  "plan.dialog.deny": { ru: "Отказать в плане", en: "Reject plan" },
  "plan.dialog.approve": { ru: "Согласиться", en: "Approve" },
  "plan.approve.prompt": {
    ru: "Работай в соответствии с планом",
    en: "Work according to the plan",
  },

  // ---- Подтверждение tool-вызовов (approval gate) ----
  "approval.title.tool": {
    ru: "Подтверждение вызова инструмента",
    en: "Tool call approval",
  },
  "approval.title.js": {
    ru: "Подтверждение JS-скрипта",
    en: "JS script approval",
  },
  "approval.subtitle": {
    ru: "Cookie Code запрашивает разрешение перед выполнением",
    en: "Cookie Code asks for permission before executing",
  },
  "approval.label.params": { ru: "Параметры", en: "Parameters" },
  "approval.label.code": { ru: "Код", en: "Code" },
  "approval.name.js": { ru: "[JS-скрипт]", en: "[JS script]" },
  "approval.approve": { ru: "Разрешить (Enter)", en: "Approve (Enter)" },
  "approval.always": {
    ru: "Разрешать «{name}» до перезагрузки",
    en: 'Always allow "{name}" (this session)',
  },
  "approval.deny": { ru: "Отклонить (Esc)", en: "Deny (Esc)" },

  // ---- Настройки: агент и приватность ----
  "settings.section.agent": {
    ru: "Агент и приватность",
    en: "Agent & Privacy",
  },
  "settings.approval.off": { ru: "Выкл", en: "Off" },
  "settings.approval.risky": { ru: "Рискованные", en: "Risky only" },
  "settings.approval.all": { ru: "Все вызовы", en: "All calls" },
  "settings.approval.hint": {
    ru: "Запрашивать подтверждение перед выполнением: рискованные инструменты (bash, запись файлов, SQL) или все вызовы",
    en: "Ask before executing: risky tools (bash, file writes, SQL) or every call",
  },
  "settings.approval.saved": { ru: "✅ Режим сохранён", en: "✅ Mode saved" },
  "settings.hideSystemMessages": {
    ru: "Скрывать служебные сообщения в чате",
    en: "Hide service messages in chat",
  },
  "settings.hideSystemMessages.hint": {
    ru: "Результаты инструментов, JS-сводки и системный промпт по-прежнему уходят в AI, но не отображаются в чате",
    en: "Tool results, JS digests and the system prompt still reach the AI but stay invisible in the chat",
  },
  "settings.fileChip": {
    ru: "Файловые пути как кликабельные чипы",
    en: "File paths as clickable chips",
  },
  "settings.fileChip.hint": {
    ru: "Абсолютные пути (C:\\…, D:\\…) превращаются в чипы. Клик открывает файл в VS Code (или в проводнике)",
    en: "Absolute paths (C:\\…, D:\\…) become chips. Click opens the file in VS Code (or in explorer)",
  },
  "settings.showProducedFiles": {
    ru: "Показывать затронутые файлы под ответом",
    en: "Show affected files under AI reply",
  },
  "settings.showProducedFiles.hint": {
    ru: "Блок «Затронуто # файл» под каждым ответом AI — только успешные write/edit/delete",
    en: "“Affected # file” block under each AI reply — only successful write/edit/delete",
  },
  "settings.showConvTokens": {
    ru: "Показывать токены диалога",
    en: "Show dialogue tokens",
  },
  "settings.showConvTokens.hint": {
    ru: "Блок «Токены диалога» в панели Cookie Code (по умолчанию скрыт)",
    en: "“Dialogue tokens” block in the Cookie Code panel (hidden by default)",
  },
  "settings.formatters": {
    ru: "Авто-форматирование после write/edit",
    en: "Auto-format after write/edit",
  },
  "settings.formatters.hint": {
    ru: "prettier, biome, gofmt, ruff, rustfmt, shfmt, clang-format — по расширению и конфигу проекта",
    en: "prettier, biome, gofmt, ruff, rustfmt, shfmt, clang-format — by file extension and project config",
  },

  // ---- Diff-панель ----
  "diff.btn.title": {
    ru: "Показать diff изменённых файлов",
    en: "Show diff of changed files",
  },
  "diff.title": { ru: "Изменения (git)", en: "Changes (git)" },
  "diff.btn.refresh": { ru: "Обновить", en: "Refresh" },
  "diff.btn.close": { ru: "Закрыть", en: "Close" },
  "diff.tab.changes": { ru: "Изменения", en: "Changes" },
  "diff.tab.history": { ru: "История", en: "History" },
  "diff.loading": { ru: "Загрузка…", en: "Loading…" },
  "diff.commit.back": { ru: "← Назад", en: "← Back" },
  "diff.commit.back.title": { ru: "Назад к истории", en: "Back to history" },
  "diff.commit.full": { ru: "Весь коммит", en: "Full commit" },
  "diff.commit.full.title": {
    ru: "Показать весь коммит",
    en: "Show the full commit",
  },
  "diff.commit.titlePrefix": { ru: "Весь коммит ", en: "Full commit " },
  "diff.empty": { ru: "Пустой diff", en: "Empty diff" },
  "diff.noChanges": { ru: "Нет изменённых файлов", en: "No changed files" },
  "diff.noCommits": { ru: "Нет коммитов", en: "No commits" },
  "diff.noFiles": { ru: "Нет файлов", en: "No files" },
  "diff.gitNotFound": { ru: "git не найден", en: "git not found" },
  "diff.diffFailed": {
    ru: "Не удалось получить diff",
    en: "Failed to fetch diff",
  },
  "diff.error": { ru: "Ошибка", en: "Error" },
  "diff.errorPrefix": { ru: "Ошибка: {msg}", en: "Error: {msg}" },

  // ---- Todo-панель ----
  "todo.btn.hide": { ru: "Скрыть", en: "Hide" },
  "todo.btn.show": { ru: "Показать задачи", en: "Show tasks" },

  // ---- Мета под ответом AI (время / токены / затронутые файлы) ----
  "meta.time.title": { ru: "Время ответа", en: "Response time" },
  "meta.tokens.title": {
    ru: "Оценка токенов в тексте этого ответа",
    en: "Estimated tokens in this response",
  },
  "meta.produced": { ru: "Затронуто", en: "Affected" },
  "meta.produced.title": {
    ru: "Файлы, затронутые за этот ответ",
    en: "Files touched in this response",
  },
};

// ========== Состояние ==========
let currentLang = "ru";

const RU_LIKE = ["ru", "uk", "be", "kk", "ky", "uz", "tg", "hy", "az", "mo"];

/**
 * Привести произвольную локаль ('ru-RU', 'uk', 'en-US', ...) к 'ru' | 'en'.
 * Русскоязычные и близкие локали → 'ru', всё остальное → 'en'.
 */
function normalizeLang(lang) {
  const code = String(lang || "")
    .toLowerCase()
    .split(/[-_]/)[0];
  return RU_LIKE.includes(code) ? "ru" : "en";
}

/**
 * Получить перевод по ключу.
 * @param {string} key
 * @param {object} [params] — {name: value} для подстановки {name} в строку
 */
function t(key, params) {
  const entry = KEYS[key];
  if (!entry) {
    console.warn("[Cookie Code] i18n: missing key:", key);
    return key;
  }
  let str = entry[currentLang] || entry.ru || entry.en || key;
  if (params) {
    for (const k of Object.keys(params)) {
      str = str.replace(new RegExp("\\{" + k + "\\}", "g"), String(params[k]));
    }
  }
  return str;
}

function getLanguage() {
  return currentLang;
}

/**
 * Установить язык в памяти. Сохранение в settings.json — на вызывающей стороне.
 */
function setLanguage(lang) {
  currentLang = normalizeLang(lang);
  try {
    window.__cuckooI18nLang = currentLang;
  } catch (_) {}
}

/**
 * Загрузить язык из settings.json (async).
 */
async function loadLanguage() {
  try {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.getCuckooSettings !== "function"
    ) {
      return currentLang;
    }
    const s = await window.electronAPI.getCuckooSettings();
    currentLang = normalizeLang(s && s.language);
  } catch (_) {
    /* оставляем ru по умолчанию */
  }
  try {
    window.__cuckooI18nLang = currentLang;
  } catch (_) {}
  return currentLang;
}

module.exports = { t, getLanguage, setLanguage, loadLanguage, KEYS };
