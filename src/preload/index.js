/**
 * Cookie Code preload 入口
 * 原 preload.js 的全部逻辑拆分为本目录下的模块，此处负责组装与初始化，
 * 初始化时序与原文件保持一致。
 *
 * Каждый шаг обёрнут в safe(): сбой одного модуля (например, из-за изменений
 * вёрстки DeepSeek) не валит init() и не мешает остальным модулям.
 */
console.log('[Cookie Code] Preload script 开始执行');

// 暴露 electronAPI 到渲染进程（contextBridge + window 兜底）
require('./api');

const ui = require('./overlay/ui');
const projectDir = require('./overlay/project-dir');
const bindEvents = require('./overlay/events');
const observer = require('./dom/observer');
const chatExport = require('./dom/chat-export');
const chatInput = require('./dom/chat-input');
const askUserQuestion = require('./dom/ask-user-question');
const stealth = require('./dom/stealth');
const settingsTab = require('./dom/settings-tab');
const commands = require('./dom/commands');
const background = require('./dom/background');
const reasoningGlass = require('./dom/reasoning-glass');
const inputGlass = require('./dom/input-glass');
const forceDarkTheme = require('./dom/force-dark-theme');
const qrOverride = require('./dom/qr-override');
const i18n = require('./i18n/i18n');
const state = require('./dom/state');
const { getProviderByUrl } = require('../providers');
const { safe } = require('./dom/safe');

// ========== 初始化 ==========

/**
 * 初始化 Cookie Code 扩展
 * 注入样式、覆盖层 HTML，绑定事件，启动 MutationObserver 和目录监听
 */
async function init() {
  try {
    // Загружаем язык до инъекции HTML — тексты в template.js строятся через t()
    await safe('init.loadLanguage', () => i18n.loadLanguage());

    let customizationEnabled = true;
    try {
      const settings = await window.electronAPI.getCuckooSettings();
      customizationEnabled = !settings || settings.customizationEnabled !== false;
      // Approval gate: режим подтверждения tool-вызовов ('off' | 'risky' | 'all')
      state.toolApprovalMode = (settings && settings.toolApprovalMode) || 'off';
      // Скрытие служебных сообщений (по умолчанию выключено)
      state.hideSystemMessages = Boolean(settings && settings.hideSystemMessages === true);
    } catch (_) {}

    // Прокидываем флаг в shared state: парсинг работает всегда,
    // а визуальный рендеринг tool-блоков гейтится этим флагом.
    state.customizationEnabled = customizationEnabled;

    // Регистрируем IPC-листенеры всегда — от них зависит ввод и парсинг tool-блоков
    safe('init.registerIpcListeners', () => chatInput.registerIpcListeners());
    safe('init.registerAskUserQuestionListener', () => askUserQuestion.registerAskUserQuestionListener());

    // Базовая UI-инфраструктура нужна всегда: оверлей (кнопка), стили, события
    safe('init.injectCSS', () => ui.injectCSS());
    safe('init.injectOverlay', () => ui.injectOverlay());
    safe('init.initProjectDirSection', () => projectDir.initProjectDirSection());
    safe('init.bindEvents', () => bindEvents());
    safe('init.updateHomeMode', () => ui.updateHomeMode());

    // 监听 URL 变化（SPA 路由）
    window.addEventListener('popstate', ui.updateHomeMode);
    window.addEventListener('hashchange', ui.updateHomeMode);
    setInterval(() => safe('init.updateHomeModeInterval', () => ui.updateHomeMode()), 5000);
    // 首次延迟执行，确保 overlay 已注入
    setTimeout(() => safe('init.updateHomeModeDelayed', () => ui.updateHomeMode()), 500);

    // 默认显示覆盖层 - 兜底强制显示
    safe('init.forceShowOverlay', () => ui.forceShowOverlay());

    // 延迟启动观察器，等待页面框架渲染
    setTimeout(() => safe('init.startObserver', () => observer.startObserver()), 2000);

    // Скрытие служебных сообщений (результаты инструментов, системный промпт).
    // Поведенческая фича — работает независимо от customizationEnabled.
    safe('init.startStealthWatcher', () => stealth.startStealthWatcher());

    // 启动设置面板标签注入
    safe('init.settingsTabStart', () => settingsTab.start());

    // Slash-команды: автодополнение и /plan
    safe('init.commandsStart', () => commands.start());

    // Принудительно держим тёмную тему DeepSeek
    safe('init.forceDarkThemeStart', () => forceDarkTheme.startWatch());

    // Подмена QR-кода в попапе «Скачать приложение»
    safe('init.qrOverrideStart', () => qrOverride.startWatch());

    // Кнопка экспорта ответа в PDF/DOCX под каждым ответом AI
    safe('init.chatExportStart', () => chatExport.startWatch());

    // Визуальные эффекты применяем только при включённой кастомизации
    if (customizationEnabled) {
      // Загружаем настройки и применяем фон
      safe('init.backgroundLoadAndApply', () => background.loadAndApply());

      // Матовое стекло для плашки «Размышление N секунд»
      safe('init.reasoningGlassStart', () => reasoningGlass.startWatch());

      // Матовое стекло для поля ввода сообщения
      safe('init.inputGlassStart', () => inputGlass.startWatch());
    } else {
      // Сбрасываем возможные визуальные эффекты (фон, блюры, RGB-ник)
      safe('init.backgroundReset', () => background.apply('none'));
      safe('init.backgroundBlurReset', () => background.applyBlur({ backgroundBlur: 0, headerBlur: 0, sidebarBlur: 0, headerOpacity: 0, sidebarOpacity: 0, toolBlockOpacity: 0, toolBlockBlur: 0 }));
      safe('init.backgroundRgbReset', () => background.applyRgbUsername(false));
    }

    // Снимаем базовый цвет фона/::before-слой при выключенной кастомизации
    safe('init.applyCustomizationEnabled', () => background.applyCustomizationEnabled(customizationEnabled));
  } catch (err) {
    console.error('[Cookie Code] init() 出错:', err);
    // 兜底：即使出错也强制显示面板
    safe('init.forceShowOverlayFallback', () => ui.forceShowOverlay());
  }

  // 定期巡检：防止面板被意外隐藏
  safe('init.startOverlayWatcher', () => ui.startOverlayWatcher());

  // 定期提取当前平台用户信息并更新窗口名
  let lastSentUserName = '';
  setInterval(() => {
    safe('init.updateWindowName', () => {
      const provider = getProviderByUrl(window.location.href);
      if (!provider || typeof provider.extractUserInfo !== 'function') return;
      const text = provider.extractUserInfo();
      if (text && text !== lastSentUserName) {
        lastSentUserName = text;
        window.electronAPI.updateWindowName(text).catch(() => {});
      }
    });
  }, 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init().catch(err => console.error('[Cookie Code] init error:', err)); });
} else {
  init().catch(err => console.error('[Cookie Code] init error:', err));
}
