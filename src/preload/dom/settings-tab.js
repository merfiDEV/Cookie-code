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
const background = require('./background');
const state = require('./state');
const { t } = require('../i18n/i18n');

const TAB_BUTTON_ID = 'cuckoo-settings-tab-btn';
const TAB_CONTENT_ID = 'cuckoo-settings-content';

const CUCKOO_TAB_BUTTON_SELECTOR = '.d316d158';
const MODAL_CONTENT_MAIN_SELECTOR = '.ds-modal-content__main';
const RIGHT_PANEL_WRAPPER_SELECTOR = '.f2ff50b5';
const NATIVE_SCROLL_AREA_SELECTOR = '.ds-scroll-area';

/**
 * Открыть вкладку Cookie Code — скрыть родной контент и показать наш.
 */
function activateCuckooTab() {
  const nativeScroll = document.querySelector(
    MODAL_CONTENT_MAIN_SELECTOR + ' ' + RIGHT_PANEL_WRAPPER_SELECTOR + ' ' + NATIVE_SCROLL_AREA_SELECTOR
  );
  const wrapper = document.querySelector(
    MODAL_CONTENT_MAIN_SELECTOR + ' ' + RIGHT_PANEL_WRAPPER_SELECTOR
  );
  if (!wrapper) return;

  // Скрываем родной контент
  if (nativeScroll) nativeScroll.style.display = 'none';

  // Вставляем свой блок, если его ещё нет
  let ourContent = document.getElementById(TAB_CONTENT_ID);
  if (!ourContent) {
    ourContent = document.createElement('div');
    ourContent.id = TAB_CONTENT_ID;
    ourContent.style.cssText =
      'display: flex; flex-direction: column; gap: 16px; ' +
      'width: 100%; height: 100%; overflow-y: auto; ' +
      'padding: 20px 24px; box-sizing: border-box; ' +
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; ' +
      'color: #dde1ff;';

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
  }
  ourContent.style.display = '';

  // Подсвечиваем нашу кнопку вкладки как активную
  setTabActive();
}

/**
 * HTML-содержимое вкладки настроек Cookie Code.
 */
