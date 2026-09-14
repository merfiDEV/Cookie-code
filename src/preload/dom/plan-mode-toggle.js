/**
 * Индикатор-тумблер режима плана в панели кнопок DeepSeek.
 *
 * Рядом с «Глубокое мышление» / «Умный поиск» (контейнер ._58b31c9 с кнопками
 * .ds-toggle-button) добавляется кнопка «План»:
 *   — выключен: обычный вид, клик включает режим;
 *   — включён:  подсвечена (ds-toggle-button--selected), клик выключает режим.
 *
 * Включение — только режим (текст в поле не трогаем).
 * Выключение — снимаем блокировку и убираем PLAN_PROMPT из поля, если он там.
 */
const state = require('./state');
const chatInput = require('./chat-input');
const { PLAN_PROMPT } = require('./commands/registry');

const CONTAINER_SELECTOR = '._58b31c9';
const BTN_CLASS = 'cuckoo-plan-toggle';
const STYLE_ID = 'cuckoo-plan-toggle-style';

let started = false;
let boundContainer = null;

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
    '<span class="_6dbc175">План</span>' +
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

function toggle() {
  state.planMode = !state.planMode;
  if (!state.planMode) clearPlanPromptFromInput();
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

function startWatch() {
  if (started) return;
  started = true;
  try {
    const mo = new MutationObserver(() => bind());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
  setInterval(bind, 1500);
  bind();
}

module.exports = { startWatch, syncState, toggle, BTN_CLASS };
