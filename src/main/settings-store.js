/**
 * Пользовательские настройки Cookie Code (settings.json в userData).
 * Простой key-value store с дефолтами.
 *
 * Файл: <userData>/cuckoo-settings.json
 * Пример содержимого:
 *   { "background": "miku" }
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_DANGEROUS_PATTERNS = [
  '^rm\\s+-rf\\s+/',
  '^format\\s+',
  '^del\\s+/f',
  '^rd\\s+/s',
  '^shutdown\\s+',
  '^taskkill\\s+',
  '^diskpart',
  '^reg\\s+delete',
  '^cipher\\s+/w',
];

const DEFAULTS = {
  customizationEnabled: true,
  background: 'miku',
  backgroundBlur: 0,     // px — размытие самой картинки фона
  headerBlur: 12,        // px — стекло верхней панели
  sidebarBlur: 12,       // px — стекло левого сайдбара
  headerOpacity: 45,     // % — плотность фона шапки (0 = прозрачно)
  sidebarOpacity: 45,    // % — плотность фона сайдбара (0 = прозрачно)
  toolBlockOpacity: 55,  // % — плотность фона tool-блоков в чате
  toolBlockBlur: 0,      // px — стекло tool-блоков в чате
  rgbUsername: true,     // RGB-переливание ника пользователя (по умолчанию вкл)
  dangerousPatterns: DEFAULT_DANGEROUS_PATTERNS, // список regex-паттернов опасных команд
  language: 'ru',        // язык UI: 'ru' | 'en'
  // ===== Панель Cookie Code =====
  overlayOpacity: 72,        // % — плотность фона панели оверлея
  overlayBlur: 12,           // px — размытие стекла панели
  overlayWidth: 300,         // px — ширина панели
  overlayBgColor: '#111322', // цвет подложки панели
  overlayPrimaryColor: '#8b93ff', // основной цвет кнопок панели
  overlayBtnRadius: 10,      // px — скругление кнопок панели
  // ===== Telegram-бот (botsrc/) =====
  telegramEnabled: false,   // включить бота (polling + уведомления)
  telegramBotToken: '',     // токен от @BotFather
  telegramChatId: '',       // id твоего чата с ботом
  telegramNotifyTools: false, // присылать уведомления о результате tool
  telegramChatFeed: false,  // принимать сообщения из TG в чат DeepSeek
  // ===== Подтверждение tool-вызовов (approval gate) =====
  // 'off'    — выполнять всё автоматически (прежнее поведение)
  // 'risky'  — спрашивать подтверждение только для рискованных инструментов
  //            (bash/pwsh/write/edit/mysql/inject_js/...)
  // 'all'    — спрашивать подтверждение для каждого tool-вызова и JS-блока
  toolApprovalMode: 'off',
  // Скрывать служебные сообщения в чате (результаты инструментов, JS-сводки,
  // системный промпт) — они по-прежнему уходят в AI, но не показываются в UI.
  hideSystemMessages: false,
};

let cachedPath = null;

function getSettingsPath() {
  if (!cachedPath) {
    cachedPath = path.join(app.getPath('userData'), 'cuckoo-settings.json');
  }
  return cachedPath;
}

/**
 * Язык системы в виде 'ru' | 'en'.
 * Русскоязычные и близкие локали → 'ru', всё остальное → 'en'.
 * Используется как дефолт, если пользователь ещё не выбрал язык явно.
 */
function getSystemLanguage() {
  let locale = '';
  try {
    locale = (app.getLocale && app.getLocale()) || '';
  } catch (_) { /* app может быть недоступен в тестах */ }
  const lang = String(locale).toLowerCase().split(/[-_]/)[0];
  const RU_LIKE = ['ru', 'uk', 'be', 'kk', 'ky', 'uz', 'tg', 'hy', 'az', 'mo'];
  return RU_LIKE.includes(lang) ? 'ru' : 'en';
}

function readSettings() {
  try {
    const file = getSettingsPath();
    if (!fs.existsSync(file)) return { ...DEFAULTS, language: getSystemLanguage() };
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULTS, ...parsed };
    // Пользователь ещё не выбирал язык — подтягиваем язык системы.
    if (!parsed || parsed.language == null) merged.language = getSystemLanguage();
    return merged;
  } catch (err) {
    console.error('[Cookie Code] 读取 settings.json 失败:', err.message);
    return { ...DEFAULTS, language: getSystemLanguage() };
  }
}

function writeSettings(settings) {
  try {
    const file = getSettingsPath();
    const merged = { ...DEFAULTS, ...settings };
    fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf-8');
    console.log('[Cookie Code] settings.json 已保存:', file);
    return merged;
  } catch (err) {
    console.error('[Cookie Code] 写入 settings.json 失败:', err.message);
    return null;
  }
}

/**
 * Частичное обновление одного ключа.
 */
function setSetting(key, value) {
  const current = readSettings();
  current[key] = value;
  return writeSettings(current);
}

/**
 * Получить значение одного ключа.
 */
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