function buildContentHTML() {
  const items = background.getAllBackgrounds().map(backgroundItemHTML).join('');

  return '' +
    '<style>' +
    '  .cuckoo-settings-title { font-size: 20px; font-weight: 700; margin: 0 0 4px; color: #e8eaff; }' +
    '  .cuckoo-settings-subtitle { color: #8a90b8; font-size: 13px; margin: 0 0 16px; }' +
    '  .cuckoo-section-title { font-size: 14px; font-weight: 600; margin: 0 0 10px; color: #c8ccff; ' +
    '                          text-transform: uppercase; letter-spacing: 0.6px; }' +
    '  .cuckoo-bg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }' +
    '  .cuckoo-bg-item { cursor: pointer; border: 2px solid rgba(139,147,255,0.2); border-radius: 10px; ' +
    '                    overflow: hidden; transition: border-color 0.18s, transform 0.15s; background: rgba(0,0,0,0.25); }' +
    '  .cuckoo-bg-item:hover { border-color: rgba(139,147,255,0.65); transform: translateY(-2px); }' +
    '  .cuckoo-bg-item.cuckoo-bg-selected { border-color: #8b93ff; box-shadow: 0 0 0 2px rgba(139,147,255,0.35); }' +
    '  .cuckoo-bg-preview { width: 100%; aspect-ratio: 16/10; background-size: cover; background-position: center; background-color: #0f1220; }' +
    '  .cuckoo-bg-label { font-size: 11px; padding: 5px 8px; text-align: center; color: #cfd3ff; ' +
    '                     white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
    // Слайдеры
    '  .cuckoo-blur-row { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; ' +
    '                     background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); ' +
    '                     border-radius: 10px; margin-bottom: 8px; }' +
    '  .cuckoo-blur-label { font-size: 13px; color: #cfd3ff; display: flex; justify-content: space-between; ' +
    '                       align-items: center; margin-bottom: 2px; }' +
    '  .cuckoo-blur-value { font-size: 12px; color: #8b93ff; font-family: "Consolas", monospace; font-weight: 600; }' +
    '  .cuckoo-blur-slider { width: 100%; height: 4px; -webkit-appearance: none; appearance: none; ' +
    '                        background: rgba(139,147,255,0.25); border-radius: 2px; outline: none; ' +
    '                        cursor: pointer; }' +
    '  .cuckoo-blur-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; ' +
    '                        width: 16px; height: 16px; border-radius: 50%; background: #8b93ff; ' +
    '                        cursor: pointer; transition: transform 0.15s; }' +
    '  .cuckoo-blur-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }' +
    // Утилитарные кнопки настроек (единый вид)
    '  .ck-btn { padding: 9px 14px; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; ' +
    '            border: 1px solid rgba(139,147,255,0.5); background: rgba(139,147,255,0.12); color: #a8afff; ' +
    '            transition: all 0.18s ease; white-space: nowrap; }' +
    '  .ck-btn:hover { background: rgba(139,147,255,0.28); color: #fff; border-color: rgba(139,147,255,0.75); transform: translateY(-1px); }' +
    '  .ck-btn:active { transform: scale(0.98); }' +
    '  .ck-btn-danger { border-color: rgba(255,107,122,0.5); background: rgba(255,107,122,0.15); color: #ff9aa5; }' +
    '  .ck-btn-danger:hover { background: rgba(255,107,122,0.3); color: #fff; border-color: rgba(255,107,122,0.85); }' +
    '  .ck-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }' +
    '  .ck-btn-row > .ck-btn { flex: 1 1 auto; }' +
    '</style>' +
    '<div>' +
    '  <div class="cuckoo-settings-title">Cookie Code</div>' +
    '  <div class="cuckoo-settings-subtitle">' + t('settings.subtitle') + '</div>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">' + t('settings.section.customization') + '</div>' +
    '  <button id="cuckoo-customization-toggle" style="width:100%;padding:10px 14px;border:1px solid rgba(139,147,255,0.5);border-radius:10px;background:rgba(139,147,255,0.12);color:#cfd3ff;font-weight:600;font-size:13px;cursor:pointer;">' +
    '  </button>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">' + t('settings.section.language') + '</div>' +
    '  <div style="display:flex;gap:8px;">' +
    '    <button id="cuckoo-lang-ru" class="cuckoo-lang-btn" data-lang="ru" style="' +
    '      flex:1; padding:9px 14px; border-radius:10px; font-weight:600; font-size:13px; cursor:pointer;' +
    '      border:1px solid rgba(139,147,255,0.4); background:rgba(139,147,255,0.12); color:#cfd3ff;' +
    '      transition: all 0.18s;' +
    '    ">' + t('settings.lang.ru') + '</button>' +
    '    <button id="cuckoo-lang-en" class="cuckoo-lang-btn" data-lang="en" style="' +
    '      flex:1; padding:9px 14px; border-radius:10px; font-weight:600; font-size:13px; cursor:pointer;' +
    '      border:1px solid rgba(139,147,255,0.4); background:rgba(139,147,255,0.12); color:#cfd3ff;' +
    '      transition: all 0.18s;' +
    '    ">' + t('settings.lang.en') + '</button>' +
    '  </div>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">' + t('settings.section.blur') + '</div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.blur.bg') + '</span><span class="cuckoo-blur-value" id="cuckoo-blur-bg-val">0 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-bg" class="cuckoo-blur-slider" min="0" max="30" step="1" value="0">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.blur.header') + '</span><span class="cuckoo-blur-value" id="cuckoo-blur-header-val">12 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-header" class="cuckoo-blur-slider" min="0" max="30" step="1" value="12">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.blur.sidebar') + '</span><span class="cuckoo-blur-value" id="cuckoo-blur-sidebar-val">12 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-sidebar" class="cuckoo-blur-slider" min="0" max="30" step="1" value="12">' +
    '  </div>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">' + t('settings.section.opacity') + '</div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.opacity.header') + '</span><span class="cuckoo-blur-value" id="cuckoo-op-header-val">45 %</span></div>' +
    '    <input type="range" id="cuckoo-op-header" class="cuckoo-blur-slider" min="0" max="100" step="5" value="45">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.opacity.sidebar') + '</span><span class="cuckoo-blur-value" id="cuckoo-op-sidebar-val">45 %</span></div>' +
    '    <input type="range" id="cuckoo-op-sidebar" class="cuckoo-blur-slider" min="0" max="100" step="5" value="45">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.opacity.toolblock') + '</span><span class="cuckoo-blur-value" id="cuckoo-op-toolblock-val">55 %</span></div>' +
    '    <input type="range" id="cuckoo-op-toolblock" class="cuckoo-blur-slider" min="0" max="100" step="5" value="55">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.blur.toolblock') + '</span><span class="cuckoo-blur-value" id="cuckoo-blur-toolblock-val">0 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-toolblock" class="cuckoo-blur-slider" min="0" max="30" step="1" value="0">' +
    '  </div>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">' + t('settings.section.overlay') + '</div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.overlay.opacity') + '</span><span class="cuckoo-blur-value" id="cuckoo-op-overlay-val">72 %</span></div>' +
    '    <input type="range" id="cuckoo-op-overlay" class="cuckoo-blur-slider" min="10" max="100" step="1" value="72">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.overlay.blur') + '</span><span class="cuckoo-blur-value" id="cuckoo-blur-overlay-val">12 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-overlay" class="cuckoo-blur-slider" min="0" max="30" step="1" value="12">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.overlay.width') + '</span><span class="cuckoo-blur-value" id="cuckoo-width-overlay-val">300 px</span></div>' +
    '    <input type="range" id="cuckoo-width-overlay" class="cuckoo-blur-slider" min="260" max="460" step="10" value="300">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row" style="flex-direction:row;justify-content:space-between;align-items:center;">' +
    '    <span style="font-size:13px;color:#cfd3ff;">' + t('settings.overlay.bgColor') + '</span>' +
    '    <div style="display:flex;align-items:center;gap:8px;">' +
    '      <input type="color" id="cuckoo-color-overlay-bg" value="#111322" style="width:32px;height:32px;border:none;border-radius:6px;cursor:pointer;background:transparent;">' +
    '      <span id="cuckoo-color-overlay-bg-val" class="cuckoo-blur-value">#111322</span>' +
    '    </div>' +
    '  </div>' +
    '  <div class="cuckoo-blur-row" style="flex-direction:row;justify-content:space-between;align-items:center;">' +
    '    <span style="font-size:13px;color:#cfd3ff;">' + t('settings.overlay.btnColor') + '</span>' +
    '    <div style="display:flex;align-items:center;gap:8px;">' +
    '      <input type="color" id="cuckoo-color-overlay-btn" value="#8b93ff" style="width:32px;height:32px;border:none;border-radius:6px;cursor:pointer;background:transparent;">' +
    '      <span id="cuckoo-color-overlay-btn-val" class="cuckoo-blur-value">#8b93ff</span>' +
    '    </div>' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.overlay.btnRadius') + '</span><span class="cuckoo-blur-value" id="cuckoo-radius-overlay-btn-val">10 px</span></div>' +
    '    <input type="range" id="cuckoo-radius-overlay-btn" class="cuckoo-blur-slider" min="4" max="24" step="1" value="10">' +
    '  </div>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">' + t('settings.section.effects') + '</div>' +
    '  <label class="cuckoo-checkbox-row" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;cursor:pointer;">' +
    '    <input type="checkbox" id="cuckoo-rgb-username" checked style="width:16px;height:16px;cursor:pointer;">' +
    '    <span style="font-size:13px;color:#cfd3ff;">' + t('settings.effect.rgb') + '</span>' +
    '  </label>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">' + t('settings.section.dangerous') + '</div>' +
    '  <textarea id="cuckoo-dangerous-patterns" rows="8" spellcheck="false" style="' +
    '    width:100%; box-sizing:border-box; padding:10px 12px; font-family:Consolas,monospace; font-size:12px;' +
    '    background:rgba(15,18,32,0.6); color:#dde1ff; border:1px solid rgba(255,255,255,0.1); border-radius:10px;' +
    '    resize:vertical; line-height:1.5; outline:none;' +
    '  "></textarea>' +
    '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">' +
    '    <span style="font-size:11px;color:#8a90b8;">' + t('settings.dangerous.hint') + '</span>' +
    '    <button id="cuckoo-btn-save-dangerous" style="' +
    '      padding: 8px 16px; border: 1px solid rgba(139,147,255,0.5); border-radius: 8px;' +
    '      background: rgba(139,147,255,0.15); color: #a8afff; font-weight: 600; font-size: 12px;' +
    '      cursor: pointer; transition: all 0.18s;' +
    '    ">' + t('settings.dangerous.save') + '</button>' +
    '  </div>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">' + t('settings.section.agent') + '</div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('settings.approval.hint') + '</span></div>' +
    '    <div style="display:flex;gap:8px;">' +
    '      <button class="cuckoo-approval-btn" data-mode="off" style="flex:1; padding:9px 10px; border-radius:10px; font-weight:600; font-size:12px; cursor:pointer; border:1px solid rgba(139,147,255,0.4); background:rgba(139,147,255,0.12); color:#cfd3ff; transition: all 0.18s;">' + t('settings.approval.off') + '</button>' +
    '      <button class="cuckoo-approval-btn" data-mode="risky" style="flex:1; padding:9px 10px; border-radius:10px; font-weight:600; font-size:12px; cursor:pointer; border:1px solid rgba(139,147,255,0.4); background:rgba(139,147,255,0.12); color:#cfd3ff; transition: all 0.18s;">' + t('settings.approval.risky') + '</button>' +
    '      <button class="cuckoo-approval-btn" data-mode="all" style="flex:1; padding:9px 10px; border-radius:10px; font-weight:600; font-size:12px; cursor:pointer; border:1px solid rgba(139,147,255,0.4); background:rgba(139,147,255,0.12); color:#cfd3ff; transition: all 0.18s;">' + t('settings.approval.all') + '</button>' +
    '    </div>' +
    '  </div>' +
    '  <label class="cuckoo-checkbox-row" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;cursor:pointer;">' +
    '    <input type="checkbox" id="cuckoo-hide-system-messages" style="width:16px;height:16px;cursor:pointer;flex-shrink:0;">' +
    '    <span style="font-size:13px;color:#cfd3ff;">' + t('settings.hideSystemMessages') +
    '      <span style="display:block;font-size:11px;color:#8a90b8;margin-top:2px;">' + t('settings.hideSystemMessages.hint') + '</span>' +
    '    </span>' +
    '  </label>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">' + t('settings.section.background') + '</div>' +
    '  <div class="ck-btn-row" style="margin-bottom:10px;">' +
    '    <button id="cuckoo-bg-open-folder" class="ck-btn">' + t('settings.bg.openFolder') + '</button>' +
    '    <button id="cuckoo-bg-refresh" class="ck-btn">' + t('settings.bg.refresh') + '</button>' +
    '  </div>' +
    '  <div class="cuckoo-bg-grid" id="cuckoo-bg-grid">' + items + '</div>' +
    '  <div style="font-size:11px;color:#8a90b8;margin-top:8px;line-height:1.5;">' + t('settings.bg.hint') + '</div>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">' + t('tg.title') + '</div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('tg.label.token') + '</span></div>' +
    '    <input type="password" id="cuckoo-tg-token" class="cuckoo-blur-slider" style="height:auto;padding:8px 10px;background:rgba(15,18,32,0.6);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#dde1ff;font-size:12px;" placeholder="123456:ABC-DEF..." />' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>' + t('tg.label.chatId') + '</span></div>' +
    '    <input type="text" id="cuckoo-tg-chatid" class="cuckoo-blur-slider" style="height:auto;padding:8px 10px;background:rgba(15,18,32,0.6);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#dde1ff;font-size:12px;" placeholder="123456789" />' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <label class="cuckoo-checkbox-row" style="display:flex;align-items:center;gap:10px;cursor:pointer;"><input type="checkbox" id="cuckoo-tg-enabled" style="width:16px;height:16px;cursor:pointer;"><span style="font-size:13px;color:#cfd3ff;">' + t('tg.label.enabled') + '</span></label>' +
    '    <label class="cuckoo-checkbox-row" style="display:flex;align-items:center;gap:10px;cursor:pointer;"><input type="checkbox" id="cuckoo-tg-notify" style="width:16px;height:16px;cursor:pointer;"><span style="font-size:13px;color:#cfd3ff;">' + t('tg.label.notifyTools') + '</span></label>' +
    '    <label class="cuckoo-checkbox-row" style="display:flex;align-items:center;gap:10px;cursor:pointer;"><input type="checkbox" id="cuckoo-tg-feed" style="width:16px;height:16px;cursor:pointer;"><span style="font-size:13px;color:#cfd3ff;">' + t('tg.label.chatFeed') + '</span></label>' +
    '  </div>' +
    '  <div class="ck-btn-row" style="margin-top:8px;">' +
    '    <button id="cuckoo-tg-save" class="ck-btn">' + t('tg.btn.save') + '</button>' +
    '    <button id="cuckoo-tg-ping" class="ck-btn">' + t('tg.btn.ping') + '</button>' +
    '    <button id="cuckoo-tg-test" class="ck-btn">' + t('tg.btn.test') + '</button>' +
    '  </div>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">' + t('settings.section.service') + '</div>' +
    '  <div class="ck-btn-row">' +
    '    <button id="cuckoo-btn-open-config" class="ck-btn" title="' + t('settings.btn.openConfig.title') + '">' + t('settings.btn.openConfig') + '</button>' +
    '    <button id="cuckoo-btn-clear-storage" class="ck-btn" title="' + t('settings.btn.clearStorage.title') + '">' + t('settings.btn.clearStorage') + '</button>' +
    '    <button id="cuckoo-btn-reset" class="ck-btn ck-btn-danger">' + t('settings.btn.reset') + '</button>' +
    '  </div>' +
    '</div>';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Обработчики клика по превью: сохраняем фон и применяем.
 */
