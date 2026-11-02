/**
 * Персистентные настройки Cookie Code.
 *
 * Хранилище: плоский JSON <userData>/cuckoo-settings.json.
 * Контракт: DEFAULTS — единственный источник истины для схемы; всё, чего нет
 * в файле или в DEFAULTS, считается отсутствующим. Чтение всегда возвращает
 * полный объект (DEFAULTS ⊕ файл), поэтому потребителям не нужны проверки на
 * undefined.
 *
 * Инвариант: ключи языка (language/telegramLanguage) при отсутствии в файле
 * заполняются из локали ОС. Это состояние "пользователь ещё не выбирал" —
 * важно не перезаписывать его дефолтом "ru" при сохранении (см. writeSettings:
 * merge идёт от DEFAULTS, но фактическое значение берётся из прочитанного).
 */
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

// Регэкспы команд, которые approval-gate считает разрушительными по умолчанию.
// ВАЖНО: это эвристика, а не песочница — не полагаться на неё как на границу
// безопасности; пользователь может расширять список через настройки.
const DEFAULT_DANGEROUS_PATTERNS = [
  "^rm\\s+-rf\\s+/",
  "^format\\s+",
  "^del\\s+/f",
  "^rd\\s+/s",
  "^shutdown\\s+",
  "^taskkill\\s+",
  "^diskpart",
  "^reg\\s+delete",
  "^cipher\\s+/w",
];

const DEFAULTS = {
  customizationEnabled: true,

  // === Оформление ===
  background: "miku",
  // "system" | "<built-in-id>" | "custom:<name>". Разрешается на стороне UI.
  font: "system",
  // 100–900; применяется к любому шрифту (системному и кастомному).
  fontWeight: 400,
  // "#rrggbb" или "" — пусто значит "не переопределять".
  fontColor: "",
  backgroundBlur: 0, // px, размытие картинки фона
  headerBlur: 12, // px, backdrop-blur шапки
  sidebarBlur: 12, // px, backdrop-blur сайдбара
  headerOpacity: 45, // %, непрозрачность подложки шапки (0 = прозрачно)
  sidebarOpacity: 45, // %, непрозрачность подложки сайдбара
  toolBlockOpacity: 55, // %, непрозрачность фона tool-блоков
  toolBlockBlur: 0, // px, backdrop-blur tool-блоков
  rgbUsername: true, // анимированный градиент на нике пользователя
  // 'rgb' — радуга; 'blood' — тёмно-красный.
  rgbUsernameStyle: "rgb",

  // Список регэкспов опасных команд (approval-gate, режим 'risky').
  dangerousPatterns: DEFAULT_DANGEROUS_PATTERNS,

  // 'ru' | 'en'. При отсутствии в файле подменяется локалью ОС (readSettings).
  language: "ru",
  // Автоформат после write/edit (prettier/gofmt/ruff/... — по типу файла).
  formattersEnabled: true,

  // === Панель Cookie Code (overlay) ===
  overlayOpacity: 72, // %, непрозрачность подложки
  overlayBlur: 12, // px, backdrop-blur
  overlayWidth: 300, // px
  overlayBgColor: "#111322",
  overlayPrimaryColor: "#8b93ff",
  overlayBtnRadius: 10, // px

  // === Telegram-бот (botsrc/) ===
  telegramEnabled: false, // polling + уведомления
  telegramBotToken: "", // @BotFather
  // 'ru' | 'en'; как language — при отсутствии подменяется локалью ОС.
  telegramLanguage: "ru",
  telegramChatId: "", // целевой чат для уведомлений
  // Если задан — бот принимает сообщения только от этого TG user id.
  telegramAllowedUserId: "",
  // Уведомления о завершении tool-вызовов.
  telegramNotifyTools: false,
  // Denylist имён tool (применяется только при telegramNotifyTools).
  // read/readLines намеренно НЕ в списке — чтение файла показывается как
  // «📖 Reading <path>» и полезно в ленте. todoWrite тоже не здесь: у него
  // отдельная карточка (_renderTodoWrite в botsrc/index.js).
  telegramToolNotifyIgnore: ["glob", "grep"],
  // Приём сообщений из TG в активный чат DeepSeek.
  telegramChatFeed: false,

  // === Голосовые из TG → локальный Whisper (botsrc/whisper.js) ===
  telegramVoiceEnabled: false,
  telegramVoiceModel: "light", // 'light' | 'medium' | 'heavy'
  telegramWhisperLang: "auto", // -l для whisper: 'auto' | 'ru' | 'en' | ...
  telegramWhisperExePath: "", // "" → <userData>/whisper/bin
  telegramWhisperFfmpegPath: "", // "" → искать в PATH

  // === Approval gate ===
  // 'off'   — без подтверждений (историческое поведение);
  // 'risky' — только разрушительные инструменты (bash/pwsh/write/edit/mysql/inject_js/...);
  // 'all'   — каждый tool-вызов и JS-блок.
  toolApprovalMode: "off",

  // Скрыть служебные сообщения (результаты инструментов, JS-сводки, system prompt)
  // в UI. В AI они всё равно уходят — флаг чисто презентационный.
  hideSystemMessages: false,

  // Абсолютные пути в ответах AI → кликабельные чипы (открытие в редакторе/проводнике).
  fileChipEnabled: true,
  // Блок «Затронуто» под ответом (файлы из успешных write/edit).
  showProducedFiles: true,
  // Блок «Токены диалога» в оверлее.
  showConvTokens: false,

  // === Пет (чубрик) ===
  // 'docked' — привязан к полю ввода; 'center' — свободно перетаскивается.
  petMode: "docked",
  // Точка посадки в долях поля ввода [0..1]; Y=0 — верхняя граница поля.
  petRatioX: 0.939,
  petRatioY: 0.016,
  petSize: 64, // px
  petId: "", // имя спрайта в <userData>/pets без расширения; "" → первый найденный
  petEnabled: true,
  petDebugMode: false, // открывает F8/F9/F10/F11

  // === Статистика (дашборд на home) ===
  statsEnabled: true, // собирать сессии/сообщения/токены/дни локально
  statsDebugMode: false, // горячие клавиши + отладочная рамка
  statsDashboardEnabled: true, // показывать дашборд (независимо от сбора)

  // === Таймаут JS-скриптов (сек) ===
  // Дедлайн одного cuckoo-блока (RUN_DEADLINE в tools/JsRunner.js).
  // Валидный диапазон 10..1000; синхронный vm-таймаут отдельно — 30с.
  jsTimeoutSec: 60,
};

