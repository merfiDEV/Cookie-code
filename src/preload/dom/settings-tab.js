/**
 * Внедрение вкладки «Cookie Code» в настройки DeepSeek.
 * Кнопка в левой панели вкладок + свой контент в правой области.
 *
 * Структура модалки настроек DeepSeek:
 *   .ds-modal-focus-lock
 *     .ds-modal-content
 *       .ds-modal-content__main
 *         .f2ff50b5                       ← контейнер правой панели
 *           .ds-scroll-area               ← скроллируемая область с контентом вкладки
 *             .ds-scroll-area__content    ← сам контент
 *
 * Левая панель вкладок:
 *   .d316d158                             ← контейнер кнопок вкладок
 */
const background = require("./background");
const fonts = require("./fonts");
const state = require("./state");
const { t } = require("../i18n/i18n");

const TAB_BUTTON_ID = "cuckoo-settings-tab-btn";
const TAB_CONTENT_ID = "cuckoo-settings-content";

const CUCKOO_TAB_BUTTON_SELECTOR = ".d316d158";
const MODAL_CONTENT_MAIN_SELECTOR = ".ds-modal-content__main";
const RIGHT_PANEL_WRAPPER_SELECTOR = ".f2ff50b5";
const NATIVE_SCROLL_AREA_SELECTOR = ".ds-scroll-area";

/**
 * Открыть вкладку Cookie Code — скрыть родной контент и показать наш.
 */
function activateCuckooTab() {
  const nativeScroll = document.querySelector(
    MODAL_CONTENT_MAIN_SELECTOR +
      " " +
      RIGHT_PANEL_WRAPPER_SELECTOR +
      " " +
      NATIVE_SCROLL_AREA_SELECTOR,
  );
  const wrapper = document.querySelector(
    MODAL_CONTENT_MAIN_SELECTOR + " " + RIGHT_PANEL_WRAPPER_SELECTOR,
  );
  if (!wrapper) return;

  // Скрываем родной контент
  if (nativeScroll) nativeScroll.style.display = "none";

  // Всегда пересоздаём контент, чтобы подхватить свежие CSS/HTML.
  // Старый удаляем.
  let ourContent = document.getElementById(TAB_CONTENT_ID);
  if (ourContent) {
    try {
      ourContent.remove();
    } catch (_) {}
    ourContent = null;
  }
  if (!ourContent) {
    ourContent = document.createElement("div");
    ourContent.id = TAB_CONTENT_ID;
    ourContent.style.cssText =
      "display: flex; flex-direction: column; gap: 16px; " +
      "width: 100%; min-width: 0; height: 100%; overflow-y: auto; " +
      "padding: 20px 24px; box-sizing: border-box; " +
      "align-items: stretch; " +
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; ' +
      "color: #dde1ff;";

    ourContent.innerHTML = buildContentHTML();

    wrapper.appendChild(ourContent);

    // Вешаем обработчики на превью фонов
    bindBackgroundGrid();
    // Кнопки «Открыть папку фонов» и «Обновить»
    bindBackgroundFolderButtons();
    // Вешаем обработчики на слайдеры размытия
    bindBlurSliders();
    // Чекбокс RGB-переливания
    bindRgbCheckbox();
    // Кнопки выбора языка
    bindLanguageButtons();
    // Опасные команды
    bindDangerousPatterns();
    // Загружаем сохранённые значения блюра в слайдеры
    refreshBlurValues();
    // Загружаем значение RGB-переливания
    refreshRgbCheckbox();
    // Подсвечиваем текущий фон
    refreshBackgroundSelection();
    // Telegram-бот
    bindTelegramSettings();
    refreshTelegramSettings();
    // Глобальный переключатель кастомизации
    bindCustomizationToggle();
    refreshCustomizationToggle();
    // Кнопка сброса
    bindResetButton();
    // Подтверждение инструментов + скрытие служебных сообщений
    bindAgentSettings();
    refreshAgentSettings();
    // Чубрики (петы)
    bindPetsSection();
    // Шрифт
    bindFontsSection();
    refreshFontWeight();
    // Статистика
    bindStatsSection();
    // Подвкладки (категории)
    bindSettingsTabs();
  }
  ourContent.style.display = "";

  // Подсвечиваем нашу кнопку вкладки как активную
  setTabActive();
}

/**
 * HTML-содержимое вкладки настроек Cookie Code.
 */
/**
 * Инлайн-SVG иконки для подвкладок настроек (без внешних ресурсов).
 */
const TAB_ICONS = {
  theme:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5a6.5 6.5 0 100 13c.9 0 1.5-.6 1.5-1.4 0-.4-.2-.7-.4-1-.2-.2-.3-.5-.3-.8 0-.7.6-1.3 1.3-1.3h1.4A2.5 2.5 0 0015 7.5C15 4.2 11.9 1.5 8 1.5z" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="8" cy="4.5" r="1" fill="currentColor"/><circle cx="11" cy="6" r="1" fill="currentColor"/></svg>',
  overlay:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="8" width="5" height="4" rx="1" fill="currentColor"/></svg>',
  bg: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" stroke="currentColor" stroke-width="1.2"/><circle cx="5.5" cy="6" r="1.2" fill="currentColor"/><path d="M2 12l3.5-3.5L9 12l2-2 3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  telegram:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.5 2.2L1.8 7.1c-.7.3-.7.7-.1.9l3 1 1.1 3.4c.1.4.3.5.6.2l1.6-1.5 3 2.2c.5.3.9.1 1-.5l1.6-9.4c.2-.7-.3-1-.9-.7z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6.2 9.4L12 5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
  system:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.2"/><path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
};

/**
 * Кнопка подвкладки с SVG-иконкой и подписью.
 */
function tabButtonHTML(tab, labelKey) {
  return (
    '    <button class="ck-settings-tab ck-btn" data-tab="' +
    tab +
    '">' +
    '<span class="ck-tab-icon">' +
    (TAB_ICONS[tab] || "") +
    "</span>" +
    "<span>" +
    t(labelKey) +
    "</span>" +
    "</button>"
  );
}