function bindBackgroundGrid() {
  const grid = document.querySelectorAll('#' + TAB_CONTENT_ID + ' .cuckoo-bg-item');
  grid.forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.getAttribute('data-bg-id');
      if (!id) return;
      // Мгновенно применяем
      background.apply(id);
      // Подсветка
      document.querySelectorAll('#' + TAB_CONTENT_ID + ' .cuckoo-bg-item').forEach(x => x.classList.remove('cuckoo-bg-selected'));
      el.classList.add('cuckoo-bg-selected');
      // Сохраняем в settings.json
      try {
        const res = await window.electronAPI.setCuckooSetting('background', id);
        if (!res || !res.success) {
          console.error('[Cookie Code] Не удалось сохранить фон:', res && res.error);
        }
      } catch (err) {
        console.error('[Cookie Code] Ошибка сохранения фона:', err.message);
      }
    });
  });
}

/**
 * Собрать HTML одного превью фона.
 */
function backgroundItemHTML(b) {
  const uri = background.getPreviewUri(b.file);
  const styleAttr = uri ? ' style="background-image: url(\'' + uri + '\');"' : '';
  return (
    '<div class="cuckoo-bg-item" data-bg-id="' + b.id + '" title="' + escapeHtml(b.label) + '">' +
    '  <div class="cuckoo-bg-preview"' + styleAttr + '></div>' +
    '  <div class="cuckoo-bg-label">' + escapeHtml(b.label) + '</div>' +
    '</div>'
  );
}