let cachedPath = null;

/**
 * Заполнить language/telegramLanguage локалью ОС (для случая "файла нет").
 * @param {object} s
 * @returns {object}
 */
function withSystemLanguage(s) {
  const lang = getSystemLanguage();
  return { ...s, language: lang, telegramLanguage: lang };
}

function getSettingsPath() {
  if (!cachedPath) {
    cachedPath = path.join(app.getPath("userData"), "cuckoo-settings.json");
  }
  return cachedPath;
}

/**
 * Локаль ОС → поддерживаемый язык UI ('ru' | 'en').
 * Кириллические и близкие локали маппятся в 'ru', всё прочее — в 'en'.
 * Применяется как дефолт, пока пользователь не выбрал язык явно.
 */
function getSystemLanguage() {
  let locale = "";
  try {
    locale = (app.getLocale && app.getLocale()) || "";
  } catch (_) {
    /* app может быть недоступен в тестах */
  }
  const lang = String(locale).toLowerCase().split(/[-_]/)[0];
  const RU_LIKE = ["ru", "uk", "be", "kk", "ky", "uz", "tg", "hy", "az", "mo"];
  return RU_LIKE.includes(lang) ? "ru" : "en";
}

/**
 * Прочитать настройки: DEFAULTS ⊕ файл.
 *
 * Гарантии:
 *  - всегда возвращает полный объект (никаких undefined у потребителей);
 *  - отсутствующий файл/битый JSON не бросают — отдаём DEFAULTS;
 *  - language/telegramLanguage при отсутствии в файле берутся из локали ОС
 *    (сигнал "пользователь ещё не выбирал" — не путать с явным "ru").
 */
function readSettings() {
  try {
    const file = getSettingsPath();
    if (!fs.existsSync(file)) return withSystemLanguage({ ...DEFAULTS });

    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    const merged = { ...DEFAULTS, ...parsed };

    // Явный выбор пользователя уважаем; отсутствие ключа = "ещё не выбирал".
    if (!parsed || parsed.language == null)
      merged.language = getSystemLanguage();
    if (!parsed || parsed.telegramLanguage == null)
      merged.telegramLanguage = getSystemLanguage();

    return merged;
  } catch (err) {
    console.error("[Cookie Code] 读取 settings.json 失败:", err.message);
    return withSystemLanguage({ ...DEFAULTS });
  }
}

/**
 * Записать настройки (merge поверх DEFAULTS, чтобы файл всегда был полным).
 * Возвращает записанный объект либо null при ошибке I/O — вызывающий код
 * должен проверять результат, а не полагаться на исключение.
 */
function writeSettings(settings) {
  try {
    const file = getSettingsPath();
    const merged = { ...DEFAULTS, ...settings };
    fs.writeFileSync(file, JSON.stringify(merged, null, 2), "utf-8");
    console.log("[Cookie Code] settings.json 已保存:", file);
    return merged;
  } catch (err) {
    console.error("[Cookie Code] 写入 settings.json 失败:", err.message);
    return null;
  }
}

/**
 * Обновить один ключ (read-modify-write).
 * Не атомарно по отношению к параллельным записям — вызывать из main-процесса
 * последовательно; для UI-настроек этого достаточно.
 */
function setSetting(key, value) {
  const current = readSettings();
  current[key] = value;
  return writeSettings(current);
}

/** Значение одного ключа (с учётом DEFAULTS и системного языка). */
function getSetting(key) {
  const s = readSettings();
  return s[key];
}

module.exports = {
  DEFAULTS,
  DEFAULT_DANGEROUS_PATTERNS,
  getSystemLanguage,
  readSettings,
  writeSettings,
  getSetting,
  setSetting,
  getSettingsPath,
};