function buildContentHTML() {
  const items = background.getAllBackgrounds().map(backgroundItemHTML).join("");
  const fontItems = fonts.getAllFonts().map(fontItemHTML).join("");

  return (
    "" +
    "<style>" +
    // ===== Общий каркас =====
    "  #cuckoo-settings-content * { box-sizing: border-box; }" +
    "  .ck-card { background: rgba(24,26,44,0.55); border: 1px solid rgba(255,255,255,0.07); " +
    "             border-radius: 14px; box-shadow: 0 6px 28px rgba(0,0,0,0.28); overflow: hidden; }" +
    "  .ck-stack { display: flex; flex-direction: column; }" +
    "  .ck-stack > * + * { border-top: 1px solid rgba(255,255,255,0.06); }" +
    "  .ck-row { padding: 14px 16px; transition: background 0.16s ease; min-width: 0; }" +
    "  .ck-row:hover { background: rgba(139,147,255,0.05); }" +
    "  .ck-row-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }" +
    "  .ck-row-head > * { min-width: 0; }" +
    "  .ck-row-head > *:first-child { flex: 1 1 auto; }" +
    "  .ck-row-head > *:last-child { flex: 0 0 auto; }" +
    "  .ck-row-title { font-size: 13.5px; font-weight: 600; color: #e8eaff; " +
    "                  word-break: normal; overflow-wrap: break-word; }" +
    "  .ck-row-hint { font-size: 11.5px; color: #8a90b8; margin-top: 3px; line-height: 1.45; max-width: 520px; " +
    "                 word-break: normal; overflow-wrap: break-word; white-space: normal; }" +
    "  .ck-card, .ck-stack { min-width: 0; }" +
    "  #cuckoo-settings-content { min-width: 0; width: 100%; align-items: stretch; }" +
    "  #cuckoo-settings-content > div { min-width: 0; width: 100%; flex-shrink: 0; }" +
    "  #cuckoo-settings-content * { word-break: normal; overflow-wrap: break-word; }" +
    "  .ck-badge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; " +
    "              text-transform: uppercase; padding: 2px 7px; border-radius: 999px; " +
    "              background: rgba(139,147,255,0.16); color: #bec2ff; margin-left: 8px; vertical-align: middle; }" +
    // ===== Подвкладки (категории) =====
    "  .cuckoo-settings-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 6px; " +
    "                          position: sticky; top: 0; z-index: 20; padding: 8px 0; " +
    "                          background: linear-gradient(180deg, rgba(17,19,34,0.92) 70%, rgba(17,19,34,0)); " +
    "                          backdrop-filter: blur(6px); transition: transform 0.22s ease, opacity 0.22s ease; }" +
    "  .cuckoo-settings-tabs.ck-tabs-hidden { transform: translateY(-120%); opacity: 0; pointer-events: none; }" +
    "  .ck-settings-tab { display: inline-flex; align-items: center; gap: 6px; " +
    "                     padding: 8px 14px; font-size: 12.5px; border-radius: 10px; " +
    "                     border: 1px solid rgba(139,147,255,0.25); background: rgba(139,147,255,0.08); " +
    "                     color: #cfd3ff; cursor: pointer; transition: all 0.16s; white-space: nowrap; }" +
    "  .ck-tab-icon { display: inline-flex; align-items: center; justify-content: center; }" +
    "  .ck-tab-icon svg { display: block; }" +
    "  .ck-settings-tab:hover { background: rgba(139,147,255,0.18); color: #fff; }" +
    "  .ck-settings-tab.ck-tab-active { background: linear-gradient(180deg,#8b93ff,#5b63d6); " +
    "                     color: #fff; border-color: transparent; box-shadow: 0 4px 14px rgba(91,99,214,0.4); }" +
    "  [data-cat] { display: none; }" +
    "  [data-cat].ck-cat-active { display: block; }" +
    // ===== Заголовки =====
    "  .cuckoo-settings-title { font-size: 22px; font-weight: 700; margin: 0 0 4px; color: #eef0ff; letter-spacing: -0.01em; }" +
    "  .cuckoo-settings-subtitle { color: #8a90b8; font-size: 13px; margin: 0 0 20px; line-height: 1.5; }" +
    "  .cuckoo-section-title { font-size: 11.5px; font-weight: 700; margin: 0 0 10px; color: #aeb4ff; " +
    "                          text-transform: uppercase; letter-spacing: 0.9px; display: flex; align-items: center; gap: 8px; }" +
    '  .cuckoo-section-title::before { content: ""; width: 3px; height: 13px; border-radius: 2px; ' +
    "                                  background: linear-gradient(180deg,#8b93ff,#5b63d6); }" +
    // ===== Фоны (сетка) =====
    "  .cuckoo-bg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }" +
    "  .cuckoo-bg-item { cursor: pointer; border: 2px solid rgba(139,147,255,0.18); border-radius: 12px; " +
    "                    overflow: hidden; transition: border-color 0.18s, transform 0.15s, box-shadow 0.18s; background: rgba(0,0,0,0.25); }" +
    "  .cuckoo-bg-item:hover { border-color: rgba(139,147,255,0.65); transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.35); }" +
    "  .cuckoo-bg-item.cuckoo-bg-selected { border-color: #8b93ff; box-shadow: 0 0 0 2px rgba(139,147,255,0.35); }" +
    "  .cuckoo-bg-preview { width: 100%; aspect-ratio: 16/10; background-size: cover; background-position: center; background-color: #0f1220; }" +
    "  .cuckoo-bg-label { font-size: 11px; padding: 6px 8px; text-align: center; color: #cfd3ff; " +
    "                     white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }" +
    "  .cuckoo-font-preview { width: 100%; aspect-ratio: 16/10; display: flex; align-items: center; " +
    "                         justify-content: center; background: #0f1220; color: #e8eaff; " +
    "                         font-size: 20px; line-height: 1.2; }" +
    // ===== Слайдеры =====
    "  .cuckoo-blur-row { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; " +
    "                     background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); " +
    "                     border-radius: 12px; margin-bottom: 8px; transition: border-color 0.16s; }" +
    "  .cuckoo-blur-row:hover { border-color: rgba(139,147,255,0.3); }" +
    "  .cuckoo-blur-label { font-size: 13px; color: #cfd3ff; display: flex; justify-content: space-between; " +
    "                       align-items: center; gap: 10px; }" +
    '  .cuckoo-blur-value { font-size: 11.5px; color: #bec2ff; font-family: "Consolas", monospace; font-weight: 700; ' +
    "                       padding: 2px 8px; border-radius: 7px; background: rgba(139,147,255,0.12); }" +
    "  .cuckoo-blur-slider { width: 100%; height: 5px; -webkit-appearance: none; appearance: none; " +
    "                        background: rgba(139,147,255,0.18); border-radius: 999px; outline: none; cursor: pointer; margin: 6px 0 2px; }" +
    "  .cuckoo-blur-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; " +
    "                        width: 16px; height: 16px; border-radius: 50%; background: #bec2ff; " +
    "                        border: 2px solid #5b63d6; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; " +
    "                        box-shadow: 0 0 10px rgba(139,147,255,0.6); }" +
    "  .cuckoo-blur-slider::-webkit-slider-thumb:hover { transform: scale(1.18); box-shadow: 0 0 16px rgba(139,147,255,0.9); }" +
    // ===== Чекбоксы → кастомные тумблеры =====
    "  .cuckoo-checkbox-row { user-select: none; }" +
    '  .cuckoo-checkbox-row input[type="checkbox"] { -webkit-appearance: none; appearance: none; ' +
    "      width: 40px; height: 22px; border-radius: 999px; background: rgba(255,255,255,0.12); " +
    "      position: relative; cursor: pointer; flex-shrink: 0; transition: background 0.2s ease; " +
    "      border: 1px solid rgba(255,255,255,0.1); margin: 0; }" +
    '  .cuckoo-checkbox-row input[type="checkbox"]::after { content: ""; position: absolute; top: 2px; left: 2px; ' +
    "      width: 16px; height: 16px; border-radius: 50%; background: #cfd3ff; transition: transform 0.2s ease; " +
    "      box-shadow: 0 1px 3px rgba(0,0,0,0.4); }" +
    '  .cuckoo-checkbox-row input[type="checkbox"]:checked { background: linear-gradient(90deg,#8b93ff,#5b63d6); ' +
    "      box-shadow: 0 0 12px rgba(139,147,255,0.5); }" +
    '  .cuckoo-checkbox-row input[type="checkbox"]:checked::after { transform: translateX(18px); background: #fff; }' +
    '  .cuckoo-checkbox-row:hover input[type="checkbox"]:not(:checked) { background: rgba(255,255,255,0.18); }' +
    // ===== Кнопки =====
    "  .ck-btn { padding: 9px 16px; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; " +
    "            border: 1px solid rgba(139,147,255,0.4); background: rgba(139,147,255,0.1); color: #a8afff; " +
    "            transition: all 0.18s ease; white-space: nowrap; }" +
    "  .ck-btn:hover { background: rgba(139,147,255,0.24); color: #fff; border-color: rgba(139,147,255,0.7); transform: translateY(-1px); }" +
    "  .ck-btn:active { transform: scale(0.98); }" +
    "  .ck-btn-danger { border-color: rgba(255,107,122,0.45); background: rgba(255,107,122,0.12); color: #ff9aa5; }" +
    "  .ck-btn-danger:hover { background: rgba(255,107,122,0.28); color: #fff; border-color: rgba(255,107,122,0.8); }" +
    "  .ck-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }" +
    "  .ck-btn-row > .ck-btn { flex: 1 1 auto; }" +
    // ===== Сегмент-переключатель (язык, режим подтверждения) =====
    "  .ck-segment { display: inline-flex; gap: 4px; padding: 4px; border-radius: 999px; " +
    "                background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.07); }" +
    "  .ck-segment > button { border-radius: 999px; }" +
    // ===== Поля ввода =====
    "  .ck-input { width: 100%; padding: 9px 12px; background: rgba(12,14,26,0.7); color: #e8eaff; " +
    "              border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; font-size: 12.5px; " +
    "              outline: none; transition: border-color 0.16s, box-shadow 0.16s; }" +
    "  .ck-input:focus { border-color: rgba(139,147,255,0.7); box-shadow: 0 0 0 3px rgba(139,147,255,0.18); }" +
    "  .ck-textarea { width: 100%; padding: 10px 12px; font-family: Consolas, monospace; font-size: 12px; " +
    "                 background: rgba(12,14,26,0.7); color: #dde1ff; border: 1px solid rgba(255,255,255,0.1); " +
    "                 border-radius: 10px; resize: vertical; line-height: 1.5; outline: none; transition: border-color 0.16s; }" +
    "  .ck-textarea:focus { border-color: rgba(139,147,255,0.7); box-shadow: 0 0 0 3px rgba(139,147,255,0.18); }" +
    "</style>" +
    "<div>" +
    '  <div class="cuckoo-settings-title">Cookie Code</div>' +
    '  <div class="cuckoo-settings-subtitle">' +
    t("settings.subtitle") +
    "</div>" +
    "</div>" +
    // Подвкладки (категории настроек)
    '  <div class="cuckoo-settings-tabs" id="cuckoo-settings-tabs">' +
    tabButtonHTML("theme", "settings.tab.theme") +
    tabButtonHTML("overlay", "settings.tab.overlay") +
    tabButtonHTML("bg", "settings.tab.bg") +
    tabButtonHTML("telegram", "settings.tab.telegram") +
    tabButtonHTML("system", "settings.tab.system") +
    "  </div>" +
    // Кастомизация + Язык — в одной секции
    '<div data-cat="theme">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.customization") +
    "</div>" +
    '  <div class="ck-card ck-stack">' +
    '    <div class="ck-row ck-row-head">' +
    "      <div>" +
    '        <div class="ck-row-title">' +
    t("settings.section.customization") +
    "</div>" +
    '        <div class="ck-row-hint">' +
    t("settings.subtitle") +
    "</div>" +
    "      </div>" +
    '      <button id="cuckoo-customization-toggle" class="ck-btn" style="flex-shrink:0;"></button>' +
    "    </div>" +
    '    <div class="ck-row ck-row-head">' +
    "      <div>" +
    '        <div class="ck-row-title">' +
    t("settings.section.language") +
    "</div>" +
    "      </div>" +
    '      <div class="ck-segment">' +
    '        <button id="cuckoo-lang-ru" class="cuckoo-lang-btn ck-btn" data-lang="ru" style="padding:7px 16px;font-size:12.5px;">' +
    t("settings.lang.ru") +
    "</button>" +
    '        <button id="cuckoo-lang-en" class="cuckoo-lang-btn ck-btn" data-lang="en" style="padding:7px 16px;font-size:12.5px;">' +
    t("settings.lang.en") +
    "</button>" +
    "      </div>" +
    "    </div>" +
    "  </div>" +
    "</div>" +
    '<div data-cat="theme">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.blur") +
    "</div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.blur.bg") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-blur-bg-val">0 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-bg" class="cuckoo-blur-slider" min="0" max="30" step="1" value="0">' +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.blur.header") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-blur-header-val">12 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-header" class="cuckoo-blur-slider" min="0" max="30" step="1" value="12">' +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.blur.sidebar") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-blur-sidebar-val">12 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-sidebar" class="cuckoo-blur-slider" min="0" max="30" step="1" value="12">' +
    "  </div>" +
    "</div>" +
    '<div data-cat="theme">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.opacity") +
    "</div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.opacity.header") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-op-header-val">45 %</span></div>' +
    '    <input type="range" id="cuckoo-op-header" class="cuckoo-blur-slider" min="0" max="100" step="5" value="45">' +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.opacity.sidebar") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-op-sidebar-val">45 %</span></div>' +
    '    <input type="range" id="cuckoo-op-sidebar" class="cuckoo-blur-slider" min="0" max="100" step="5" value="45">' +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.opacity.toolblock") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-op-toolblock-val">55 %</span></div>' +
    '    <input type="range" id="cuckoo-op-toolblock" class="cuckoo-blur-slider" min="0" max="100" step="5" value="55">' +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.blur.toolblock") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-blur-toolblock-val">0 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-toolblock" class="cuckoo-blur-slider" min="0" max="30" step="1" value="0">' +
    "  </div>" +
    "</div>" +
    '<div data-cat="overlay">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.overlay") +
    "</div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.overlay.opacity") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-op-overlay-val">72 %</span></div>' +
    '    <input type="range" id="cuckoo-op-overlay" class="cuckoo-blur-slider" min="10" max="100" step="1" value="72">' +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.overlay.blur") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-blur-overlay-val">12 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-overlay" class="cuckoo-blur-slider" min="0" max="30" step="1" value="12">' +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.overlay.width") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-width-overlay-val">300 px</span></div>' +
    '    <input type="range" id="cuckoo-width-overlay" class="cuckoo-blur-slider" min="260" max="460" step="10" value="300">' +
    "  </div>" +
    '  <div class="cuckoo-blur-row" style="flex-direction:row;justify-content:space-between;align-items:center;">' +
    '    <span style="font-size:13px;color:#cfd3ff;">' +
    t("settings.overlay.bgColor") +
    "</span>" +
    '    <div style="display:flex;align-items:center;gap:8px;">' +
    '      <input type="color" id="cuckoo-color-overlay-bg" value="#111322" style="width:32px;height:32px;border:none;border-radius:6px;cursor:pointer;background:transparent;">' +
    '      <span id="cuckoo-color-overlay-bg-val" class="cuckoo-blur-value">#111322</span>' +
    "    </div>" +
    "  </div>" +
    '  <div class="cuckoo-blur-row" style="flex-direction:row;justify-content:space-between;align-items:center;">' +
    '    <span style="font-size:13px;color:#cfd3ff;">' +
    t("settings.overlay.btnColor") +
    "</span>" +
    '    <div style="display:flex;align-items:center;gap:8px;">' +
    '      <input type="color" id="cuckoo-color-overlay-btn" value="#8b93ff" style="width:32px;height:32px;border:none;border-radius:6px;cursor:pointer;background:transparent;">' +
    '      <span id="cuckoo-color-overlay-btn-val" class="cuckoo-blur-value">#8b93ff</span>' +
    "    </div>" +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.overlay.btnRadius") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-radius-overlay-btn-val">10 px</span></div>' +
    '    <input type="range" id="cuckoo-radius-overlay-btn" class="cuckoo-blur-slider" min="4" max="24" step="1" value="10">' +
    "  </div>" +
    "</div>" +
    '<div data-cat="theme">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.effects") +
    "</div>" +
    '  <div class="ck-card">' +
    '  <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    '    <div class="ck-row-title">' +
    t("settings.effect.rgb") +
    "</div>" +
    '    <input type="checkbox" id="cuckoo-rgb-username" checked>' +
    "  </label>" +
    "  </div>" +
    "</div>" +
    '<div data-cat="theme">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.inputGlass") +
    "</div>" +
    '  <div class="ck-card" style="margin-bottom:8px;">' +
    '  <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    "    <div>" +
    '      <div class="ck-row-title">' +
    t("settings.inputGlass.enabled") +
    "</div>" +
    '      <div class="ck-row-hint">' +
    t("settings.inputGlass.hint") +
    "</div>" +
    "    </div>" +
    '    <input type="checkbox" id="cuckoo-input-glass-enabled">' +
    "  </label>" +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.inputGlass.blur") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-blur-input-val">12 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-input" class="cuckoo-blur-slider" min="0" max="30" step="1" value="12">' +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.inputGlass.opacity") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-op-input-val">55 %</span></div>' +
    '    <input type="range" id="cuckoo-op-input" class="cuckoo-blur-slider" min="0" max="100" step="5" value="55">' +
    "  </div>" +
    "</div>" +
    '<div data-cat="system">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.dangerous") +
    "</div>" +
    '  <textarea id="cuckoo-dangerous-patterns" class="ck-textarea" rows="8" spellcheck="false"></textarea>' +
    '  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;">' +
    '    <span class="ck-row-hint" style="margin:0;">' +
    t("settings.dangerous.hint") +
    "</span>" +
    '    <button id="cuckoo-btn-save-dangerous" class="ck-btn" style="padding:8px 16px;font-size:12px;flex-shrink:0;">' +
    t("settings.dangerous.save") +
    "</button>" +
    "  </div>" +
    "</div>" +
    '<div data-cat="system">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.agent") +
    "</div>" +
    '  <div class="ck-card" style="padding:14px 16px;margin-bottom:8px;">' +
    '    <div class="ck-row-title" style="margin-bottom:10px;">' +
    t("settings.approval.hint") +
    "</div>" +
    '    <div class="ck-segment" style="display:flex;width:100%;">' +
    '      <button class="cuckoo-approval-btn ck-btn" data-mode="off" style="flex:1;padding:8px 10px;font-size:12px;">' +
    t("settings.approval.off") +
    "</button>" +
    '      <button class="cuckoo-approval-btn ck-btn" data-mode="risky" style="flex:1;padding:8px 10px;font-size:12px;">' +
    t("settings.approval.risky") +
    "</button>" +
    '      <button class="cuckoo-approval-btn ck-btn" data-mode="all" style="flex:1;padding:8px 10px;font-size:12px;">' +
    t("settings.approval.all") +
    "</button>" +
    "    </div>" +
    "  </div>" +
    // ===== Таймаут выполнения JS-скриптов =====
    '  <div class="ck-card" style="padding:14px 16px;margin-bottom:8px;">' +
    '    <div class="ck-row-title" style="margin-bottom:6px;">' +
    t("settings.jsTimeout.title") +
    "</div>" +
    '    <div class="ck-row-hint" style="margin-bottom:10px;">' +
    t("settings.jsTimeout.hint") +
    "</div>" +
    '    <div style="display:flex;gap:10px;align-items:center;">' +
    '      <input type="number" id="cuckoo-js-timeout" class="ck-input" min="10" max="1000" step="5" style="flex:1;" />' +
    '      <span style="font-size:12px;color:#8a90b8;flex-shrink:0;">' +
    t("settings.jsTimeout.unit") +
    "</span>" +
    '      <button id="cuckoo-js-timeout-save" class="ck-btn" style="padding:8px 16px;font-size:12px;flex-shrink:0;">' +
    t("settings.jsTimeout.save") +
    "</button>" +
    "    </div>" +
    "  </div>" +
    '  <div class="ck-card ck-stack">' +
    '  <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    "    <div>" +
    '      <div class="ck-row-title">' +
    t("settings.hideSystemMessages") +
    "</div>" +
    '      <div class="ck-row-hint">' +
    t("settings.hideSystemMessages.hint") +
    "</div>" +
    "    </div>" +
    '    <input type="checkbox" id="cuckoo-hide-system-messages">' +
    "  </label>" +
    '  <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    "    <div>" +
    '      <div class="ck-row-title">' +
    t("settings.fileChip") +
    "</div>" +
    '      <div class="ck-row-hint">' +
    t("settings.fileChip.hint") +
    "</div>" +
    "    </div>" +
    '    <input type="checkbox" id="cuckoo-file-chip-enabled">' +
    "  </label>" +
    '  <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    "    <div>" +
    '      <div class="ck-row-title">' +
    t("settings.showProducedFiles") +
    "</div>" +
    '      <div class="ck-row-hint">' +
    t("settings.showProducedFiles.hint") +
    "</div>" +
    "    </div>" +
    '    <input type="checkbox" id="cuckoo-show-produced-enabled">' +
    "  </label>" +
    '  <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    "    <div>" +
    '      <div class="ck-row-title">' +
    t("settings.showConvTokens") +
    '<span class="ck-badge">new</span></div>' +
    '      <div class="ck-row-hint">' +
    t("settings.showConvTokens.hint") +
    "</div>" +
    "    </div>" +
    '    <input type="checkbox" id="cuckoo-show-conv-tokens">' +
    "  </label>" +
    '  <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    "    <div>" +
    '      <div class="ck-row-title">' +
    t("settings.formatters") +
    "</div>" +
    '      <div class="ck-row-hint">' +
    t("settings.formatters.hint") +
    "</div>" +
    "    </div>" +
    '    <input type="checkbox" id="cuckoo-formatters-enabled">' +
    "  </label>" +
    "  </div>" +
    "</div>" +
    // ===== Чубрики (петы) =====
    buildPetsSection() +
    '<div data-cat="bg">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.background") +
    "</div>" +
    '  <div class="ck-btn-row" style="margin-bottom:10px;">' +
    '    <button id="cuckoo-bg-open-folder" class="ck-btn">' +
    t("settings.bg.openFolder") +
    "</button>" +
    '    <button id="cuckoo-bg-refresh" class="ck-btn">' +
    t("settings.bg.refresh") +
    "</button>" +
    "  </div>" +
    '  <div class="cuckoo-bg-grid" id="cuckoo-bg-grid">' +
    items +
    "</div>" +
    '  <div class="ck-row-hint" style="margin-top:8px;">' +
    t("settings.bg.hint") +
    "</div>" +
    "</div>" +
    // ===== Шрифт =====
    '<div data-cat="bg">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.font") +
    "</div>" +
    '  <div class="ck-btn-row" style="margin-bottom:10px;">' +
    '    <button id="cuckoo-font-open-folder" class="ck-btn">' +
    t("settings.font.openFolder") +
    "</button>" +
    '    <button id="cuckoo-font-refresh" class="ck-btn">' +
    t("settings.font.refresh") +
    "</button>" +
    "  </div>" +
    '  <div class="cuckoo-bg-grid" id="cuckoo-font-grid">' +
    fontItems +
    "</div>" +
    '  <div class="cuckoo-blur-row" style="margin-top:10px;">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("settings.font.weight") +
    '</span><span class="cuckoo-blur-value" id="cuckoo-font-weight-val">400</span></div>' +
    '    <input type="range" id="cuckoo-font-weight" class="cuckoo-blur-slider" min="100" max="900" step="100" value="400">' +
    "  </div>" +
    '  <div class="ck-row-hint" style="margin-top:8px;">' +
    t("settings.font.hint") +
    "</div>" +
    "</div>" +
    '<div data-cat="telegram">' +
    '  <div class="cuckoo-section-title">' +
    t("tg.title") +
    "</div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("tg.label.token") +
    "</span></div>" +
    '    <input type="password" id="cuckoo-tg-token" class="ck-input" placeholder="123456:ABC-DEF..." />' +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("tg.label.chatId") +
    "</span></div>" +
    '    <input type="text" id="cuckoo-tg-chatid" class="ck-input" placeholder="123456789" />' +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("tg.label.allowedUserId") +
    "</span></div>" +
    '    <input type="text" id="cuckoo-tg-alloweduser" class="ck-input" placeholder="123456789" />' +
    "  </div>" +
    '  <div class="cuckoo-blur-row" style="flex-direction:column;align-items:stretch;gap:6px;">' +
    '    <div class="cuckoo-blur-label"><span>' +
    t("tg.label.notifyIgnore") +
    "</span></div>" +
    '    <textarea id="cuckoo-tg-notify-ignore" class="ck-input" rows="3" placeholder="read,glob,grep"></textarea>' +
    "  </div>" +
    '  <div class="cuckoo-blur-row">' +
    '    <label class="cuckoo-checkbox-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;padding:4px 0;"><span style="font-size:13px;color:#cfd3ff;">' +
    t("tg.label.enabled") +
    '</span><input type="checkbox" id="cuckoo-tg-enabled"></label>' +
    '    <label class="cuckoo-checkbox-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;padding:4px 0;"><span style="font-size:13px;color:#cfd3ff;">' +
    t("tg.label.notifyTools") +
    '</span><input type="checkbox" id="cuckoo-tg-notify"></label>' +
    '    <label class="cuckoo-checkbox-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;padding:4px 0;"><span style="font-size:13px;color:#cfd3ff;">' +
    t("tg.label.chatFeed") +
    '</span><input type="checkbox" id="cuckoo-tg-feed"></label>' +
    "  </div>" +
    '  <div class="ck-btn-row" style="margin-top:8px;">' +
    '    <button id="cuckoo-tg-save" class="ck-btn">' +
    t("tg.btn.save") +
    "</button>" +
    '    <button id="cuckoo-tg-ping" class="ck-btn">' +
    t("tg.btn.ping") +
    "</button>" +
    '    <button id="cuckoo-tg-test" class="ck-btn">' +
    t("tg.btn.test") +
    "</button>" +
    "  </div>" +
    "</div>" +
    // ===== Статистика использования =====
    '<div data-cat="system">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.stats") +
    "</div>" +
    '  <div class="ck-card ck-stack">' +
    '  <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    "    <div>" +
    '      <div class="ck-row-title">' +
    t("settings.stats.enabled") +
    "</div>" +
    '      <div class="ck-row-hint">' +
    t("settings.stats.enabledHint") +
    "</div>" +
    "    </div>" +
    '    <input type="checkbox" id="cuckoo-stats-enabled">' +
    "  </label>" +
    '  <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    "    <div>" +
    '      <div class="ck-row-title">' +
    t("settings.stats.debugTitle") +
    "</div>" +
    '      <div class="ck-row-hint">' +
    t("settings.stats.debugHint") +
    "</div>" +
    "    </div>" +
    '    <input type="checkbox" id="cuckoo-stats-debug">' +
    "  </label>" +
    '  <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    "    <div>" +
    '      <div class="ck-row-title">' +
    t("settings.stats.showTitle") +
    "</div>" +
    '      <div class="ck-row-hint">' +
    t("settings.stats.showHint") +
    "</div>" +
    "    </div>" +
    '    <input type="checkbox" id="cuckoo-stats-show">' +
    "  </label>" +
    "  </div>" +
    '  <div class="ck-btn-row" style="margin-top:8px;">' +
    '    <button id="cuckoo-stats-reset" class="ck-btn ck-btn-danger">' +
    t("settings.stats.reset") +
    "</button>" +
    "  </div>" +
    '  <div class="ck-row-hint" style="margin-top:8px;">' +
    t("settings.stats.hint") +
    "</div>" +
    "</div>" +
    '<div data-cat="system">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.service") +
    "</div>" +
    '  <div class="ck-btn-row">' +
    '    <button id="cuckoo-btn-open-config" class="ck-btn" title="' +
    t("settings.btn.openConfig.title") +
    '">' +
    t("settings.btn.openConfig") +
    "</button>" +
    '    <button id="cuckoo-btn-clear-storage" class="ck-btn" title="' +
    t("settings.btn.clearStorage.title") +
    '">' +
    t("settings.btn.clearStorage") +
    "</button>" +
    '    <button id="cuckoo-btn-reset" class="ck-btn ck-btn-danger">' +
    t("settings.btn.reset") +
    "</button>" +
    "  </div>" +
    "</div>" +
    // ===== Диагностика интеграции =====
    '<div data-cat="system">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.diagnostics") +
    "</div>" +
    '  <div class="ck-card" style="padding:14px 16px;">' +
    '    <div class="ck-row-title" style="margin-bottom:6px;">' +
    t("settings.diagnostics.title") +
    "</div>" +
    '    <div class="ck-row-hint" style="margin-bottom:10px;">' +
    t("settings.diagnostics.hint") +
    "</div>" +
    '    <div class="ck-btn-row">' +
    '      <button id="cuckoo-btn-diagnostics" class="ck-btn">' +
    t("settings.diagnostics.run") +
    "</button>" +
    "    </div>" +
    "  </div>" +
    "</div>" +
    // ===== Модалка отчёта =====
    '<div id="cuckoo-diag-modal" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(6,8,18,0.72);align-items:center;justify-content:center;">' +
    '  <div style="background:#141726;border:1px solid rgba(139,147,255,0.35);border-radius:14px;max-width:720px;width:92%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.6);">' +
    '    <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;justify-content:space-between;align-items:center;">' +
    '      <div style="font-size:15px;font-weight:700;color:#eef0ff;">' +
    t("settings.diagnostics.modalTitle") +
    "</div>" +
    '      <button id="cuckoo-diag-close" class="ck-btn" style="padding:6px 12px;font-size:12px;">✕</button>' +
    "    </div>" +
    '    <pre id="cuckoo-diag-body" style="flex:1;overflow:auto;margin:0;padding:16px 20px;font-family:Consolas,monospace;font-size:12px;line-height:1.55;color:#dde1ff;white-space:pre-wrap;word-break:break-word;"></pre>' +
    '    <div style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.07);display:flex;gap:8px;justify-content:flex-end;">' +
    '      <button id="cuckoo-diag-copy" class="ck-btn">' +
    t("settings.diagnostics.copy") +
    "</button>" +
    "    </div>" +
    "  </div>" +
    "</div>"
  );
}

