/**
 * Cookie Code preload 入口
 * 原 preload.js 的全部逻辑拆分为本目录下的模块，此处负责组装与初始化，
 * 初始化时序与原文件保持一致。
 *
 * Каждый шаг обёрнут в safe(): сбой одного модуля (например, из-за изменений
 * вёрстки DeepSeek) не валит init() и не мешает остальным модулям.
 */
console.log("[Cookie Code] Preload script 开始执行");

// 暴露 electronAPI 到渲染进程（contextBridge + window 兜底）
require("./api");

const ui = require("./overlay/ui");
const projectDir = require("./overlay/project-dir");
const bindEvents = require("./overlay/events");
const observer = require("./dom/observer");
const chatExport = require("./dom/chat-export");
const chatInput = require("./dom/chat-input");
const askUserQuestion = require("./dom/ask-user-question");
const exitPlanMode = require("./dom/exit-plan-mode");
const planModeToggle = require("./dom/plan-mode-toggle");
const stealth = require("./dom/stealth");
const settingsTab = require("./dom/settings-tab");
const commands = require("./dom/commands");
const background = require("./dom/background");
const reasoningGlass = require("./dom/reasoning-glass");
const inputGlass = require("./dom/input-glass");
const forceDarkTheme = require("./dom/force-dark-theme");
const deepseekLanguage = require("./dom/deepseek-language");
const qrOverride = require("./dom/qr-override");
const fileChip = require("./dom/file-chip");
const contextPort = require("./dom/context-port");
const fonts = require("./dom/fonts");
const statsDashboard = require("./dom/stats-dashboard");
const statsRecorder = require("./dom/stats-recorder");
const messageCounter = require("./dom/message-counter");
const whatsNew = require("./dom/whats-new");
const i18n = require("./i18n/i18n");
const state = require("./dom/state");
const tokenInterceptor = require("./dom/token-interceptor");
const { getProviderByUrl } = require("../providers");
const { safe } = require("./dom/safe");

// ========== 初始化 ==========

/**
 * 初始化 Cookie Code 扩展
 * 注入样式、覆盖层 HTML，绑定事件，启动 MutationObserver 和目录监听
 */
