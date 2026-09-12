/**
 * Cookie Code preload 入口
 * 原 preload.js 的全部逻辑拆分为本目录下的模块，此处负责组装与初始化，
 * 初始化时序与原文件保持一致。
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
const settingsTab = require('./dom/settings-tab');
const commands = require('./dom/commands');
const background = require('./dom/background');
const reasoningGlass = require('./dom/reasoning-glass');
const i18n = require('./i18n/i18n');
const { getProviderByUrl } = require('../providers');

// ========== 初始化 ==========

/**
 * 初始化 Cookie Code 扩展
 * 注入样式、覆盖层 HTML，绑定事件，启动 MutationObserver 和目录监听
 */
async function init() {
  try {
    // Загружаем язык до инъекции HTML — тексты в template.js строятся через t()
    try { await i18n.loadLanguage(); } catch (_) {}

    let customizationEnabled = true;
    try {
      const settings = await window.electronAPI.getCuckooSettings();
      customizationEnabled = !settings || settings.customizationEnabled !== false;
    } catch (_) {}

    if (!customizationEnabled) {
      settingsTab.start();
      return;
    }

    // 注册主进程消息监听（仅在 Cookie Code кастомизация включена）
    chatInput.registerIpcListeners();
    askUserQuestion.registerAskUserQuestionListener();

    ui.injectCSS();
    ui.injectOverlay();
    projectDir.initProjectDirSection();
    bindEvents();
    ui.updateHomeMode();

    // 监听 URL 变化（SPA 路由）
    window.addEventListener('popstate', ui.updateHomeMode);
    window.addEventListener('hashchange', ui.updateHomeMode);
    setInterval(ui.updateHomeMode, 5000);
    // 首次延迟执行，确保 overlay 已注入
    setTimeout(ui.updateHomeMode, 500);

    // 默认显示覆盖层 - 兜底强制显示
    ui.forceShowOverlay();

    // 延迟启动观察器，等待页面框架渲染
    setTimeout(observer.startObserver, 2000);

    // 启动设置面板标签注入
    settingsTab.start();

    // Slash-команды: автодополнение и /plan
    commands.start();

    // Кнопка экспорта ответа в PDF/DOCX под каждым ответом AI
    try { chatExport.startWatch(); } catch (e) { console.error('[Cookie Code] chat-export startWatch failed:', e.message); }

    // Загружаем настройки и применяем фон
    background.loadAndApply();

    // Матовое стекло для плашки «Размышление N секунд»
    reasoningGlass.startWatch();
  } catch (err) {
    console.error('[Cookie Code] init() 出错:', err);
    // 兜底：即使出错也强制显示面板
    ui.forceShowOverlay();
  }

  // 定期巡检：防止面板被意外隐藏
  ui.startOverlayWatcher();

  // 定期提取当前平台用户信息并更新窗口名
  let lastSentUserName = '';
  setInterval(() => {
    try {
      const provider = getProviderByUrl(window.location.href);
      if (!provider || typeof provider.extractUserInfo !== 'function') return;
      const text = provider.extractUserInfo();
      if (text && text !== lastSentUserName) {
        lastSentUserName = text;
        window.electronAPI.updateWindowName(text).catch(() => {});
      }
    } catch (_) {}
  }, 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init().catch(err => console.error('[Cookie Code] init error:', err)); });
} else {
  init().catch(err => console.error('[Cookie Code] init error:', err));
}