/**
 * HTML-секция «Чубрики (петы)» — карточка в настройках Cookie Code.
 * Список спрайтов + тумблер debug-режима + кнопка открыть папку.
 * Данные подгружаются асинхронно через window.electronAPI.listPets().
 */
function buildPetsSection() {
  return (
    '<div data-cat="bg">' +
    '  <div class="cuckoo-section-title">' +
    t("settings.section.pets") +
    "</div>" +
    '  <div class="ck-card ck-stack">' +
    '    <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    "      <div>" +
    '        <div class="ck-row-title">' +
    t("settings.pets.enabledTitle") +
    "</div>" +
    '        <div class="ck-row-hint">' +
    t("settings.pets.enabledHint") +
    "</div>" +
    "      </div>" +
    '      <input type="checkbox" id="cuckoo-pet-enabled">' +
    "    </label>" +
    '    <div class="ck-row">' +
    "      <div>" +
    '        <div class="ck-row-title">' +
    t("settings.pets.pickTitle") +
    "</div>" +
    '        <div class="ck-row-hint">' +
    t("settings.pets.pickHint") +
    "</div>" +
    "      </div>" +
    '      <div class="ck-btn-row" style="margin-top:10px;">' +
    '        <button id="cuckoo-pets-import" class="ck-btn" style="flex:1;padding:6px 12px;font-size:12px;">' +
    t("settings.pets.import") +
    "</button>" +
    '        <button id="cuckoo-pets-refresh" class="ck-btn" style="flex:1;padding:6px 12px;font-size:12px;">' +
    t("settings.pets.refresh") +
    "</button>" +
    '        <button id="cuckoo-pets-open-folder" class="ck-btn" style="flex:1;padding:6px 12px;font-size:12px;">' +
    t("settings.pets.openFolder") +
    "</button>" +
    '        <button id="cuckoo-pets-reset" class="ck-btn ck-btn-danger" style="flex:1;padding:6px 12px;font-size:12px;">' +
    t("settings.pets.reset") +
    "</button>" +
    "      </div>" +
    '      <div id="cuckoo-pets-grid" class="cuckoo-bg-grid" style="margin-top:12px;"></div>' +
    '      <div id="cuckoo-pets-empty" class="ck-row-hint" style="margin-top:8px;display:none;">' +
    t("settings.pets.empty") +
    "      </div>" +
    "    </div>" +
    '    <label class="cuckoo-checkbox-row ck-row ck-row-head" style="cursor:pointer;">' +
    "      <div>" +
    '        <div class="ck-row-title">' +
    t("settings.pets.debugTitle") +
    "</div>" +
    '        <div class="ck-row-hint">' +
    t("settings.pets.debugHint") +
    "</div>" +
    "      </div>" +
    '      <input type="checkbox" id="cuckoo-pet-debug-mode">' +
    "    </label>" +
    "  </div>" +
    "</div>"
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Обработчики клика по превью: сохраняем фон и применяем.
 */
function bindBackgroundGrid() {
  const grid = document.querySelectorAll(
    "#" + TAB_CONTENT_ID + " .cuckoo-bg-item",
  );
  grid.forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-bg-id");
      if (!id) return;
      // Мгновенно применяем
      background.apply(id);
      // Подсветка
      document
        .querySelectorAll("#" + TAB_CONTENT_ID + " .cuckoo-bg-item")
        .forEach((x) => x.classList.remove("cuckoo-bg-selected"));
      el.classList.add("cuckoo-bg-selected");
      // Сохраняем в settings.json
      try {
        const res = await window.electronAPI.setCuckooSetting("background", id);
        if (!res || !res.success) {
          console.error(
            "[Cookie Code] Не удалось сохранить фон:",
            res && res.error,
          );
        }
      } catch (err) {
        console.error("[Cookie Code] Ошибка сохранения фона:", err.message);
      }
    });
  });
}