async function init() {
  try {
    // Загружаем язык до инъекции HTML — тексты в template.js строятся через t()
    await safe("init.loadLanguage", () => i18n.loadLanguage());

    let customizationEnabled = true;
    try {
      const settings = await window.electronAPI.getCuckooSettings();
      customizationEnabled =
        !settings || settings.customizationEnabled !== false;
      // Approval gate: режим подтверждения tool-вызовов ('off' | 'risky' | 'all')
      state.toolApprovalMode = (settings && settings.toolApprovalMode) || "off";
      // Скрытие служебных сообщений (по умолчанию выключено)
      state.hideSystemMessages = Boolean(
        settings && settings.hideSystemMessages === true,
      );
      // Чипы файловых путей (по умолчанию включено)
      state.fileChipEnabled = !settings || settings.fileChipEnabled !== false;
      // Блок «Затронуто» под ответом (по умолчанию включено)
      state.showProducedFiles =
        !settings || settings.showProducedFiles !== false;
      // Блок «Токены диалога» в панели (по умолчанию выключено)
      state.showConvTokens = Boolean(
        settings && settings.showConvTokens === true,
      );
      // Дашборд статистики: включён ли сбор и debug-режим.
      state.statsEnabled = !settings || settings.statsEnabled !== false;
      state.statsDebugMode = Boolean(
        settings && settings.statsDebugMode === true,
      );
      state.statsDashboardEnabled =
        !settings || settings.statsDashboardEnabled !== false;
    } catch (_) {}

    // Прокидываем флаг в shared state: парсинг работает всегда,
    // а визуальный рендеринг tool-блоков гейтится этим флагом.
    state.customizationEnabled = customizationEnabled;

    // Перехват серверных токенов DeepSeek: ставим как можно раньше,
    // чтобы поймать первый же запрос completion. Работает через safe().
    safe("init.tokenInterceptor", () => tokenInterceptor.install());

    // Регистрируем IPC-листенеры всегда — от них зависит ввод и парсинг tool-блоков
    safe("init.registerIpcListeners", () => chatInput.registerIpcListeners());
    safe("init.registerAskUserQuestionListener", () =>
      askUserQuestion.registerAskUserQuestionListener(),
    );
    safe("init.registerExitPlanModeListener", () =>
      exitPlanMode.registerExitPlanModeListener(),
    );
    safe("init.registerWhatsNewListener", () =>
      whatsNew.registerWhatsNewListener(),
    );
    safe("init.planModeToggleStart", () => planModeToggle.startWatch());

    // Базовая UI-инфраструктура нужна всегда: оверлей (кнопка), стили, события
    safe("init.injectCSS", () => ui.injectCSS());
    safe("init.injectOverlay", () => ui.injectOverlay());
    // Перенос контекста: если мы в середине операции (после reload) — продолжаем.
    safe("init.contextPortResume", () => contextPort.resume());

    // Сбор статистики использования (токены + сообщения).
    safe("init.statsRecorderStart", () => statsRecorder.start());
    // Учёт сообщений (user / ai) по появлению .ds-message в DOM.
    safe("init.messageCounterStart", () => messageCounter.start());

    // Дашборд статистики на домашней странице.
    safe("init.statsDashboardStart", () => statsDashboard.start());
    safe("init.statsDashboardDebug", () => {
      statsDashboard.setDebugMode(state.statsDebugMode === true);
    });

    // Кастомный шрифт интерфейса и страницы — до остальной отрисовки.
    safe("init.fontsLoadAndApply", () => fonts.loadAndApply());
    safe("init.fontsSettingsListener", () => fonts.installSettingsListener());
    // Скрыть блок «Токены диалога», если он выключен в настройках (по умолчанию).
    safe("init.applyConvTokensVisibility", () => {
      if (state.showConvTokens === true) return;
      const section = document.querySelector(".cuckoo-token-section");
      if (section) {
        section.style.display = "none";
        const prev = section.previousElementSibling;
        if (prev && prev.classList && prev.classList.contains("cuckoo-divider"))
          prev.style.display = "none";
      }
    });
    safe("init.initProjectDirSection", () =>
      projectDir.initProjectDirSection(),
    );
    safe("init.bindEvents", () => bindEvents());
    safe("init.updateHomeMode", () => ui.updateHomeMode());

    // Сохранить токены текущего диалога перед уходом/закрытием.
    window.addEventListener("beforeunload", () => {
      safe("init.saveTokensBeforeUnload", () =>
        bindEvents.computeAndSaveConversationTokens(),
      );
    });

    // 监听 URL 变化（SPA 路由）
    window.addEventListener("popstate", () => {
      safe("init.updateHomeModePop", () => ui.updateHomeMode());
      safe("init.refreshTokensPop", () =>
        bindEvents.updateConversationTokenDisplay(),
      );
    });
    window.addEventListener("hashchange", () => {
      safe("init.updateHomeModeHash", () => ui.updateHomeMode());
      safe("init.refreshTokensHash", () =>
        bindEvents.updateConversationTokenDisplay(),
      );
    });
    setInterval(
      () => safe("init.updateHomeModeInterval", () => ui.updateHomeMode()),
      5000,
    );
    // 首次延迟执行，确保 overlay 已注入
    setTimeout(
      () => safe("init.updateHomeModeDelayed", () => ui.updateHomeMode()),
      500,
    );

    // 默认显示覆盖层 - 兜底强制显示
    safe("init.forceShowOverlay", () => ui.forceShowOverlay());

    // 延迟启动观察器，等待页面框架渲染
    setTimeout(
      () => safe("init.startObserver", () => observer.startObserver()),
      2000,
    );

    // Скрытие служебных сообщений (результаты инструментов, системный промпт).
    // Поведенческая фича — работает независимо от customizationEnabled.
    safe("init.startStealthWatcher", () => stealth.startStealthWatcher());

    // 启动设置面板标签注入
    safe("init.settingsTabStart", () => settingsTab.start());

    // Slash-команды: автодополнение (review/summarize)
    safe("init.commandsStart", () => commands.start());

    // Принудительно держим тёмную тему DeepSeek
    safe("init.forceDarkThemeStart", () => forceDarkTheme.startWatch());

    // Фиксируем язык интерфейса DeepSeek на «Система» и запрещаем его менять
    safe("init.deepseekLanguageStart", () => deepseekLanguage.startWatch());

    // Подмена QR-кода в попапе «Скачать приложение»
    safe("init.qrOverrideStart", () => qrOverride.startWatch());

    // Подписка на изменения настроек из TG-бота / других окон:
    // фон, блюр и стекло применяются мгновенно без перезахода в настройки.
    safe("init.backgroundSettingsListener", () =>
      background.installSettingsListener(),
    );

    // Стилизация абсолютных путей к файлам как чипов с открытием в системе
    safe("init.fileChipSetEnabled", () =>
      fileChip.setEnabled(state.fileChipEnabled !== false),
    );
    safe("init.fileChipStart", () => fileChip.startWatch());

    // Блок «Затронуто» под ответом AI — вкл/выкл через настройки
    safe("init.producedFilesSetEnabled", () => {
      const rm = require("./dom/response-meta");
      if (typeof rm.setEnabled === "function")
        rm.setEnabled(state.showProducedFiles !== false);
    });

    // Кнопка экспорта ответа в PDF/DOCX под каждым ответом AI
    safe("init.chatExportStart", () => chatExport.startWatch());

    // Визуальные эффекты применяем только при включённой кастомизации
    if (customizationEnabled) {
      // Загружаем настройки и применяем фон
      safe("init.backgroundLoadAndApply", () => background.loadAndApply());

      // Матовое стекло для плашки «Размышление N секунд»
      safe("init.reasoningGlassStart", () => reasoningGlass.startWatch());

      // Матовое стекло для поля ввода сообщения
      safe("init.inputGlassStart", () => inputGlass.startWatch());

      // Пет (чубрик) на поле ввода + debug-рамка на F9
      safe("init.petStart", () => require("./dom/pet").start());
    } else {
      // Сбрасываем возможные визуальные эффекты (фон, блюры, RGB-ник)
      safe("init.backgroundReset", () => background.apply("none"));
      safe("init.backgroundBlurReset", () =>
        background.applyBlur({
          backgroundBlur: 0,
          headerBlur: 0,
          sidebarBlur: 0,
          headerOpacity: 0,
          sidebarOpacity: 0,
          toolBlockOpacity: 0,
          toolBlockBlur: 0,
        }),
      );
      safe("init.backgroundRgbReset", () => background.applyRgbUsername(false));
    }

    // Снимаем базовый цвет фона/::before-слой при выключенной кастомизации
    safe("init.applyCustomizationEnabled", () =>
      background.applyCustomizationEnabled(customizationEnabled),
    );
  } catch (err) {
    console.error("[Cookie Code] init() 出错:", err);
    // 兜底：即使出错也强制显示面板
    safe("init.forceShowOverlayFallback", () => ui.forceShowOverlay());
  }

  // 定期巡检：防止面板被意外隐藏
  safe("init.startOverlayWatcher", () => ui.startOverlayWatcher());

  // 定期提取当前平台用户信息并更新窗口名
  let lastSentUserName = "";
  setInterval(() => {
    safe("init.updateWindowName", () => {
      const provider = getProviderByUrl(window.location.href);
      if (!provider || typeof provider.extractUserInfo !== "function") return;
      const text = provider.extractUserInfo();
      if (text && text !== lastSentUserName) {
        lastSentUserName = text;
        window.electronAPI.updateWindowName(text).catch(() => {});
      }
    });
  }, 3000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => console.error("[Cookie Code] init error:", err));
  });
} else {
  init().catch((err) => console.error("[Cookie Code] init error:", err));
}