/**
 * Перерисовать сетку фонов (встроенные + пользовательские).
 * Повторно навешивает обработчики клика и подсвечивает текущий фон.
 */
async function refreshBackgroundGrid() {
  const gridEl = document.querySelector('#' + TAB_CONTENT_ID + ' #cuckoo-bg-grid');
  if (!gridEl) return;
  // Перечитываем пользовательские фоны с диска
  await background.loadCustomBackgrounds();
  gridEl.innerHTML = background.getAllBackgrounds().map(backgroundItemHTML).join('');
  bindBackgroundGrid();
  await refreshBackgroundSelection();
}

/**
 * Кнопки «Открыть папку фонов» и «Обновить».
 */
function bindBackgroundFolderButtons() {
  const openBtn = document.querySelector('#' + TAB_CONTENT_ID + ' #cuckoo-bg-open-folder');
  if (openBtn) {
    openBtn.addEventListener('click', async () => {
      try {
        await window.electronAPI.openCustomBackgroundsFolder();
      } catch (err) {
        console.error('[Cookie Code] Не удалось открыть папку фонов:', err.message);
      }
    });
  }
  const refreshBtn = document.querySelector('#' + TAB_CONTENT_ID + ' #cuckoo-bg-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBackgroundGrid();
    });
  }
}

/**
 * Обработчики слайдеров размытия.
 * На input — мгновенно применяем и обновляем подпись.
 * На change — сохраняем в settings.json.
 */
function collectCurrentBlurSettings() {
  return {
    backgroundBlur:      Number((document.getElementById('cuckoo-blur-bg') || {}).value) || 0,
    headerBlur:          Number((document.getElementById('cuckoo-blur-header') || {}).value),
    sidebarBlur:         Number((document.getElementById('cuckoo-blur-sidebar') || {}).value),
    headerOpacity:       Number((document.getElementById('cuckoo-op-header') || {}).value),
    sidebarOpacity:      Number((document.getElementById('cuckoo-op-sidebar') || {}).value),
    toolBlockOpacity:    Number((document.getElementById('cuckoo-op-toolblock') || {}).value),
    toolBlockBlur:       Number((document.getElementById('cuckoo-blur-toolblock') || {}).value),
    overlayOpacity:      Number((document.getElementById('cuckoo-op-overlay') || {}).value),
    overlayBlur:         Number((document.getElementById('cuckoo-blur-overlay') || {}).value),
    overlayWidth:        Number((document.getElementById('cuckoo-width-overlay') || {}).value),
    overlayBgColor:      (document.getElementById('cuckoo-color-overlay-bg') || {}).value || '#111322',
    overlayPrimaryColor: (document.getElementById('cuckoo-color-overlay-btn') || {}).value || '#8b93ff',
    overlayBtnRadius:    Number((document.getElementById('cuckoo-radius-overlay-btn') || {}).value),
  };
}