// ===== Чубрики (петы) =====

/**
 * Обработчики секции «Чубрики»: список спрайтов, тумблер debug-режима,
 * кнопки «Обновить» / «Открыть папку», клики по превью.
 */
function bindPetsSection() {
  const grid = document.getElementById("cuckoo-pets-grid");
  const empty = document.getElementById("cuckoo-pets-empty");
  const refreshBtn = document.getElementById("cuckoo-pets-refresh");
  const openBtn = document.getElementById("cuckoo-pets-open-folder");
  const importBtn = document.getElementById("cuckoo-pets-import");
  const resetBtn = document.getElementById("cuckoo-pets-reset");
  const debugChk = document.getElementById("cuckoo-pet-debug-mode");
  const enabledChk = document.getElementById("cuckoo-pet-enabled");
  if (!grid) return;

  let currentPetId = "";
  let currentPetFile = "";

  const renderPets = (pets) => {
    grid.innerHTML = "";
    if (!pets || pets.length === 0) {
      empty.style.display = "";
      return;
    }
    empty.style.display = "none";
    pets.forEach((p) => {
      const item = document.createElement("div");
      item.className = "cuckoo-bg-item";
      item.setAttribute("data-pet-id", p.id);
      item.setAttribute("data-pet-file", p.file);
      const active =
        p.id === currentPetId || p.file === currentPetFile
          ? " cuckoo-bg-selected"
          : "";
      item.className += active;
      item.style.position = "relative";
      item.title = p.label;
      // Превью
      const prev = document.createElement("div");
      prev.className = "cuckoo-bg-preview";
      prev.style.backgroundImage =
        'url("' + background.getPreviewUri(p.file) + '")';
      prev.style.backgroundSize = "contain";
      prev.style.backgroundRepeat = "no-repeat";
      item.appendChild(prev);
      // Подпись
      const lbl = document.createElement("div");
      lbl.className = "cuckoo-bg-label";
      lbl.textContent = p.label;
      item.appendChild(lbl);

      // Кнопка «Вырезать фон» — только для GIF
      const isGif = /\.gif$/i.test(p.file);
      if (isGif) {
        const chromaBtn = document.createElement("button");
        chromaBtn.className = "ck-btn";
        chromaBtn.style.cssText =
          "position:absolute;top:4px;right:4px;padding:3px 6px;font-size:10px;" +
          "border-radius:6px;background:rgba(139,147,255,0.85);color:#fff;" +
          "border:none;cursor:pointer;z-index:2;opacity:0.9;";
        chromaBtn.textContent = t("settings.pets.chromaBtn");
        chromaBtn.title = t("settings.pets.chromaTitle");
        chromaBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openChromaModal(p);
        });
        item.appendChild(chromaBtn);
      }

      // Клик — выбрать
      item.addEventListener("click", async () => {
        try {
          currentPetId = p.id;
          currentPetFile = p.file;
          await window.electronAPI.setCuckooSetting("petId", p.id);
          // Просим пет перечитать настройки (если preload уже отрисовал пета)
          try {
            const pet = require("./pet");
            if (pet && typeof pet.reloadSettings === "function") {
              await pet.reloadSettings();
            }
          } catch (_) {}
          // Перерисовать сетку с активной рамкой
          grid.querySelectorAll(".cuckoo-bg-item").forEach((el) => {
            el.classList.toggle(
              "cuckoo-bg-selected",
              el.getAttribute("data-pet-id") === p.id,
            );
          });
        } catch (err) {
          console.error("[Cookie Code] Не удалось выбрать пета:", err.message);
        }
      });
      grid.appendChild(item);
    });
  };

  const loadPets = async () => {
    try {
      const settings = await window.electronAPI.getCuckooSettings();
      currentPetId = (settings && settings.petId) || "";
      const res = await window.electronAPI.listPets();
      const pets = (res && res.pets) || [];
      // Если petId пустой — пометим первый файл как выбранный
      if (!currentPetId && pets.length > 0) currentPetId = pets[0].id;
      renderPets(pets);
    } catch (err) {
      console.error(
        "[Cookie Code] Не удалось загрузить список петов:",
        err.message,
      );
      empty.style.display = "";
    }
  };

  if (refreshBtn) refreshBtn.addEventListener("click", loadPets);

  if (resetBtn)
    resetBtn.addEventListener("click", async () => {
      try {
        try {
          const pet = require("./pet");
          if (pet && typeof pet.resetAllPetSettings === "function") {
            await pet.resetAllPetSettings();
          }
        } catch (_) {}
        window.electronAPI.showBannerNotification(
          t("settings.pets.resetDone"),
          { duration: 3500 },
        );
        await loadPets();
      } catch (err) {
        console.error("[Cookie Code] Сброс настроек пета失败:", err.message);
      }
    });

  if (importBtn)
    importBtn.addEventListener("click", async () => {
      try {
        const res = await window.electronAPI.importPet();
        if (!res || res.canceled) return;
        if (!res.success) {
          window.electronAPI.showBannerNotification(
            t("settings.pets.importError").replace(
              "{msg}",
              res.error || "unknown",
            ),
            { duration: 6000 },
          );
          return;
        }

        // Если файл был сжат — сообщим размеры до/после
        if (res.normalized && res.before && res.after) {
          window.electronAPI.showBannerNotification(
            t("settings.pets.importCompressed")
              .replace("{w1}", String(res.before.w))
              .replace("{h1}", String(res.before.h))
              .replace("{w2}", String(res.after.w))
              .replace("{h2}", String(res.after.h)),
            { duration: 5000 },
          );
        }

        // Автоматически выбираем загруженного пета
        try {
          await window.electronAPI.setCuckooSetting("petId", res.id);
          currentPetId = res.id;
          try {
            const pet = require("./pet");
            if (pet && typeof pet.reloadSettings === "function") {
              await pet.reloadSettings();
            }
          } catch (_) {}
        } catch (_) {}

        await loadPets();
      } catch (err) {
        console.error("[Cookie Code] Импорт пета失败:", err.message);
      }
    });

  if (openBtn)
    openBtn.addEventListener("click", async () => {
      try {
        await window.electronAPI.openPetsFolder();
        // после открытия — обновим список через небольшую задержку
        setTimeout(loadPets, 800);
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось открыть папку петов:",
          err.message,
        );
      }
    });

  if (enabledChk) {
    enabledChk.addEventListener("change", async () => {
      const on = enabledChk.checked;
      try {
        await window.electronAPI.setCuckooSetting("petEnabled", on);
        try {
          const pet = require("./pet");
          if (pet && typeof pet.setEnabled === "function") pet.setEnabled(on);
        } catch (_) {}
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось сохранить petEnabled:",
          err.message,
        );
      }
    });
  }

  if (debugChk) {
    debugChk.addEventListener("change", async () => {
      const on = debugChk.checked;
      try {
        await window.electronAPI.setCuckooSetting("petDebugMode", on);
        try {
          const pet = require("./pet");
          if (pet && typeof pet.setDebugMode === "function")
            pet.setDebugMode(on);
        } catch (_) {}
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось сохранить petDebugMode:",
          err.message,
        );
      }
    });
  }

  // Начальное состояние тумблера debug-режима + загрузка списка
  (async () => {
    try {
      const settings = await window.electronAPI.getCuckooSettings();
      if (debugChk) debugChk.checked = !!(settings && settings.petDebugMode);
      // petEnabled: по умолчанию true → галочка стоит, если не выставлено false.
      if (enabledChk)
        enabledChk.checked = !settings || settings.petEnabled !== false;
    } catch (_) {}
    await loadPets();
  })();
}

// ===== Chroma-key редактор для GIF =====

/**
 * Открыть модалку редактора фона для GIF.
 * Показывает первый кадр, даёт пипетку и слайдер tolerance, применяет
 * через main-процесс (IPC cuckoo-pets-chroma).
 *
 * @param {{id: string, label: string, file: string}} pet
 */
function openChromaModal(pet) {
  // Уже есть — закрываем старую
  const old = document.getElementById("cuckoo-chroma-modal");
  if (old) old.remove();

  const modal = document.createElement("div");
  modal.id = "cuckoo-chroma-modal";
  modal.style.cssText =
    "position:fixed;inset:0;z-index:2147483650;background:rgba(6,8,18,0.78);" +
    "display:flex;align-items:center;justify-content:center;padding:20px;";

  const inner = document.createElement("div");
  inner.style.cssText =
    "background:#141726;border:1px solid rgba(139,147,255,0.35);border-radius:14px;" +
    "width:min(640px,100%);max-height:90vh;display:flex;flex-direction:column;" +
    "box-shadow:0 20px 60px rgba(0,0,0,0.6);overflow:hidden;";

  // Header
  const header = document.createElement("div");
  header.style.cssText =
    "padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.07);" +
    "display:flex;justify-content:space-between;align-items:center;";
  const title = document.createElement("div");
  title.style.cssText = "font-size:15px;font-weight:700;color:#eef0ff;";
  title.textContent = t("settings.pets.chromaModalTitle");
  const closeBtn = document.createElement("button");
  closeBtn.className = "ck-btn";
  closeBtn.style.cssText = "padding:6px 12px;font-size:12px;";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => modal.remove());
  header.appendChild(title);
  header.appendChild(closeBtn);
  inner.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.style.cssText =
    "padding:14px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;";

  const hint = document.createElement("div");
  hint.className = "ck-row-hint";
  hint.style.margin = "0";
  hint.textContent = t("settings.pets.chromaHint");
  body.appendChild(hint);

  // Canvas
  const canvasWrap = document.createElement("div");
  canvasWrap.style.cssText =
    "background:repeating-conic-gradient(#2a2d40 0% 25%, #1d2030 0% 50%) 50% / 16px 16px;" +
    "border-radius:10px;padding:8px;display:flex;justify-content:center;";
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "max-width:100%;max-height:320px;image-rendering:pixelated;cursor:crosshair;" +
    "border-radius:6px;";
  canvasWrap.appendChild(canvas);
  body.appendChild(canvasWrap);

  const previewHint = document.createElement("div");
  previewHint.className = "ck-row-hint";
  previewHint.style.margin = "0";
  previewHint.textContent = t("settings.pets.chromaPreviewHint");
  body.appendChild(previewHint);

  // Выбранный цвет
  const colorRow = document.createElement("div");
  colorRow.style.cssText =
    "display:flex;align-items:center;gap:10px;font-size:12px;color:#cfd3ff;";
  const colorSwatch = document.createElement("div");
  colorSwatch.style.cssText =
    "width:24px;height:24px;border-radius:6px;border:1px solid rgba(255,255,255,0.25);" +
    "background:#000;flex-shrink:0;";
  const colorLabel = document.createElement("span");
  colorLabel.textContent = t("settings.pets.chromaPicked").replace(
    "{color}",
    "—",
  );
  colorRow.appendChild(colorSwatch);
  colorRow.appendChild(colorLabel);
  body.appendChild(colorRow);

  // Tolerance
  const tolRow = document.createElement("div");
  tolRow.className = "cuckoo-blur-row";
  tolRow.style.cssText =
    "display:flex;flex-direction:column;gap:6px;padding:10px 12px;" +
    "background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.07);" +
    "border-radius:10px;";
  const tolLabel = document.createElement("div");
  tolLabel.className = "cuckoo-blur-label";
  tolLabel.innerHTML =
    "<span>" +
    t("settings.pets.chromaTolerance") +
    "</span>" +
    '<span class="cuckoo-blur-value" id="cuckoo-chroma-tol-val">16</span>';
  const tolInput = document.createElement("input");
  tolInput.type = "range";
  tolInput.min = "0";
  tolInput.max = "128";
  tolInput.value = "16";
  tolInput.className = "cuckoo-blur-slider";
  tolInput.id = "cuckoo-chroma-tol";
  tolInput.addEventListener("input", () => {
    document.getElementById("cuckoo-chroma-tol-val").textContent =
      tolInput.value;
  });
  tolRow.appendChild(tolLabel);
  tolRow.appendChild(tolInput);
  body.appendChild(tolRow);

  // Footer
  const footer = document.createElement("div");
  footer.style.cssText =
    "padding:12px 18px;border-top:1px solid rgba(255,255,255,0.07);" +
    "display:flex;gap:8px;justify-content:flex-end;";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "ck-btn";
  cancelBtn.textContent = t("settings.pets.chromaCancel");
  cancelBtn.addEventListener("click", () => modal.remove());
  const applyBtn = document.createElement("button");
  applyBtn.className = "ck-btn";
  applyBtn.style.background = "rgba(139,147,255,0.35)";
  applyBtn.textContent = t("settings.pets.chromaApply");
  footer.appendChild(cancelBtn);
  footer.appendChild(applyBtn);

  inner.appendChild(body);
  inner.appendChild(footer);
  modal.appendChild(inner);
  document.body.appendChild(modal);

  // ===== Загрузка GIF в canvas =====
  const img = new Image();
  const dataUri = background.getPreviewUri(pet.file);
  let pickedColor = null; // {r,g,b,hex}

  const redraw = () => {
    if (!img.naturalWidth) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };

  img.onload = () => {
    redraw();
  };
  img.onerror = () => {
    console.error("[Cookie Code] Не удалось загрузить GIF:", pet.file);
  };
  img.src = dataUri;

  // ===== Пипетка =====
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(
      ((e.clientY - rect.top) / rect.height) * canvas.height,
    );
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const ctx = canvas.getContext("2d");
    const px = ctx.getImageData(x, y, 1, 1).data;
    const r = px[0];
    const g = px[1];
    const b = px[2];
    const hex =
      "#" +
      ((1 << 24) | (r << 16) | (g << 8) | b)
        .toString(16)
        .slice(1)
        .toUpperCase();
    pickedColor = { r, g, b, hex };
    colorSwatch.style.background = hex;
    colorLabel.textContent = t("settings.pets.chromaPicked").replace(
      "{color}",
      hex,
    );
  });

  // ===== Применить =====
  applyBtn.addEventListener("click", async () => {
    if (!pickedColor) {
      await window.electronAPI.showBannerNotification(
        t("settings.pets.chromaNoColor"),
        { duration: 4000 },
      );
      return;
    }
    applyBtn.disabled = true;
    const oldText = applyBtn.textContent;
    applyBtn.textContent = t("settings.pets.chromaProcessing");
    try {
      const tolerance = Number(tolInput.value) || 0;
      const res = await window.electronAPI.chromaKeyPet(
        pet.file,
        pickedColor.hex,
        tolerance,
      );
      if (res && res.success) {
        await window.electronAPI.showBannerNotification(
          t("settings.pets.chromaDone"),
          { duration: 4000 },
        );
        modal.remove();
        // Сброс кэша data-URI в background, перерисовка превью и пета.
        try {
          if (typeof background.invalidatePreviewCache === "function") {
            background.invalidatePreviewCache(pet.file);
          }
        } catch (_) {}
        try {
          const itemEl = document.querySelector(
            '#cuckoo-pets-grid .cuckoo-bg-item[data-pet-file="' +
              String(pet.file).replace(/"/g, '\\"') +
              '"]',
          );
          if (itemEl) {
            const prev = itemEl.querySelector(".cuckoo-bg-preview");
            if (prev) {
              const newUri = background.getPreviewUri(pet.file);
              prev.style.backgroundImage = 'url("' + newUri + '")';
            }
          }
        } catch (err) {
          console.error(
            "[Cookie Code] Не удалось обновить превью:",
            err.message,
          );
        }
        try {
          const petMod = require("./pet");
          if (petMod && typeof petMod.reloadSettings === "function") {
            await petMod.reloadSettings();
          }
        } catch (_) {}
      } else {
        await window.electronAPI.showBannerNotification(
          t("settings.pets.chromaError").replace(
            "{msg}",
            (res && res.error) || "unknown",
          ),
          { duration: 6000 },
        );
        applyBtn.disabled = false;
        applyBtn.textContent = oldText;
      }
    } catch (err) {
      await window.electronAPI.showBannerNotification(
        t("settings.pets.chromaError").replace("{msg}", err.message),
        { duration: 6000 },
      );
      applyBtn.disabled = false;
      applyBtn.textContent = oldText;
    }
  });

  // Esc — закрыть
  const onKey = (e) => {
    if (e.key === "Escape") {
      modal.remove();
      window.removeEventListener("keydown", onKey, true);
    }
  };
  window.addEventListener("keydown", onKey, true);
}

