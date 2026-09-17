/**
 * preload 全局共享状态
 * 由原 preload.js 中的模块级变量拆分而来，各模块通过同一对象共享。
 */
module.exports = {
  initialPromptContent: "",
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
  toolApprovalMode: "off",
  // Скрывать ли служебные сообщения (результаты инструментов, системный промпт)
  // в чате. Загружается из настроек при init() и переключается на лету.
  hideSystemMessages: false,
  fileChipEnabled: true,
  showProducedFiles: true,
  // Показывать блок «Токены диалога» в оверлее (по умолчанию выключено).
  showConvTokens: false,
  // Дашборд статистики: собирать ли статистику и включён ли debug-режим.
  statsEnabled: true,
  statsDebugMode: false,
  // Показывать сам дашборд на домашней странице.
  statsDashboardEnabled: true,
  // Режим плана: пока включён — изменяющие инструменты заблокированы,
  // модель пишет plan.md и завершает режим через exit_plan_mode().
  planMode: false,
  // Последнее серверное значение accumulated_token_usage/usage.total_tokens
  // (перехватывается token-interceptor из ответа DeepSeek completion).
  // 0 — серверных данных нет, используем локальную оценку.
  serverTokens: 0,
  // Дельта серверных токенов за последний ответ (для меты под ответом).
  serverTokenDelta: 0,
  // Серверное accumulated_token_usage по sessionId: { [sessionId]: number }.
  // Храним по сессии, чтобы при переключении чата не тянуть чужое значение.
  serverTokensBySession: {},
  // Локальная оценка токенов по sessionId: { [sessionId]: number }.
  // Монотонный максимум — чтобы счётчик не прыгал при перерисовке DOM.
  localEstimateBySession: {},
};
