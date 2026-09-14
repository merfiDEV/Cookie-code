/**
 * preload 全局共享状态
 * 由原 preload.js 中的模块级变量拆分而来，各模块通过同一对象共享。
 */
module.exports = {
  initialPromptContent: '',
  // 是否有待发送的初始提示
  pendingInitialPrompt: false,
  // 待执行的工具调用
  pendingToolCall: null,
  // 发送延迟配置（毫秒）
  sendDelayMin: 2000,
  sendDelayMax: 4000,
  // 当前项目目录（null 表示未初始化）
  currentProjectDir: null,
  // Включена ли кастомизация (визуальный рендеринг tool-блоков и эффектов).
  // Парсинг и выполнение tool-вызовов работают независимо от этого флага.
  customizationEnabled: true,
  // Режим подтверждения tool-вызовов: 'off' | 'risky' | 'all'.
  // Загружается из настроек при init() и обновляется на лету из settings-tab.
  toolApprovalMode: 'off',
  // Скрывать ли служебные сообщения (результаты инструментов, системный промпт)
  // в чате. Загружается из настроек при init() и переключается на лету.
  hideSystemMessages: false,
  fileChipEnabled: true,
  showProducedFiles: true,
};