/**
 * Собрать HTML одного превью фона.
 */
function backgroundItemHTML(b) {
  const uri = background.getPreviewUri(b.file);
  const styleAttr = uri
    ? " style=\"background-image: url('" + uri + "');\""
    : "";
  return (
    '<div class="cuckoo-bg-item" data-bg-id="' +
    b.id +
    '" title="' +
    escapeHtml(b.label) +
    '">' +
    '  <div class="cuckoo-bg-preview"' +
    styleAttr +
    "></div>" +
    '  <div class="cuckoo-bg-label">' +
    escapeHtml(b.label) +
    "</div>" +
    "</div>"
  );
}

/**
 * Перерисовать сетку фонов (встроенные + пользовательские).
 * Повторно навешивает обработчики клика и подсвечивает текущий фон.
 */
async function refreshBackgroundGrid() {
  const gridEl = document.querySelector(
    "#" + TAB_CONTENT_ID + " #cuckoo-bg-grid",
  );
  if (!gridEl) return;
  // Перечитываем пользовательские фоны с диска
  await background.loadCustomBackgrounds();
  gridEl.innerHTML = background
    .getAllBackgrounds()
    .map(backgroundItemHTML)
    .join("");
  bindBackgroundGrid();
  await refreshBackgroundSelection();
}

/**
 * Кнопки «Открыть папку фонов» и «Обновить».
 */
function bindBackgroundFolderButtons() {
  const openBtn = document.querySelector(
    "#" + TAB_CONTENT_ID + " #cuckoo-bg-open-folder",
  );
  if (openBtn) {
    openBtn.addEventListener("click", async () => {
      try {
        await window.electronAPI.openCustomBackgroundsFolder();
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось открыть папку фонов:",
          err.message,
        );
      }
    });
  }
  const refreshBtn = document.querySelector(
    "#" + TAB_CONTENT_ID + " #cuckoo-bg-refresh",
  );
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshBackgroundGrid();
    });
  }
}

/**
 * Собрать HTML одного превью шрифта. Название шрифта набрано им же.
 */
function fontItemHTML(f) {
  const family = f.system
    ? ""
    : (f.family || f.label || "") + ", -apple-system, sans-serif";
  const nameStyle = family ? ' style="font-family: ' + family + ';"' : "";
  return (
    '<div class="cuckoo-bg-item cuckoo-font-item" data-font-id="' +
    escapeHtml(f.id) +
    '" title="' +
    escapeHtml(f.label) +
    '">' +
    '  <div class="cuckoo-font-preview"' +
    nameStyle +
    ">Aa Бб 123</div>" +
    '  <div class="cuckoo-bg-label">' +
    escapeHtml(f.label) +
    "</div>" +
    "</div>"
  );
}

/**
 * Перерисовать сетку шрифтов (встроенные + пользовательские).
 */
async function refreshFontGrid() {
  const gridEl = document.querySelector(
    "#" + TAB_CONTENT_ID + " #cuckoo-font-grid",
  );
  if (!gridEl) return;
  await fonts.loadCustomFonts();
  gridEl.innerHTML = fonts.getAllFonts().map(fontItemHTML).join("");
  bindFontGrid();
  await refreshFontSelection();
}

/**
 * Обработчики клика по превью шрифта: сохраняем и применяем.
 */
function bindFontGrid() {
  const grid = document.querySelectorAll(
    "#" + TAB_CONTENT_ID + " .cuckoo-font-item",
  );
  grid.forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-font-id");
      if (!id) return;
      fonts.apply(id);
      document
        .querySelectorAll("#" + TAB_CONTENT_ID + " .cuckoo-font-item")
        .forEach((x) => x.classList.remove("cuckoo-bg-selected"));
      el.classList.add("cuckoo-bg-selected");
      try {
        const res = await window.electronAPI.setCuckooSetting("font", id);
        if (!res || !res.success) {
          console.error(
            "[Cookie Code] Не удалось сохранить шрифт:",
            res && res.error,
          );
        }
      } catch (err) {
        console.error("[Cookie Code] Ошибка сохранения шрифта:", err.message);
      }
    });
  });
}

/**
 * Кнопки «Открыть папку шрифтов» и «Обновить».
 */
function bindFontFolderButtons() {
  const openBtn = document.querySelector(
    "#" + TAB_CONTENT_ID + " #cuckoo-font-open-folder",
  );
  if (openBtn) {
    openBtn.addEventListener("click", async () => {
      try {
        await window.electronAPI.openCustomFontsFolder();
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось открыть папку шрифтов:",
          err.message,
        );
      }
    });
  }
  const refreshBtn = document.querySelector(
    "#" + TAB_CONTENT_ID + " #cuckoo-font-refresh",
  );
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshFontGrid();
    });
  }
}

/**
 * Подсветить выбранный шрифт.
 */
async function refreshFontSelection() {
  let currentId = fonts.DEFAULT_ID;
  try {
    const settings = await window.electronAPI.getCuckooSettings();
    currentId = (settings && settings.font) || fonts.DEFAULT_ID;
  } catch (_) {}
  document
    .querySelectorAll("#" + TAB_CONTENT_ID + " .cuckoo-font-item")
    .forEach((el) => {
      if (el.getAttribute("data-font-id") === currentId) {
        el.classList.add("cuckoo-bg-selected");
      } else {
        el.classList.remove("cuckoo-bg-selected");
      }
    });
}

/**
 * Секция «Статистика»: тумблеры сбора/debug и кнопка сброса.
 */
