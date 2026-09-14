/**
 * Индикатор-тумблер режима плана в панели кнопок DeepSeek.
 *
 * Рядом с «Глубокое мышление» / «Умный поиск» (контейнер ._58b31c9 с кнопками
 * .ds-toggle-button) добавляется кнопка «План»:
 *   — выключен: обычный вид, клик включает режим;
 *   — включён:  подсвечена (ds-toggle-button--selected), клик выключает режим.
 *
 * Режим плана — на сессию (чат): при переключении чата состояние меняется
 * вместе с ним (событие 'plan-mode-changed' от главного процесса).
 * Включение — только режим (текст в поле не трогаем).
 * Выключение — снимаем блокировку и убираем PLAN_PROMPT из поля, если он там.
 */
const { ipcRenderer } = require('electron');
const state = require('./state');
const chatInput = require('./chat-input');
const { PLAN_PROMPT } = require('./plan-prompt');
const { t } = require('../i18n/i18n');

const CONTAINER_SELECTOR = '._58b31c9';
const BTN_CLASS = 'cuckoo-plan-toggle';
const STYLE_ID = 'cuckoo-plan-toggle-style';

let started = false;
let boundContainer = null;

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value || '');
  return div.innerHTML;
}

const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">' +
  '<path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M3 4.2h6.2M3 8h6.2M3 11.8h4.2"/>' +
  '<path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M10.4 11.2l1.5 1.5 2.6-3"/>' +
  '</svg>';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cuckoo-plan-toggle[data-active="true"] { color: #7c8cff !important; }
    .cuckoo-plan-toggle[data-active="true"] .ds-toggle-button__icon { color: #7c8cff; }
    .cuckoo-plan-toggle .cuckoo-plan-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-left: 6px; background: #7c8cff; box-shadow: 0 0 6px rgba(124,140,255,.8); vertical-align: middle; }
    .cuckoo-plan-toggle[data-active="false"] .cuckoo-plan-dot { display: none; }
  `;
  document.head.appendChild(style);
}

function buildButton() {
  const btn = document.createElement('div');
  btn.className = 'f79352dc ds-toggle-button ds-toggle-button--m ' + BTN_CLASS;
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('data-active', 'false');
  btn.innerHTML =
    '<div class="ds-toggle-button__icon">' +
    '<div class="ds-icon" style="font-size: inherit;"><div aria-hidden="true">' +
    '<div style="width:14px;height:14px;">' + ICON_SVG + '</div>' +
    '</div></div></div>' +
    '<span class="_6dbc175">' + escapeHtml(t('plan.toggle.label')) + '</span>' +
    '<span class="cuckoo-plan-dot"></span>';
  return btn;
}

function syncState() {
  if (!boundContainer) return;
  const btn = boundContainer.querySelector('.' + BTN_CLASS);
  if (!btn) return;
  const active = !!state.planMode;
  btn.setAttribute('data-active', active ? 'true' : 'false');
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  if (active) btn.classList.add('ds-toggle-button--selected');
  else btn.classList.remove('ds-toggle-button--selected');
}

/**
 * Убирает PLAN_PROMPT из поля ввода, если оно содержит ровно этот текст.
 */
function clearPlanPromptFromInput() {
  try {
    const field = chatInput.findInputArea();
    if (!field) return;
    const current = field.tagName === 'TEXTAREA' || field.tagName === 'INPUT'
      ? (field.value || '')
      : (field.textContent || '');
    if (current.trim() !== PLAN_PROMPT.trim()) return;
    chatInput.setInputContent(field, '');
  } catch (_) {}
}

/**
 * Вставляет PLAN_PROMPT в поле ввода (только если поле пустое, чтобы не
 * затирать уже набранный пользователем текст).
 */
function insertPlanPromptIntoInput() {
  try {
    const field = chatInput.findInputArea();
    if (!field) return;
    const current = field.tagName === 'TEXTAREA' || field.tagName === 'INPUT'
      ? (field.value || '')
      : (field.textContent || '');
    if (current.trim()) return;
    chatInput.setInputContent(field, PLAN_PROMPT);
  } catch (_) {}
}

// ===== Отложенная авто-отправка «Работай в соответствии с планом» =====
// После согласия с планом текст вставляется в поле и через AUTO_SEND_DELAY мс
// отправляется. Любое переключение кнопки «План» отменяет отправку.
const AUTO_SEND_DELAY = 2600;
let autoSendTimer = null;
let autoSendText = '';

/** Отменяет запланированную авто-отправку. */
function cancelAutoSend() {
  if (autoSendTimer) {
    clearTimeout(autoSendTimer);
    autoSendTimer = null;
  }
  autoSendText = '';
}

/**
 * Пытается нажать кнопку отправки DeepSeek рядом с полем ввода.
 * @param {Element} input
 * @returns {boolean}
 */
function clickSendButtonNear(input) {
  try {
    const scope = (input && (input.closest('form') || input.parentElement?.parentElement)) || document;
    const btn = scope.querySelector('button[type="submit"], button[aria-label*="send" i], button[aria-label*="отправ" i]');
    if (btn && !btn.disabled) { btn.click(); return true; }
  } catch (_) {}
  return false;
}

function sendViaNativeEnter(text) {
  let input = null;
  try {
    input = chatInput.findInputArea();
    if (input) chatInput.setInputContent(input, text);
  } catch (_) {}
  // Пауза: даём React обработать input и сфокусировать поле.
  setTimeout(() => {
    try {
      if (window.electronAPI && typeof window.electronAPI.sendEnterToChat === 'function') {
        window.electronAPI.sendEnterToChat().catch(() => {});
      }
    } catch (_) {}
    // Проверяем через 500 мс: если поле всё ещё содержит текст — Enter не сработал,
    // пробуем кликнуть кнопку отправки.
    setTimeout(() => {
      try {
        const cur = chatInput.findInputArea();
        const val = cur ? (cur.value || cur.textContent || '') : '';
        if (val.trim()) {
          console.log('[Cookie Code] plan-approve: поле не очистилось, пробую кнопку отправки');
          const clicked = clickSendButtonNear(cur || input);
          if (!clicked) {
            try { chatInput.sendToChat(text, 'plan-approve', 0); } catch (_) {}
          }
        }
      } catch (_) {}
    }, 500);
  }, 150);
}

/**
 * Планирует авто-отправку текста через delay мс.
 * Если к моменту срабатывания режим плана снова включён — отправка не происходит.
 * @param {string} text
 * @param {number} [delay]
 */
function scheduleAutoSend(text, delay) {
  cancelAutoSend();
  autoSendText = String(text || '');
  autoSendTimer = setTimeout(() => {
    autoSendTimer = null;
    const textToSend = autoSendText;
    autoSendText = '';
    if (!textToSend) return;
    sendViaNativeEnter(textToSend);
  }, typeof delay === 'number' ? delay : AUTO_SEND_DELAY);
}

function toggle() {
  // Любое переключение кнопки отменяет ранее запланированную авто-отправку.
  cancelAutoSend();
  state.planMode = !state.planMode;
  if (state.planMode) {
    // Включаем режим: вставляем промпт политики и через AUTO_SEND_DELAY
    // отправляем его (отжатие кнопки до срабатывания отменит отправку).
    insertPlanPromptIntoInput();
    scheduleAutoSend(PLAN_PROMPT);
  } else {
    clearPlanPromptFromInput();
  }
  try {
    if (window.electronAPI && typeof window.electronAPI.setPlanMode === 'function') {
      window.electronAPI.setPlanMode(state.planMode).catch(() => {});
    }
  } catch (_) {}
  syncState();
}

function bind() {
  if (typeof document === 'undefined') return;
  const container = document.querySelector(CONTAINER_SELECTOR);
  if (!container) return;
  if (container.querySelector('.' + BTN_CLASS)) { boundContainer = container; syncState(); return; }

  ensureStyles();
  const btn = buildButton();
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggle(); });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
  container.appendChild(btn);
  boundContainer = container;
  syncState();
}

/**
 * Слушает смену сессии (URL) от главного процесса: у каждой сессии свой
 * режим плана, поэтому при переходе в другой чат обновляем state и UI.
 */
function registerPlanModeListener() {
  ipcRenderer.on('plan-mode-changed', (_event, payload = {}) => {
    state.planMode = !!payload.enabled;
    syncState();
  });
}

function startWatch() {
  if (started) return;
  started = true;
  registerPlanModeListener();
  try {
    const mo = new MutationObserver(() => bind());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
  setInterval(bind, 1500);
  bind();
}

module.exports = { startWatch, syncState, toggle, cancelAutoSend, scheduleAutoSend, BTN_CLASS, AUTO_SEND_DELAY };