function bindBlurSliders() {
  const sliders = [
    { inputId: 'cuckoo-blur-bg',          valId: 'cuckoo-blur-bg-val',          key: 'backgroundBlur',   unit: ' px' },
    { inputId: 'cuckoo-blur-header',      valId: 'cuckoo-blur-header-val',      key: 'headerBlur',       unit: ' px' },
    { inputId: 'cuckoo-blur-sidebar',     valId: 'cuckoo-blur-sidebar-val',     key: 'sidebarBlur',      unit: ' px' },
    { inputId: 'cuckoo-op-header',        valId: 'cuckoo-op-header-val',        key: 'headerOpacity',    unit: ' %' },
    { inputId: 'cuckoo-op-sidebar',       valId: 'cuckoo-op-sidebar-val',       key: 'sidebarOpacity',   unit: ' %' },
    { inputId: 'cuckoo-op-toolblock',     valId: 'cuckoo-op-toolblock-val',     key: 'toolBlockOpacity', unit: ' %' },
    { inputId: 'cuckoo-blur-toolblock',   valId: 'cuckoo-blur-toolblock-val',   key: 'toolBlockBlur',    unit: ' px' },
    // Панель Cookie Code
    { inputId: 'cuckoo-op-overlay',         valId: 'cuckoo-op-overlay-val',         key: 'overlayOpacity',     unit: ' %' },
    { inputId: 'cuckoo-blur-overlay',       valId: 'cuckoo-blur-overlay-val',       key: 'overlayBlur',        unit: ' px' },
    { inputId: 'cuckoo-width-overlay',      valId: 'cuckoo-width-overlay-val',      key: 'overlayWidth',       unit: ' px' },
    { inputId: 'cuckoo-radius-overlay-btn', valId: 'cuckoo-radius-overlay-btn-val', key: 'overlayBtnRadius',  unit: ' px' },
  ];

  sliders.forEach(({ inputId, valId, key, unit }) => {
    const input = document.getElementById(inputId);
    const label = document.getElementById(valId);
    if (!input || !label) return;
    const updateLabel = (v) => { label.textContent = v + unit; };

    input.addEventListener('input', () => {
      const v = Number(input.value);
      updateLabel(v);
      background.applyBlur(collectCurrentBlurSettings());
    });

    input.addEventListener('change', async () => {
      const v = Number(input.value);
      try {
        const res = await window.electronAPI.setCuckooSetting(key, v);
        if (!res || !res.success) {
          console.error('[Cookie Code] Не удалось сохранить настройку', key, res && res.error);
        }
      } catch (err) {
        console.error('[Cookie Code] Ошибка сохранения настройки', key, err.message);
      }
    });
  });

  // Цвет фона панели
  const bgInput = document.getElementById('cuckoo-color-overlay-bg');
  const bgLabel = document.getElementById('cuckoo-color-overlay-bg-val');
  if (bgInput) {
    bgInput.addEventListener('input', () => {
      if (bgLabel) bgLabel.textContent = bgInput.value;
      background.applyBlur(collectCurrentBlurSettings());
    });
    bgInput.addEventListener('change', async () => {
      try {
        await window.electronAPI.setCuckooSetting('overlayBgColor', bgInput.value);
      } catch (err) {
        console.error('[Cookie Code] Ошибка сохранения overlayBgColor:', err.message);
      }
    });
  }

  // Цвет кнопок оверлея
  const btnInput = document.getElementById('cuckoo-color-overlay-btn');
  const btnLabel = document.getElementById('cuckoo-color-overlay-btn-val');
  if (btnInput) {
    btnInput.addEventListener('input', () => {
      if (btnLabel) btnLabel.textContent = btnInput.value;
      background.applyBlur(collectCurrentBlurSettings());
    });
    btnInput.addEventListener('change', async () => {
      try {
        await window.electronAPI.setCuckooSetting('overlayPrimaryColor', btnInput.value);
      } catch (err) {
        console.error('[Cookie Code] Ошибка сохранения overlayPrimaryColor:', err.message);
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
    const tokenEl = document.getElementById('cuckoo-tg-token');
    const chatEl = document.getElementById('cuckoo-tg-chatid');
    const enabledEl = document.getElementById('cuckoo-tg-enabled');
    const notifyEl = document.getElementById('cuckoo-tg-notify');
    const feedEl = document.getElementById('cuckoo-tg-feed');
    if (tokenEl) tokenEl.value = s.telegramBotToken || '';
    if (chatEl) chatEl.value = s.telegramChatId || '';
    if (enabledEl) enabledEl.checked = !!s.telegramEnabled;
    if (notifyEl) notifyEl.checked = !!s.telegramNotifyTools;
    if (feedEl) feedEl.checked = !!s.telegramChatFeed;
  } catch (err) {
    console.error('[Cookie Code] Не удалось загрузить настройки Telegram:', err.message);
  }
}

/**
 * Обработчики кнопок Telegram: сохранить / проверить токен / тест.
 */
function bindTelegramSettings() {
  const saveBtn = document.getElementById('cuckoo-tg-save');
  const pingBtn = document.getElementById('cuckoo-tg-ping');
  const testBtn = document.getElementById('cuckoo-tg-test');

  const readValues = () => ({
    token: (document.getElementById('cuckoo-tg-token') || {}).value || '',
    chatId: (document.getElementById('cuckoo-tg-chatid') || {}).value || '',
    enabled: !!(document.getElementById('cuckoo-tg-enabled') || {}).checked,
    notify: !!(document.getElementById('cuckoo-tg-notify') || {}).checked,
    feed: !!(document.getElementById('cuckoo-tg-feed') || {}).checked,
  });

  const save = async () => {
    const v = readValues();
    try {
      await window.electronAPI.setCuckooSetting('telegramBotToken', v.token.trim());
      await window.electronAPI.setCuckooSetting('telegramChatId', v.chatId.trim());
      await window.electronAPI.setCuckooSetting('telegramEnabled', v.enabled);
      await window.electronAPI.setCuckooSetting('telegramNotifyTools', v.notify);
      await window.electronAPI.setCuckooSetting('telegramChatFeed', v.feed);
      const res = await window.electronAPI.telegramApply();
      return res && res.success;
    } catch (err) {
      console.error('[Cookie Code] Не удалось сохранить Telegram:', err.message);
      return false;
    }
  };

  saveBtn?.addEventListener('click', async () => {
    saveBtn.textContent = '...';
    const ok = await save();
    saveBtn.textContent = ok ? '✅ ' + t('tg.btn.save') : '❌ ' + t('tg.btn.save');
    setTimeout(() => { saveBtn.textContent = t('tg.btn.save'); }, 1800);
  });

  pingBtn?.addEventListener('click', async () => {
    await save();
    pingBtn.textContent = '...';
    const res = await window.electronAPI.telegramPing();
    pingBtn.textContent = (res && res.success) ? '✅ @' + (res.username || 'bot') : '❌ ' + ((res && res.error) || 'error');
    setTimeout(() => { pingBtn.textContent = t('tg.btn.ping'); }, 2500);
  });

  testBtn?.addEventListener('click', async () => {
    await save();
    testBtn.textContent = '...';
    const res = await window.electronAPI.telegramTest();
    testBtn.textContent = (res && res.success) ? '✅ ' + t('tg.btn.test') : '❌ ' + ((res && res.error) || 'error');
    setTimeout(() => { testBtn.textContent = t('tg.btn.test'); }, 2500);
  });
}

function bindResetButton() {
  const btn = document.getElementById('cuckoo-btn-reset');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = t('settings.btn.resetting');
    try {
      await background.resetAll();
      // Обновляем UI: слайдеры + подсветка фона
      await refreshBlurValues();
      await refreshBackgroundSelection();
    } finally {
      btn.disabled = false;
      btn.textContent = t('settings.btn.reset');
    }
  });

  // Кнопка «Очистить мета-данные» — чистит localStorage
  const clearBtn = document.getElementById('cuckoo-btn-clear-storage');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearBtn.disabled = true;
      const originalText = clearBtn.textContent;
      clearBtn.textContent = t('settings.btn.clearing');
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

  // Кнопка «Открыть файл настроек» — открывает cuckoo-settings.json системным редактором.
  const openCfgBtn = document.getElementById('cuckoo-btn-open-config');
  if (openCfgBtn) {
    openCfgBtn.addEventListener('click', async () => {
      openCfgBtn.disabled = true;
      const originalText = openCfgBtn.textContent;
      try {
        const res = await window.electronAPI.openCuckooSettingsFile();
        openCfgBtn.textContent = (res && res.success) ? t('settings.btn.openConfig.opened') : t('settings.btn.openConfig.error');
      } catch (err) {
        console.error('[Cookie Code] openCuckooSettingsFile error:', err.message);
        openCfgBtn.textContent = t('settings.btn.openConfig.error');
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
  const cb = document.getElementById('cuckoo-rgb-username');
  if (!cb) return;
  cb.addEventListener('change', async () => {
    const enabled = cb.checked;
    background.applyRgbUsername(enabled);
    try {
      const res = await window.electronAPI.setCuckooSetting('rgbUsername', enabled);
      if (!res || !res.success) {
        console.error('[Cookie Code] Не удалось сохранить rgbUsername:', res && res.error);
      }
    } catch (err) {
      console.error('[Cookie Code] Ошибка сохранения rgbUsername:', err.message);
    }
  });
}

function bindCustomizationToggle() {
  const btn = document.getElementById('cuckoo-customization-toggle');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = t('settings.customization.reloading');
    try {
      const settings = await window.electronAPI.getCuckooSettings();
      const enabled = !settings || settings.customizationEnabled !== false;
      await window.electronAPI.setCuckooSetting('customizationEnabled', !enabled);
      location.reload();
    } catch (err) {
      console.error('[Cookie Code] Ошибка переключения кастомизации:', err.message);
      btn.disabled = false;
      refreshCustomizationToggle();
    }
  });
}

async function refreshCustomizationToggle() {
  const btn = document.getElementById('cuckoo-customization-toggle');
  if (!btn) return;
  try {
    const settings = await window.electronAPI.getCuckooSettings();
    const enabled = !settings || settings.customizationEnabled !== false;
    btn.textContent = enabled ? t('settings.customization.disable') : t('settings.customization.enable');
    btn.style.borderColor = enabled ? 'rgba(255,107,122,0.5)' : 'rgba(93,214,157,0.55)';
    btn.style.background = enabled ? 'rgba(255,107,122,0.12)' : 'rgba(93,214,157,0.12)';
    btn.style.color = enabled ? '#ffb0b8' : '#a7f0c9';
  } catch (_) {
    btn.textContent = t('settings.customization.disable');
  }
}

/**
 * Кнопки выбора языка RU/EN.
 * При клике сохраняем выбор в settings.json и перезагружаем страницу,
 * чтобы тексты в OVERLAY_HTML пересобрались с новым языком.
 */
function bindLanguageButtons() {
  const buttons = document.querySelectorAll('.cuckoo-lang-btn');
  if (!buttons.length) return;

  // Подсветить активный
  const current = (window.__cuckooI18nLang || 'ru');
  buttons.forEach(btn => {
    if (btn.getAttribute('data-lang') === current) {
      btn.style.background = 'rgba(139,147,255,0.35)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'rgba(139,147,255,0.8)';
    } else {
      btn.style.background = 'rgba(139,147,255,0.12)';
      btn.style.color = '#cfd3ff';
      btn.style.borderColor = 'rgba(139,147,255,0.4)';
    }
  });

  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const lang = btn.getAttribute('data-lang');
      if (!lang || lang === current) return;
      try {
        await window.electronAPI.setCuckooSetting('language', lang);
      } catch (err) {
        console.error('[Cookie Code] Не удалось сохранить язык:', err.message);
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
  const ta = document.getElementById('cuckoo-dangerous-patterns');
  const btn = document.getElementById('cuckoo-btn-save-dangerous');
  if (!ta || !btn) return;

  // Загружаем текущий список
  try {
    const s = await window.electronAPI.getCuckooSettings();
    const list = Array.isArray(s && s.dangerousPatterns) ? s.dangerousPatterns : [];
    ta.value = list.join('\n');
  } catch (_) {}

  btn.addEventListener('click', async () => {
    const raw = (ta.value || '');
    // Разбиваем по строкам, убираем пустые и пробелы
    const patterns = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = t('settings.dangerous.saving');
    try {
      const res = await window.electronAPI.setCuckooSetting('dangerousPatterns', patterns);
      if (res && res.success) {
        btn.textContent = t('settings.dangerous.saved');
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
      } else {
        btn.textContent = t('settings.dangerous.error');
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
      }
    } catch (err) {
      console.error('[Cookie Code] Не удалось сохранить опасные команды:', err.message);
      btn.textContent = t('settings.dangerous.error');
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
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
  const buttons = document.querySelectorAll('.cuckoo-approval-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.getAttribute('data-mode');
      if (!mode) return;
      // Мгновенно применяем в рантайме
      state.toolApprovalMode = mode;
      // Подсветка активного режима
      applyApprovalActiveStyle(mode);
      // Сохраняем в settings.json
      try {
        await window.electronAPI.setCuckooSetting('toolApprovalMode', mode);
      } catch (err) {
        console.error('[Cookie Code] Не удалось сохранить toolApprovalMode:', err.message);
      }
    });
  });

  const cb = document.getElementById('cuckoo-hide-system-messages');
  if (cb) {
    cb.addEventListener('change', async () => {
      const enabled = cb.checked;
      // Мгновенно применяем: stealth-модуль читает state при каждом проходе
      state.hideSystemMessages = enabled;
      try {
        await window.electronAPI.setCuckooSetting('hideSystemMessages', enabled);
      } catch (err) {
        console.error('[Cookie Code] Не удалось сохранить hideSystemMessages:', err.message);
      }
    });
  }
}

/**
 * Подсветить активный режим подтверждения (как кнопки языка RU/EN).
 */
function applyApprovalActiveStyle(mode) {
  const buttons = document.querySelectorAll('.cuckoo-approval-btn');
  buttons.forEach(btn => {
    if (btn.getAttribute('data-mode') === mode) {
      btn.style.background = 'rgba(139,147,255,0.35)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'rgba(139,147,255,0.8)';
    } else {
      btn.style.background = 'rgba(139,147,255,0.12)';
      btn.style.color = '#cfd3ff';
      btn.style.borderColor = 'rgba(139,147,255,0.4)';
    }
  });
}

/**
 * Загрузить сохранённые значения секции «Агент и приватность».
 */
async function refreshAgentSettings() {
  try {
    const s = await window.electronAPI.getCuckooSettings();
    const mode = (s && s.toolApprovalMode) || 'off';
    state.toolApprovalMode = mode;
    applyApprovalActiveStyle(mode);
    const cb = document.getElementById('cuckoo-hide-system-messages');
    if (cb) {
      cb.checked = Boolean(s && s.hideSystemMessages === true);
      state.hideSystemMessages = cb.checked;
    }
  } catch (_) {}
}

/**
 * Загрузить сохранённое значение RGB-переливания в чекбокс.
 */
async function refreshRgbCheckbox() {
  try {
    const s = await window.electronAPI.getCuckooSettings();
    const cb = document.getElementById('cuckoo-rgb-username');
    if (cb) cb.checked = s && s.rgbUsername !== false;
  } catch (_) {}
}

/**
 * Загрузить сохранённые значения блюра в слайдеры.
 */
async function refreshBlurValues() {
  try {
    const s = await window.electronAPI.getCuckooSettings();
    const setSlider = (id, valId, v, unit = ' px') => {
      const input = document.getElementById(id);
      const label = document.getElementById(valId);
      if (!input || !label) return;
      input.value = String(v);
      label.textContent = v + unit;
    };
    setSlider('cuckoo-blur-bg',          'cuckoo-blur-bg-val',          Number(s && s.backgroundBlur) || 0, ' px');
    setSlider('cuckoo-blur-header',      'cuckoo-blur-header-val',      Number(s && s.headerBlur != null ? s.headerBlur : 12), ' px');
    setSlider('cuckoo-blur-sidebar',     'cuckoo-blur-sidebar-val',     Number(s && s.sidebarBlur != null ? s.sidebarBlur : 12), ' px');
    setSlider('cuckoo-op-header',        'cuckoo-op-header-val',        Number(s && s.headerOpacity != null ? s.headerOpacity : 45), ' %');
    setSlider('cuckoo-op-sidebar',       'cuckoo-op-sidebar-val',       Number(s && s.sidebarOpacity != null ? s.sidebarOpacity : 45), ' %');
    setSlider('cuckoo-op-toolblock',     'cuckoo-op-toolblock-val',     Number(s && s.toolBlockOpacity != null ? s.toolBlockOpacity : 55), ' %');
    setSlider('cuckoo-blur-toolblock',   'cuckoo-blur-toolblock-val',   Number(s && s.toolBlockBlur != null ? s.toolBlockBlur : 0), ' px');

    // Панель Cookie Code
    setSlider('cuckoo-op-overlay',         'cuckoo-op-overlay-val',         Number(s && s.overlayOpacity != null ? s.overlayOpacity : 72), ' %');
    setSlider('cuckoo-blur-overlay',       'cuckoo-blur-overlay-val',       Number(s && s.overlayBlur != null ? s.overlayBlur : 12), ' px');
    setSlider('cuckoo-width-overlay',      'cuckoo-width-overlay-val',      Number(s && s.overlayWidth != null ? s.overlayWidth : 300), ' px');
    setSlider('cuckoo-radius-overlay-btn', 'cuckoo-radius-overlay-btn-val', Number(s && s.overlayBtnRadius != null ? s.overlayBtnRadius : 10), ' px');

    const setColor = (inputId, valId, v) => {
      const input = document.getElementById(inputId);
      const label = document.getElementById(valId);
      if (input) input.value = v;
      if (label) label.textContent = v;
    };
    setColor('cuckoo-color-overlay-bg',  'cuckoo-color-overlay-bg-val',  (s && s.overlayBgColor) || '#111322');
    setColor('cuckoo-color-overlay-btn', 'cuckoo-color-overlay-btn-val', (s && s.overlayPrimaryColor) || '#8b93ff');
  } catch (err) {
    console.error('[Cookie Code] Не удалось загрузить значения блюра:', err.message);
  }
}

/**
 * Обновить подсветку выбранного фона из settings.json.
 */
async function refreshBackgroundSelection() {
  try {
    const settings = await window.electronAPI.getCuckooSettings();
    const current = (settings && settings.background) || background.DEFAULT_ID;
    document.querySelectorAll('#' + TAB_CONTENT_ID + ' .cuckoo-bg-item').forEach(el => {
      if (el.getAttribute('data-bg-id') === current) {
        el.classList.add('cuckoo-bg-selected');
      } else {
        el.classList.remove('cuckoo-bg-selected');
      }
    });
  } catch (err) {
    console.error('[Cookie Code] Не удалось прочитать текущий фон:', err.message);
  }
}

/**
 * Деактивировать вкладку Cookie Code — показать родной контент.
 */
function deactivateCuckooTab() {
  const nativeScroll = document.querySelector(
    MODAL_CONTENT_MAIN_SELECTOR + ' ' + RIGHT_PANEL_WRAPPER_SELECTOR + ' ' + NATIVE_SCROLL_AREA_SELECTOR
  );
  if (nativeScroll) nativeScroll.style.display = '';

  const ourContent = document.getElementById(TAB_CONTENT_ID);
  if (ourContent) ourContent.remove();

  // Снимаем подсветку с нашей кнопки вкладки
  setTabInactive();
}

// Делегирование клика: ловим клики по вкладкам (наши и родные).
document.addEventListener(
  'click',
  (e) => {
    const target = e.target;
    if (!target || !target.closest) return;

    // Наш таб
    const ourBtn = target.closest('#' + TAB_BUTTON_ID);
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
  true // capture
);

/**
 * Применить/снять фирменный фон активной вкладки Cookie Code.
 * Красим и саму кнопку, и вложенный .ds-button__background (если есть).
 * @param {Element} btn — кнопка вкладки
 * @param {boolean} active — активна ли вкладка
 */
function applyTabActiveStyle(btn, active) {
  if (!btn) return;
  const bg = btn.querySelector('.ds-button__background');
  if (active) {
    btn.style.background = 'rgba(139,147,255,0.25)';
    btn.style.color = '#fff';
    if (bg) bg.style.background = 'rgba(139,147,255,0.25)';
  } else {
    btn.style.background = '';
    btn.style.color = '';
    if (bg) bg.style.background = '';
  }
}

/**
 * Пометить кнопку вкладки Cookie Code как активную.
 * Идемпотентно; молча выходит, если кнопки нет.
 */
function setTabActive() {
  const btn = document.getElementById(TAB_BUTTON_ID);
  if (!btn) return;
  btn.setAttribute('data-cuckoo-active', '1');
  applyTabActiveStyle(btn, true);
}

/**
 * Снять активную подсветку с кнопки вкладки Cookie Code.
 * Идемпотентно; молча выходит, если кнопки нет.
 */
function setTabInactive() {
  const btn = document.getElementById(TAB_BUTTON_ID);
  if (!btn) return;
  btn.removeAttribute('data-cuckoo-active');
  applyTabActiveStyle(btn, false);
}

/**
 * Вставить кнопку-таб в левую панель, если её ещё нет.
 */
function injectSettingsTab() {
  const container = document.querySelector(CUCKOO_TAB_BUTTON_SELECTOR);
  if (!container) return;
  if (container.querySelector('#' + TAB_BUTTON_ID)) return; // уже вставлено

  const btn = document.createElement('div');
  btn.id = TAB_BUTTON_ID;
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.className = 'ds-button ds-button--outlinedNeutral ds-button--borderless ds-button--capsule ds-button--m ds-button--icon-relative-m ds-button--min-width';
  btn.style.cssText = '--dsl-button-text-color: var(--dsw-alias-label-primary);' +
    '--dsl-button-padding: 0 10px 0 8px;' +
    '--dsl-button-border-radius: 12px;' +
    '--dsl-button-icon-gap: 8px;' +
    '--dsl-button-color-hover: var(--dsw-alias-interactive-bg-hover);' +
    '--dsl-button-text-color-hover: var(--dsw-alias-label-primary);';

  btn.innerHTML =
    '<div class="ds-button__background"></div>' +
    '<div class="ds-button__icon">' +
    '  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '    <path d="M8 1.5C4.41 1.5 1.5 4.41 1.5 8C1.5 11.59 4.41 14.5 8 14.5C11.59 14.5 14.5 11.59 14.5 8C14.5 4.41 11.59 1.5 8 1.5ZM8 13C5.24 13 3 10.76 3 8C3 5.24 5.24 3 8 3C10.76 3 13 5.24 13 8C13 10.76 10.76 13 8 13Z" fill="currentColor"/>' +
    '    <circle cx="8" cy="8" r="2.4" fill="currentColor"/>' +
    '  </svg>' +
    '</div>' +
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
    const hasTab = !!document.querySelector('.d316d158');
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

module.exports = { start, injectSettingsTab, activateCuckooTab, deactivateCuckooTab, setTabActive, setTabInactive };