function bindStatsSection() {
  const enabledChk = document.getElementById("cuckoo-stats-enabled");
  const debugChk = document.getElementById("cuckoo-stats-debug");
  const showChk = document.getElementById("cuckoo-stats-show");
  const resetBtn = document.getElementById("cuckoo-stats-reset");

  if (enabledChk) {
    enabledChk.addEventListener("change", async () => {
      const on = enabledChk.checked;
      state.statsEnabled = on;
      try {
        await window.electronAPI.setCuckooSetting("statsEnabled", on);
      } catch (err) {
        console.error("[Cookie Code] statsEnabled save error:", err.message);
      }
    });
  }

  if (debugChk) {
    debugChk.addEventListener("change", async () => {
      const on = debugChk.checked;
      state.statsDebugMode = on;
      try {
        await window.electronAPI.setCuckooSetting("statsDebugMode", on);
        const dash = require("./stats-dashboard");
        if (dash && typeof dash.setDebugMode === "function")
          dash.setDebugMode(on);
      } catch (err) {
        console.error("[Cookie Code] statsDebugMode save error:", err.message);
      }
    });
  }

  if (showChk) {
    showChk.addEventListener("change", async () => {
      const on = showChk.checked;
      state.statsDashboardEnabled = on;
      try {
        await window.electronAPI.setCuckooSetting("statsDashboardEnabled", on);
        const dash = require("./stats-dashboard");
        if (dash && typeof dash.setEnabled === "function") dash.setEnabled(on);
      } catch (err) {
        console.error(
          "[Cookie Code] statsDashboardEnabled save error:",
          err.message,
        );
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const ui = require("../overlay/ui");
      const ok =
        typeof ui.showConfirmDialog === "function"
          ? await ui.showConfirmDialog(t("settings.stats.resetConfirm"), {
              okText: t("settings.stats.reset"),
              showCancel: true,
              cancelText: t("contextPort.cancel"),
            })
          : true;
      if (!ok) return;
      try {
        await window.electronAPI.statsReset();
        if (typeof ui.showToast === "function")
          ui.showToast(t("settings.stats.resetDone"), 2500);
      } catch (err) {
        console.error("[Cookie Code] stats reset error:", err.message);
      }
    });
  }

  // Начальные состояния.
  window.electronAPI
    .getCuckooSettings()
    .then((s) => {
      if (enabledChk) enabledChk.checked = !s || s.statsEnabled !== false;
      if (debugChk) debugChk.checked = !!(s && s.statsDebugMode === true);
      if (showChk) showChk.checked = !s || s.statsDashboardEnabled !== false;
    })
    .catch(() => {});
}

/**
 * Инициализация секции «Шрифт».
 */
function bindFontsSection() {
  bindFontGrid();
  bindFontFolderButtons();
  refreshFontSelection();
  bindFontWeightSlider();
  // Подтягиваем пользовательские шрифты с диска и перерисовываем сетку.
  refreshFontGrid();
}

/**
 * Подвкладки (категории) настроек: показываем только активную категорию.
 */
function bindSettingsTabs() {
  const bar = document.getElementById("cuckoo-settings-tabs");
  if (!bar) return;
  const buttons = bar.querySelectorAll(".ck-settings-tab");
  const pages = document.querySelectorAll("#" + TAB_CONTENT_ID + " [data-cat]");
  const activate = (tab) => {
    buttons.forEach((b) => {
      b.classList.toggle("ck-tab-active", b.getAttribute("data-tab") === tab);
    });
    pages.forEach((p) => {
      p.classList.toggle("ck-cat-active", p.getAttribute("data-cat") === tab);
    });
  };
  buttons.forEach((b) => {
    b.addEventListener("click", () => activate(b.getAttribute("data-tab")));
  });
  // Первая вкладка активна по умолчанию.
  const first = buttons[0];
  activate(first ? first.getAttribute("data-tab") : "theme");

  // Скрываем панель при скролле вниз, показываем при скролле вверх.
  const content = document.getElementById(TAB_CONTENT_ID);
  if (content) {
    let lastY = content.scrollTop;
    content.addEventListener(
      "scroll",
      () => {
        const y = content.scrollTop;
        const delta = y - lastY;
        if (Math.abs(delta) < 4) return;
        if (delta > 0 && y > 40) {
          bar.classList.add("ck-tabs-hidden");
        } else {
          bar.classList.remove("ck-tabs-hidden");
        }
        lastY = y;
      },
      { passive: true },
    );
  }
}

/**
 * Слайдер жирности шрифта: на input — мгновенно применяем,
 * на change — сохраняем в settings.json.
 */
function bindFontWeightSlider() {
  const input = document.getElementById("cuckoo-font-weight");
  const label = document.getElementById("cuckoo-font-weight-val");
  if (!input) return;
  const updateLabel = (v) => {
    if (label) label.textContent = String(v);
  };
  input.addEventListener("input", () => {
    const v = Number(input.value);
    updateLabel(v);
    fonts.applyWeight(v);
  });
  input.addEventListener("change", async () => {
    const v = Number(input.value);
    try {
      const res = await window.electronAPI.setCuckooSetting("fontWeight", v);
      if (!res || !res.success) {
        console.error(
          "[Cookie Code] Не удалось сохранить жирность:",
          res && res.error,
        );
      }
    } catch (err) {
      console.error("[Cookie Code] Ошибка сохранения жирности:", err.message);
    }
  });
}

/**
 * Выставить слайдер жирности по сохранённой настройке.
 */
async function refreshFontWeight() {
  try {
    const settings = await window.electronAPI.getCuckooSettings();
    const w =
      settings && settings.fontWeight != null ? settings.fontWeight : 400;
    const input = document.getElementById("cuckoo-font-weight");
    const label = document.getElementById("cuckoo-font-weight-val");
    if (input) input.value = String(w);
    if (label) label.textContent = String(w);
  } catch (_) {}
}

/**
 * Обработчики слайдеров размытия.
 * На input — мгновенно применяем и обновляем подпись.
 * На change — сохраняем в settings.json.
 */
function collectCurrentBlurSettings() {
  return {
    backgroundBlur:
      Number((document.getElementById("cuckoo-blur-bg") || {}).value) || 0,
    headerBlur: Number(
      (document.getElementById("cuckoo-blur-header") || {}).value,
    ),
    sidebarBlur: Number(
      (document.getElementById("cuckoo-blur-sidebar") || {}).value,
    ),
    headerOpacity: Number(
      (document.getElementById("cuckoo-op-header") || {}).value,
    ),
    sidebarOpacity: Number(
      (document.getElementById("cuckoo-op-sidebar") || {}).value,
    ),
    toolBlockOpacity: Number(
      (document.getElementById("cuckoo-op-toolblock") || {}).value,
    ),
    toolBlockBlur: Number(
      (document.getElementById("cuckoo-blur-toolblock") || {}).value,
    ),
    overlayOpacity: Number(
      (document.getElementById("cuckoo-op-overlay") || {}).value,
    ),
    overlayBlur: Number(
      (document.getElementById("cuckoo-blur-overlay") || {}).value,
    ),
    overlayWidth: Number(
      (document.getElementById("cuckoo-width-overlay") || {}).value,
    ),
    overlayBgColor:
      (document.getElementById("cuckoo-color-overlay-bg") || {}).value ||
      "#111322",
    overlayPrimaryColor:
      (document.getElementById("cuckoo-color-overlay-btn") || {}).value ||
      "#8b93ff",
    overlayBtnRadius: Number(
      (document.getElementById("cuckoo-radius-overlay-btn") || {}).value,
    ),
    inputGlassBlur: Number(
      (document.getElementById("cuckoo-blur-input") || {}).value,
    ),
    inputGlassOpacity: Number(
      (document.getElementById("cuckoo-op-input") || {}).value,
    ),
  };
}

function bindBlurSliders() {
  const sliders = [
    {
      inputId: "cuckoo-blur-bg",
      valId: "cuckoo-blur-bg-val",
      key: "backgroundBlur",
      unit: " px",
    },
    {
      inputId: "cuckoo-blur-header",
      valId: "cuckoo-blur-header-val",
      key: "headerBlur",
      unit: " px",
    },
    {
      inputId: "cuckoo-blur-sidebar",
      valId: "cuckoo-blur-sidebar-val",
      key: "sidebarBlur",
      unit: " px",
    },
    {
      inputId: "cuckoo-op-header",
      valId: "cuckoo-op-header-val",
      key: "headerOpacity",
      unit: " %",
    },
    {
      inputId: "cuckoo-op-sidebar",
      valId: "cuckoo-op-sidebar-val",
      key: "sidebarOpacity",
      unit: " %",
    },
    {
      inputId: "cuckoo-op-toolblock",
      valId: "cuckoo-op-toolblock-val",
      key: "toolBlockOpacity",
      unit: " %",
    },
    {
      inputId: "cuckoo-blur-toolblock",
      valId: "cuckoo-blur-toolblock-val",
      key: "toolBlockBlur",
      unit: " px",
    },
    // Стеклянное поле ввода
    {
      inputId: "cuckoo-blur-input",
      valId: "cuckoo-blur-input-val",
      key: "inputGlassBlur",
      unit: " px",
    },
    {
      inputId: "cuckoo-op-input",
      valId: "cuckoo-op-input-val",
      key: "inputGlassOpacity",
      unit: " %",
    },
    // Панель Cookie Code
    {
      inputId: "cuckoo-op-overlay",
      valId: "cuckoo-op-overlay-val",
      key: "overlayOpacity",
      unit: " %",
    },
    {
      inputId: "cuckoo-blur-overlay",
      valId: "cuckoo-blur-overlay-val",
      key: "overlayBlur",
      unit: " px",
    },
    {
      inputId: "cuckoo-width-overlay",
      valId: "cuckoo-width-overlay-val",
      key: "overlayWidth",
      unit: " px",
    },
    {
      inputId: "cuckoo-radius-overlay-btn",
      valId: "cuckoo-radius-overlay-btn-val",
      key: "overlayBtnRadius",
      unit: " px",
    },
  ];

  sliders.forEach(({ inputId, valId, key, unit }) => {
    const input = document.getElementById(inputId);
    const label = document.getElementById(valId);
    if (!input || !label) return;
    const updateLabel = (v) => {
      label.textContent = v + unit;
    };

    input.addEventListener("input", () => {
      const v = Number(input.value);
      updateLabel(v);
      background.applyBlur(collectCurrentBlurSettings());
    });

    input.addEventListener("change", async () => {
      const v = Number(input.value);
      try {
        const res = await window.electronAPI.setCuckooSetting(key, v);
        if (!res || !res.success) {
          console.error(
            "[Cookie Code] Не удалось сохранить настройку",
            key,
            res && res.error,
          );
        }
      } catch (err) {
        console.error(
          "[Cookie Code] Ошибка сохранения настройки",
          key,
          err.message,
        );
      }
    });
  });

  // Чекбокс «Стекло поля ввода включено»
  const inputGlassCb = document.getElementById("cuckoo-input-glass-enabled");
  if (inputGlassCb) {
    inputGlassCb.addEventListener("change", async () => {
      const enabled = inputGlassCb.checked;
      background.applyInputGlassEnabled(enabled);
      try {
        await window.electronAPI.setCuckooSetting("inputGlassEnabled", enabled);
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось сохранить inputGlassEnabled:",
          err.message,
        );
      }
    });
  }

  // Цвет фона панели
  const bgInput = document.getElementById("cuckoo-color-overlay-bg");
  const bgLabel = document.getElementById("cuckoo-color-overlay-bg-val");
  if (bgInput) {
    bgInput.addEventListener("input", () => {
      if (bgLabel) bgLabel.textContent = bgInput.value;
      background.applyBlur(collectCurrentBlurSettings());
    });
    bgInput.addEventListener("change", async () => {
      try {
        await window.electronAPI.setCuckooSetting(
          "overlayBgColor",
          bgInput.value,
        );
      } catch (err) {
        console.error(
          "[Cookie Code] Ошибка сохранения overlayBgColor:",
          err.message,
        );
      }
    });
  }

  // Цвет кнопок оверлея
  const btnInput = document.getElementById("cuckoo-color-overlay-btn");
  const btnLabel = document.getElementById("cuckoo-color-overlay-btn-val");
  if (btnInput) {
    btnInput.addEventListener("input", () => {
      if (btnLabel) btnLabel.textContent = btnInput.value;
      background.applyBlur(collectCurrentBlurSettings());
    });
    btnInput.addEventListener("change", async () => {
      try {
        await window.electronAPI.setCuckooSetting(
          "overlayPrimaryColor",
          btnInput.value,
        );
      } catch (err) {
        console.error(
          "[Cookie Code] Ошибка сохранения overlayPrimaryColor:",
          err.message,
        );
      }
    });
  }
}

/**
 * Кнопка «Сбросить настройки» — возвращает фон и все блюры к дефолтам.
 */
/**
 * Загрузить сохранённые настройки Telegram в поля вкладки.
 */
async function refreshTelegramSettings() {
  try {
    const s = await window.electronAPI.getCuckooSettings();
    const tokenEl = document.getElementById("cuckoo-tg-token");
    const chatEl = document.getElementById("cuckoo-tg-chatid");
    const enabledEl = document.getElementById("cuckoo-tg-enabled");
    const notifyEl = document.getElementById("cuckoo-tg-notify");
    const feedEl = document.getElementById("cuckoo-tg-feed");
    const allowedUserEl = document.getElementById("cuckoo-tg-alloweduser");
    const notifyIgnoreEl = document.getElementById("cuckoo-tg-notify-ignore");
    if (tokenEl) tokenEl.value = s.telegramBotToken || "";
    if (chatEl) chatEl.value = s.telegramChatId || "";
    if (allowedUserEl) allowedUserEl.value = s.telegramAllowedUserId || "";
    if (notifyIgnoreEl)
      notifyIgnoreEl.value = Array.isArray(s.telegramToolNotifyIgnore)
        ? s.telegramToolNotifyIgnore.join("\n")
        : "";
    if (enabledEl) enabledEl.checked = !!s.telegramEnabled;
    if (notifyEl) notifyEl.checked = !!s.telegramNotifyTools;
    if (feedEl) feedEl.checked = !!s.telegramChatFeed;
  } catch (err) {
    console.error(
      "[Cookie Code] Не удалось загрузить настройки Telegram:",
      err.message,
    );
  }
}

/**
 * Обработчики кнопок Telegram: сохранить / проверить токен / тест.
 */
function bindTelegramSettings() {
  const saveBtn = document.getElementById("cuckoo-tg-save");
  const pingBtn = document.getElementById("cuckoo-tg-ping");
  const testBtn = document.getElementById("cuckoo-tg-test");

  const readValues = () => ({
    token: (document.getElementById("cuckoo-tg-token") || {}).value || "",
    chatId: (document.getElementById("cuckoo-tg-chatid") || {}).value || "",
    allowedUserId:
      (document.getElementById("cuckoo-tg-alloweduser") || {}).value || "",
    notifyIgnore:
      (document.getElementById("cuckoo-tg-notify-ignore") || {}).value || "",
    enabled: !!(document.getElementById("cuckoo-tg-enabled") || {}).checked,
    notify: !!(document.getElementById("cuckoo-tg-notify") || {}).checked,
    feed: !!(document.getElementById("cuckoo-tg-feed") || {}).checked,
  });

  const save = async () => {
    const v = readValues();
    try {
      await window.electronAPI.setCuckooSetting(
        "telegramBotToken",
        v.token.trim(),
      );
      await window.electronAPI.setCuckooSetting(
        "telegramChatId",
        v.chatId.trim(),
      );
      await window.electronAPI.setCuckooSetting(
        "telegramAllowedUserId",
        v.allowedUserId.trim(),
      );
      await window.electronAPI.setCuckooSetting(
        "telegramToolNotifyIgnore",
        v.notifyIgnore
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean),
      );
      await window.electronAPI.setCuckooSetting("telegramEnabled", v.enabled);
      await window.electronAPI.setCuckooSetting(
        "telegramNotifyTools",
        v.notify,
      );
      await window.electronAPI.setCuckooSetting("telegramChatFeed", v.feed);
      const res = await window.electronAPI.telegramApply();
      return res && res.success;
    } catch (err) {
      console.error(
        "[Cookie Code] Не удалось сохранить Telegram:",
        err.message,
      );
      return false;
    }
  };

  saveBtn?.addEventListener("click", async () => {
    saveBtn.textContent = "...";
    const ok = await save();
    saveBtn.textContent = ok
      ? "✅ " + t("tg.btn.save")
      : "❌ " + t("tg.btn.save");
    setTimeout(() => {
      saveBtn.textContent = t("tg.btn.save");
    }, 1800);
  });

  pingBtn?.addEventListener("click", async () => {
    await save();
    pingBtn.textContent = "...";
    const res = await window.electronAPI.telegramPing();
    pingBtn.textContent =
      res && res.success
        ? "✅ @" + (res.username || "bot")
        : "❌ " + ((res && res.error) || "error");
    setTimeout(() => {
      pingBtn.textContent = t("tg.btn.ping");
    }, 2500);
  });

  testBtn?.addEventListener("click", async () => {
    await save();
    testBtn.textContent = "...";
    const res = await window.electronAPI.telegramTest();
    testBtn.textContent =
      res && res.success
        ? "✅ " + t("tg.btn.test")
        : "❌ " + ((res && res.error) || "error");
    setTimeout(() => {
      testBtn.textContent = t("tg.btn.test");
    }, 2500);
  });
}

function bindResetButton() {
  const btn = document.getElementById("cuckoo-btn-reset");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = t("settings.btn.resetting");
    try {
      await background.resetAll();
      // Обновляем UI: слайдеры + подсветка фона
      await refreshBlurValues();
      await refreshBackgroundSelection();
    } finally {
      btn.disabled = false;
      btn.textContent = t("settings.btn.reset");
    }
  });

  // Кнопка «Очистить мета-данные» — чистит localStorage
  const clearBtn = document.getElementById("cuckoo-btn-clear-storage");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearBtn.disabled = true;
      const originalText = clearBtn.textContent;
      clearBtn.textContent = t("settings.btn.clearing");
      try {
        background.clearLocalStorage();
      } finally {
        setTimeout(() => {
          clearBtn.disabled = false;
          clearBtn.textContent = originalText;
        }, 300);
      }
    });
  }

  // Кнопка «Диагностика интеграции» — прогоняет проверки провайдера и показывает отчёт.
  const diagBtn = document.getElementById("cuckoo-btn-diagnostics");
  if (diagBtn) {
    diagBtn.addEventListener("click", async () => {
      diagBtn.disabled = true;
      const originalText = diagBtn.textContent;
      diagBtn.textContent = t("settings.diagnostics.running");
      try {
        const { runDiagnostics, formatReportText } = require("./diagnostics");
        const report = await runDiagnostics();
        const text = formatReportText(report);
        const modal = document.getElementById("cuckoo-diag-modal");
        const body = document.getElementById("cuckoo-diag-body");
        if (modal && body) {
          body.textContent = text;
          modal.style.display = "flex";
          // Копирование
          const copyBtn = document.getElementById("cuckoo-diag-copy");
          const closeBtn = document.getElementById("cuckoo-diag-close");
          const close = () => {
            modal.style.display = "none";
          };
          if (closeBtn) closeBtn.onclick = close;
          if (copyBtn)
            copyBtn.onclick = async () => {
              try {
                await navigator.clipboard.writeText(text);
                copyBtn.textContent = t("settings.diagnostics.copied");
                setTimeout(() => {
                  copyBtn.textContent = t("settings.diagnostics.copy");
                }, 1500);
              } catch (_) {
                // Fallback — выделяем текст, чтобы пользователь скопировал вручную
                if (body) {
                  const range = document.createRange();
                  range.selectNodeContents(body);
                  const sel = window.getSelection();
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              }
            };
        }
      } catch (err) {
        console.error("[Cookie Code] diagnostics error:", err && err.message);
      } finally {
        diagBtn.disabled = false;
        diagBtn.textContent = originalText;
      }
    });
  }

  // Кнопка «Открыть файл настроек» — открывает cuckoo-settings.json системным редактором.
  const openCfgBtn = document.getElementById("cuckoo-btn-open-config");
  if (openCfgBtn) {
    openCfgBtn.addEventListener("click", async () => {
      openCfgBtn.disabled = true;
      const originalText = openCfgBtn.textContent;
      try {
        const res = await window.electronAPI.openCuckooSettingsFile();
        openCfgBtn.textContent =
          res && res.success
            ? t("settings.btn.openConfig.opened")
            : t("settings.btn.openConfig.error");
      } catch (err) {
        console.error(
          "[Cookie Code] openCuckooSettingsFile error:",
          err.message,
        );
        openCfgBtn.textContent = t("settings.btn.openConfig.error");
      } finally {
        setTimeout(() => {
          openCfgBtn.disabled = false;
          openCfgBtn.textContent = originalText;
        }, 1200);
      }
    });
  }
}

/**
 * Чекбокс RGB-переливания ника.
 */
function bindRgbCheckbox() {
  const cb = document.getElementById("cuckoo-rgb-username");
  if (!cb) return;
  cb.addEventListener("change", async () => {
    const enabled = cb.checked;
    background.applyRgbUsername(enabled);
    try {
      const res = await window.electronAPI.setCuckooSetting(
        "rgbUsername",
        enabled,
      );
      if (!res || !res.success) {
        console.error(
          "[Cookie Code] Не удалось сохранить rgbUsername:",
          res && res.error,
        );
      }
    } catch (err) {
      console.error(
        "[Cookie Code] Ошибка сохранения rgbUsername:",
        err.message,
      );
    }
  });
}

function bindCustomizationToggle() {
  const btn = document.getElementById("cuckoo-customization-toggle");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = t("settings.customization.reloading");
    try {
      const settings = await window.electronAPI.getCuckooSettings();
      const enabled = !settings || settings.customizationEnabled !== false;
      await window.electronAPI.setCuckooSetting(
        "customizationEnabled",
        !enabled,
      );
      location.reload();
    } catch (err) {
      console.error(
        "[Cookie Code] Ошибка переключения кастомизации:",
        err.message,
      );
      btn.disabled = false;
      refreshCustomizationToggle();
    }
  });
}

async function refreshCustomizationToggle() {
  const btn = document.getElementById("cuckoo-customization-toggle");
  if (!btn) return;
  try {
    const settings = await window.electronAPI.getCuckooSettings();
    const enabled = !settings || settings.customizationEnabled !== false;
    btn.textContent = enabled
      ? t("settings.customization.disable")
      : t("settings.customization.enable");
    btn.style.borderColor = enabled
      ? "rgba(255,107,122,0.5)"
      : "rgba(93,214,157,0.55)";
    btn.style.background = enabled
      ? "rgba(255,107,122,0.12)"
      : "rgba(93,214,157,0.12)";
    btn.style.color = enabled ? "#ffb0b8" : "#a7f0c9";
  } catch (_) {
    btn.textContent = t("settings.customization.disable");
  }
}

/**
 * Кнопки выбора языка RU/EN.
 * При клике сохраняем выбор в settings.json и перезагружаем страницу,
 * чтобы тексты в OVERLAY_HTML пересобрались с новым языком.
 */
function bindLanguageButtons() {
  const buttons = document.querySelectorAll(".cuckoo-lang-btn");
  if (!buttons.length) return;

  // Подсветить активный
  const current = window.__cuckooI18nLang || "ru";
  buttons.forEach((btn) => {
    if (btn.getAttribute("data-lang") === current) {
      btn.style.background = "rgba(139,147,255,0.35)";
      btn.style.color = "#fff";
      btn.style.borderColor = "rgba(139,147,255,0.8)";
    } else {
      btn.style.background = "rgba(139,147,255,0.12)";
      btn.style.color = "#cfd3ff";
      btn.style.borderColor = "rgba(139,147,255,0.4)";
    }
  });

  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const lang = btn.getAttribute("data-lang");
      if (!lang || lang === current) return;
      try {
        await window.electronAPI.setCuckooSetting("language", lang);
      } catch (err) {
        console.error("[Cookie Code] Не удалось сохранить язык:", err.message);
      }
      // Перезагружаем страницу — preload пересоберёт HTML с новым языком
      location.reload();
    });
  });
}

/**
 * Textarea со списком опасных regex-паттернов + кнопка «Сохранить».
 */
async function bindDangerousPatterns() {
  const ta = document.getElementById("cuckoo-dangerous-patterns");
  const btn = document.getElementById("cuckoo-btn-save-dangerous");
  if (!ta || !btn) return;

  // Загружаем текущий список
  try {
    const s = await window.electronAPI.getCuckooSettings();
    const list = Array.isArray(s && s.dangerousPatterns)
      ? s.dangerousPatterns
      : [];
    ta.value = list.join("\n");
  } catch (_) {}

  btn.addEventListener("click", async () => {
    const raw = ta.value || "";
    // Разбиваем по строкам, убираем пустые и пробелы
    const patterns = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = t("settings.dangerous.saving");
    try {
      const res = await window.electronAPI.setCuckooSetting(
        "dangerousPatterns",
        patterns,
      );
      if (res && res.success) {
        btn.textContent = t("settings.dangerous.saved");
        setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
        }, 1200);
      } else {
        btn.textContent = t("settings.dangerous.error");
        setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
        }, 1500);
      }
    } catch (err) {
      console.error(
        "[Cookie Code] Не удалось сохранить опасные команды:",
        err.message,
      );
      btn.textContent = t("settings.dangerous.error");
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1500);
    }
  });
}

/**
 * Секция «Агент и приватность»:
 *  - режим подтверждения tool-вызовов (off / risky / all);
 *  - скрытие служебных сообщений в чате.
 * Оба параметра применяются мгновенно (через общий state) и сохраняются
 * в cuckoo-settings.json — перезагрузка страницы не требуется.
 */
function bindAgentSettings() {
  const buttons = document.querySelectorAll(".cuckoo-approval-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.getAttribute("data-mode");
      if (!mode) return;
      // Мгновенно применяем в рантайме
      state.toolApprovalMode = mode;
      // Подсветка активного режима
      applyApprovalActiveStyle(mode);
      // Сохраняем в settings.json
      try {
        await window.electronAPI.setCuckooSetting("toolApprovalMode", mode);
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось сохранить toolApprovalMode:",
          err.message,
        );
      }
    });
  });

  // ===== Таймаут JS-скриптов =====
  const timeoutInput = document.getElementById("cuckoo-js-timeout");
  const timeoutSave = document.getElementById("cuckoo-js-timeout-save");
  if (timeoutInput && timeoutSave) {
    const trySave = async () => {
      const raw = Number(timeoutInput.value);
      if (!Number.isFinite(raw) || raw < 10 || raw > 1000) {
        window.electronAPI.showBannerNotification(
          t("settings.jsTimeout.invalid"),
          { duration: 4000 },
        );
        return;
      }
      const sec = Math.round(raw);
      timeoutInput.value = sec;
      try {
        await window.electronAPI.setCuckooSetting("jsTimeoutSec", sec);
        window.electronAPI.showBannerNotification(
          t("settings.jsTimeout.saved").replace("{sec}", String(sec)),
          { duration: 3500 },
        );
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось сохранить jsTimeoutSec:",
          err.message,
        );
      }
    };
    timeoutSave.addEventListener("click", trySave);
    timeoutInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        trySave();
      }
    });
  }

  const cb = document.getElementById("cuckoo-hide-system-messages");
  if (cb) {
    cb.addEventListener("change", async () => {
      const enabled = cb.checked;
      // Мгновенно применяем: stealth-модуль читает state при каждом проходе
      state.hideSystemMessages = enabled;
      try {
        await window.electronAPI.setCuckooSetting(
          "hideSystemMessages",
          enabled,
        );
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось сохранить hideSystemMessages:",
          err.message,
        );
      }
    });
  }

  const chipCb = document.getElementById("cuckoo-file-chip-enabled");
  if (chipCb) {
    chipCb.addEventListener("change", async () => {
      const enabled = chipCb.checked;
      // Мгновенно применяем в рантайме: модуль file-chip снимет/применит чипы.
      state.fileChipEnabled = enabled;
      try {
        const fileChip = require("./file-chip");
        fileChip.setEnabled(enabled);
      } catch (err) {
        console.error("[Cookie Code] fileChip.setEnabled error:", err.message);
      }
      try {
        await window.electronAPI.setCuckooSetting("fileChipEnabled", enabled);
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось сохранить fileChipEnabled:",
          err.message,
        );
      }
    });
  }

  const producedCb = document.getElementById("cuckoo-show-produced-enabled");
  if (producedCb) {
    producedCb.addEventListener("change", async () => {
      const enabled = producedCb.checked;
      state.showProducedFiles = enabled;
      try {
        const responseMeta = require("./response-meta");
        if (typeof responseMeta.setEnabled === "function")
          responseMeta.setEnabled(enabled);
      } catch (err) {
        console.error(
          "[Cookie Code] responseMeta.setEnabled error:",
          err.message,
        );
      }
      try {
        await window.electronAPI.setCuckooSetting("showProducedFiles", enabled);
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось сохранить showProducedFiles:",
          err.message,
        );
      }
    });
  }

  const fmtCb = document.getElementById("cuckoo-formatters-enabled");
  if (fmtCb) {
    fmtCb.addEventListener("change", async () => {
      const enabled = fmtCb.checked;
      // Применяется при следующем write/edit (читается из settings.json на главном процессе).
      try {
        await window.electronAPI.setCuckooSetting("formattersEnabled", enabled);
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось сохранить formattersEnabled:",
          err.message,
        );
      }
    });
  }

  const convTokensCb = document.getElementById("cuckoo-show-conv-tokens");
  if (convTokensCb) {
    convTokensCb.addEventListener("change", async () => {
      const enabled = convTokensCb.checked;
      state.showConvTokens = enabled;
      try {
        applyConvTokensVisibility(enabled);
      } catch (_) {}
      try {
        await window.electronAPI.setCuckooSetting("showConvTokens", enabled);
      } catch (err) {
        console.error(
          "[Cookie Code] Не удалось сохранить showConvTokens:",
          err.message,
        );
      }
    });
  }
}

/**
 * Показать/скрыть блок «Токены диалога» в оверлее.
 * @param {boolean} on
 */
function applyConvTokensVisibility(on) {
  const section = document.querySelector(".cuckoo-token-section");
  if (!section) return;
  section.style.display = on ? "" : "none";
  // Скрываем и соседний разделитель перед блоком, если он есть.
  const prev = section.previousElementSibling;
  if (prev && prev.classList && prev.classList.contains("cuckoo-divider")) {
    prev.style.display = on ? "" : "none";
  }
}

/**
 * Подсветить активный режим подтверждения (как кнопки языка RU/EN).
 */
function applyApprovalActiveStyle(mode) {
  const buttons = document.querySelectorAll(".cuckoo-approval-btn");
  buttons.forEach((btn) => {
    if (btn.getAttribute("data-mode") === mode) {
      btn.style.background = "rgba(139,147,255,0.35)";
      btn.style.color = "#fff";
      btn.style.borderColor = "rgba(139,147,255,0.8)";
    } else {
      btn.style.background = "rgba(139,147,255,0.12)";
      btn.style.color = "#cfd3ff";
      btn.style.borderColor = "rgba(139,147,255,0.4)";
    }
  });
}

/**
 * Загрузить сохранённые значения секции «Агент и приватность».
 */
async function refreshAgentSettings() {
  try {
    const s = await window.electronAPI.getCuckooSettings();
    const mode = (s && s.toolApprovalMode) || "off";
    state.toolApprovalMode = mode;
    applyApprovalActiveStyle(mode);
    const cb = document.getElementById("cuckoo-hide-system-messages");
    if (cb) {
      cb.checked = Boolean(s && s.hideSystemMessages === true);
      state.hideSystemMessages = cb.checked;
    }
    const chipCb = document.getElementById("cuckoo-file-chip-enabled");
    if (chipCb) {
      chipCb.checked = !s || s.fileChipEnabled !== false;
      state.fileChipEnabled = chipCb.checked;
    }
    const producedCb = document.getElementById("cuckoo-show-produced-enabled");
    if (producedCb) {
      producedCb.checked = !s || s.showProducedFiles !== false;
      state.showProducedFiles = producedCb.checked;
    }
    const fmtCb = document.getElementById("cuckoo-formatters-enabled");
    if (fmtCb) {
      fmtCb.checked = !s || s.formattersEnabled !== false;
    }
    const convTokensCb = document.getElementById("cuckoo-show-conv-tokens");
    if (convTokensCb) {
      // По умолчанию выключено: показываем только если явно true.
      convTokensCb.checked = Boolean(s && s.showConvTokens === true);
      state.showConvTokens = convTokensCb.checked;
      try {
        applyConvTokensVisibility(convTokensCb.checked);
      } catch (_) {}
    }
    // Таймаут JS-скриптов
    const timeoutInput = document.getElementById("cuckoo-js-timeout");
    if (timeoutInput) {
      const sec = Number(s && s.jsTimeoutSec);
      timeoutInput.value = String(
        Number.isFinite(sec) && sec >= 10 && sec <= 1000 ? Math.round(sec) : 60,
      );
    }
  } catch (_) {}
}

/**
 * Загрузить сохранённое значение RGB-переливания в чекбокс.
 */
async function refreshRgbCheckbox() {
  try {
    const s = await window.electronAPI.getCuckooSettings();
    const cb = document.getElementById("cuckoo-rgb-username");
    if (cb) cb.checked = s && s.rgbUsername !== false;
  } catch (_) {}
}

/**
 * Загрузить сохранённые значения блюра в слайдеры.
 */
async function refreshBlurValues() {
  try {
    const s = await window.electronAPI.getCuckooSettings();
    const setSlider = (id, valId, v, unit = " px") => {
      const input = document.getElementById(id);
      const label = document.getElementById(valId);
      if (!input || !label) return;
      input.value = String(v);
      label.textContent = v + unit;
    };
    setSlider(
      "cuckoo-blur-bg",
      "cuckoo-blur-bg-val",
      Number(s && s.backgroundBlur) || 0,
      " px",
    );
    setSlider(
      "cuckoo-blur-header",
      "cuckoo-blur-header-val",
      Number(s && s.headerBlur != null ? s.headerBlur : 12),
      " px",
    );
    setSlider(
      "cuckoo-blur-sidebar",
      "cuckoo-blur-sidebar-val",
      Number(s && s.sidebarBlur != null ? s.sidebarBlur : 12),
      " px",
    );
    setSlider(
      "cuckoo-op-header",
      "cuckoo-op-header-val",
      Number(s && s.headerOpacity != null ? s.headerOpacity : 45),
      " %",
    );
    setSlider(
      "cuckoo-op-sidebar",
      "cuckoo-op-sidebar-val",
      Number(s && s.sidebarOpacity != null ? s.sidebarOpacity : 45),
      " %",
    );
    setSlider(
      "cuckoo-op-toolblock",
      "cuckoo-op-toolblock-val",
      Number(s && s.toolBlockOpacity != null ? s.toolBlockOpacity : 55),
      " %",
    );
    setSlider(
      "cuckoo-blur-toolblock",
      "cuckoo-blur-toolblock-val",
      Number(s && s.toolBlockBlur != null ? s.toolBlockBlur : 0),
      " px",
    );
    setSlider(
      "cuckoo-blur-input",
      "cuckoo-blur-input-val",
      Number(s && s.inputGlassBlur != null ? s.inputGlassBlur : 12),
      " px",
    );
    setSlider(
      "cuckoo-op-input",
      "cuckoo-op-input-val",
      Number(s && s.inputGlassOpacity != null ? s.inputGlassOpacity : 55),
      " %",
    );
    const igCb = document.getElementById("cuckoo-input-glass-enabled");
    if (igCb) igCb.checked = Boolean(s && s.inputGlassEnabled === true);

    // Панель Cookie Code
    setSlider(
      "cuckoo-op-overlay",
      "cuckoo-op-overlay-val",
      Number(s && s.overlayOpacity != null ? s.overlayOpacity : 72),
      " %",
    );
    setSlider(
      "cuckoo-blur-overlay",
      "cuckoo-blur-overlay-val",
      Number(s && s.overlayBlur != null ? s.overlayBlur : 12),
      " px",
    );
    setSlider(
      "cuckoo-width-overlay",
      "cuckoo-width-overlay-val",
      Number(s && s.overlayWidth != null ? s.overlayWidth : 300),
      " px",
    );
    setSlider(
      "cuckoo-radius-overlay-btn",
      "cuckoo-radius-overlay-btn-val",
      Number(s && s.overlayBtnRadius != null ? s.overlayBtnRadius : 10),
      " px",
    );

    const setColor = (inputId, valId, v) => {
      const input = document.getElementById(inputId);
      const label = document.getElementById(valId);
      if (input) input.value = v;
      if (label) label.textContent = v;
    };
    setColor(
      "cuckoo-color-overlay-bg",
      "cuckoo-color-overlay-bg-val",
      (s && s.overlayBgColor) || "#111322",
    );
    setColor(
      "cuckoo-color-overlay-btn",
      "cuckoo-color-overlay-btn-val",
      (s && s.overlayPrimaryColor) || "#8b93ff",
    );
  } catch (err) {
    console.error(
      "[Cookie Code] Не удалось загрузить значения блюра:",
      err.message,
    );
  }
}

/**
 * Обновить подсветку выбранного фона из settings.json.
 */
async function refreshBackgroundSelection() {
  try {
    const settings = await window.electronAPI.getCuckooSettings();
    const current = (settings && settings.background) || background.DEFAULT_ID;
    document
      .querySelectorAll("#" + TAB_CONTENT_ID + " .cuckoo-bg-item")
      .forEach((el) => {
        if (el.getAttribute("data-bg-id") === current) {
          el.classList.add("cuckoo-bg-selected");
        } else {
          el.classList.remove("cuckoo-bg-selected");
        }
      });
  } catch (err) {
    console.error(
      "[Cookie Code] Не удалось прочитать текущий фон:",
      err.message,
    );
  }
}

/**
 * Деактивировать вкладку Cookie Code — показать родной контент.
 */
function deactivateCuckooTab() {
  const nativeScroll = document.querySelector(
    MODAL_CONTENT_MAIN_SELECTOR +
      " " +
      RIGHT_PANEL_WRAPPER_SELECTOR +
      " " +
      NATIVE_SCROLL_AREA_SELECTOR,
  );
  if (nativeScroll) nativeScroll.style.display = "";

  const ourContent = document.getElementById(TAB_CONTENT_ID);
  if (ourContent) ourContent.remove();

  // Снимаем подсветку с нашей кнопки вкладки
  setTabInactive();
}

// Делегирование клика: ловим клики по вкладкам (наши и родные).
document.addEventListener(
  "click",
  (e) => {
    const target = e.target;
    if (!target || !target.closest) return;

    // Наш таб
    const ourBtn = target.closest("#" + TAB_BUTTON_ID);
    if (ourBtn) {
      e.preventDefault();
      e.stopPropagation();
      activateCuckooTab();
      return;
    }

    // Клик по родному табу — деактивируем наш контент
    const nativeTabContainer = target.closest(CUCKOO_TAB_BUTTON_SELECTOR);
    if (nativeTabContainer) {
      deactivateCuckooTab();
    }
  },
  true, // capture
);

/**
 * Применить/снять фирменный фон активной вкладки Cookie Code.
 * Красим и саму кнопку, и вложенный .ds-button__background (если есть).
 * @param {Element} btn — кнопка вкладки
 * @param {boolean} active — активна ли вкладка
 */
function applyTabActiveStyle(btn, active) {
  if (!btn) return;
  const bg = btn.querySelector(".ds-button__background");
  if (active) {
    btn.style.background = "rgba(139,147,255,0.25)";
    btn.style.color = "#fff";
    if (bg) bg.style.background = "rgba(139,147,255,0.25)";
  } else {
    btn.style.background = "";
    btn.style.color = "";
    if (bg) bg.style.background = "";
  }
}

/**
 * Пометить кнопку вкладки Cookie Code как активную.
 * Идемпотентно; молча выходит, если кнопки нет.
 */
function setTabActive() {
  const btn = document.getElementById(TAB_BUTTON_ID);
  if (!btn) return;
  btn.setAttribute("data-cuckoo-active", "1");
  applyTabActiveStyle(btn, true);
}

/**
 * Снять активную подсветку с кнопки вкладки Cookie Code.
 * Идемпотентно; молча выходит, если кнопки нет.
 */
function setTabInactive() {
  const btn = document.getElementById(TAB_BUTTON_ID);
  if (!btn) return;
  btn.removeAttribute("data-cuckoo-active");
  applyTabActiveStyle(btn, false);
}

/**
 * Вставить кнопку-таб в левую панель, если её ещё нет.
 */
function injectSettingsTab() {
  const container = document.querySelector(CUCKOO_TAB_BUTTON_SELECTOR);
  if (!container) return;
  if (container.querySelector("#" + TAB_BUTTON_ID)) return; // уже вставлено

  const btn = document.createElement("div");
  btn.id = TAB_BUTTON_ID;
  btn.setAttribute("role", "button");
  btn.setAttribute("tabindex", "0");
  btn.className =
    "ds-button ds-button--outlinedNeutral ds-button--borderless ds-button--capsule ds-button--m ds-button--icon-relative-m ds-button--min-width";
  btn.style.cssText =
    "--dsl-button-text-color: var(--dsw-alias-label-primary);" +
    "--dsl-button-padding: 0 10px 0 8px;" +
    "--dsl-button-border-radius: 12px;" +
    "--dsl-button-icon-gap: 8px;" +
    "--dsl-button-color-hover: var(--dsw-alias-interactive-bg-hover);" +
    "--dsl-button-text-color-hover: var(--dsw-alias-label-primary);";

  btn.innerHTML =
    '<div class="ds-button__background"></div>' +
    '<div class="ds-button__icon">' +
    '  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    // Тело печенья с «укусом» справа-сверху.
    '    <path d="M8 1.6a6.4 6.4 0 106.4 6.4c0-.5-.06-1-.17-1.47a1.6 1.6 0 01-2.1-1.9 1.6 1.6 0 01-1.74-1.74A1.6 1.6 0 019.47 1.77 6.5 6.5 0 008 1.6z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' +
    // Крошки.
    '    <circle cx="6" cy="6.2" r="0.85" fill="currentColor"/>' +
    '    <circle cx="8.4" cy="9.4" r="0.85" fill="currentColor"/>' +
    '    <circle cx="5.4" cy="9.9" r="0.7" fill="currentColor"/>' +
    "  </svg>" +
    "</div>" +
    '<span class="ds-button__content">Cookie Code</span>';

  container.appendChild(btn);
}

/**
 * Если модалка настроек закрылась — удалить наш контент из DOM.
 * (Регулярная проверка: если нет .d316d158, значит настройки закрыты.)
 */
function cleanupIfModalClosed() {
  const tabContainer = document.querySelector(CUCKOO_TAB_BUTTON_SELECTOR);
  if (!tabContainer) {
    const ourContent = document.getElementById(TAB_CONTENT_ID);
    if (ourContent) ourContent.remove();
  }
}

function start() {
  injectSettingsTab();
  cleanupIfModalClosed();
  // Оптимизация: если настроек нет 10 циклов подряд — увеличиваем интервал
  // (не дёргаем DOM каждые 800ms, когда модалка закрыта).
  let emptyCycles = 0;
  let timer = null;
  const tick = () => {
    const hasTab = !!document.querySelector(".d316d158");
    if (hasTab) {
      emptyCycles = 0;
      injectSettingsTab();
      cleanupIfModalClosed();
    } else {
      emptyCycles++;
    }
    // Адаптивный интервал: 800ms при открытых настройках, 5s при закрытых.
    const delay = emptyCycles > 10 ? 5000 : 800;
    timer = setTimeout(tick, delay);
  };
  timer = setTimeout(tick, 800);
}

module.exports = {
  start,
  injectSettingsTab,
  activateCuckooTab,
  deactivateCuckooTab,
  setTabActive,
  setTabInactive,
};
