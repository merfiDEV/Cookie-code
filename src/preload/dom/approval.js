/**
 * Подтверждение tool-вызовов (approval gate).
 *
 * Перед выполнением tool-вызова (или JS-блока ```cuckoo) может потребоваться
 * явное подтверждение пользователя. Режим задаётся настройкой
 * toolApprovalMode:
 *   'off'   — выполнять всё автоматически (прежнее поведение)
 *   'risky' — спрашивать только для рискованных инструментов (RISKY_TOOLS)
 *   'all'   — спрашивать для каждого tool-вызова и JS-блока
 *
 * UI — модальная карточка поверх чата (в стиле ask-user-question):
 *   ❌ Отклонить (Esc) / ✅ Разрешить всегда (сессия) / ✅ Разрешить (Enter)
 *
 * Отказ НЕ останавливает агента молча: наружу уходит стандартный
 * «【工具执行结果】 … 执行失败» с признаком denied=true, чтобы AI знал,
 * что вызов отклонён пользователем и не повторял его по своей инициативе.
 */
const state = require('./state');
const { t } = require('../i18n/i18n');

const STYLE_ID = 'cuckoo-approval-style';
const DIALOG_ID = 'cuckoo-approval-dialog';
const POSITION_KEY = 'cuckoo-approval-pos';

/**
 * Инструменты, требующие подтверждения в режиме 'risky'.
 * Имена — как в src/preload/tool-names.js (+ распространённые псевдонимы).
 * Чтение/поиск/todo/справочные MCP-вызовы выполняются без подтверждения.
 */
const RISKY_TOOLS = new Set([
  // shell
  'bash', 'pwsh', 'shell', 'execute_command', 'executeCommand',
  // запись файлов
  'write', 'file_write', 'writeFile', 'edit', 'file_edit', 'editFile',
  'delete_file', 'deleteFile',
  // база данных / сеть / браузер
  'mysql', 'web_fetch', 'webFetch',
  'open_browser_window', 'openBrowserWindow',
  'inject_js', 'injectJS',
  // внешние исполнения
  'mcp_call', 'mcpCall', 'skill_execute', 'skillExecute',
]);

/** Признак отказа, встраиваемый в текст ошибки для AI. */
const DENIED_TOOL_ERROR =
  'Пользователь отклонил этот tool-вызов (User denied this tool call). ' +
  'Не вызывай его повторно без явной просьбы пользователя — уточни, как действовать дальше.';
const DENIED_JS_ERROR =
  'Пользователь отклонил выполнение этого JS-блока (User denied this JS block). ' +
  'Не выполняй его повторно без явной просьбы пользователя — уточни, как действовать дальше.';

/**
 * Определить по тексту ошибки, что вызов был отклонён пользователем
 * (используется при формировании сообщения, возвращаемого в чат).
 * @param {string} errText
 * @returns {boolean}
 */
function isDenialError(errText) {
  const s = String(errText || '');
  return s.indexOf('отклонил') !== -1 || s.indexOf('User denied') !== -1;
}

/**
 * Относится ли инструмент к «рискованным» (режим 'risky').
 * @param {string} toolName
 * @returns {boolean}
 */
function isRiskyTool(toolName) {
  return RISKY_TOOLS.has(String(toolName || ''));
}

/**
 * Нужен ли запрос подтверждения для данного инструмента в указанном режиме.
 * @param {string} toolName
 * @param {string} mode 'off' | 'risky' | 'all'
 * @returns {boolean}
 */
function needsApproval(toolName, mode) {
  if (mode === 'all') return true;
  if (mode === 'risky') return isRiskyTool(toolName);
  return false;
}

// ===== Память «разрешено до перезагрузки» (кнопка «Разрешить всегда») =====
const sessionAllowedTools = new Set();

/**
 * Разрешён ли инструмент кнопкой «Разрешить всегда» в текущей сессии.
 * @param {string} toolName
 * @returns {boolean}
 */
function isSessionAllowed(toolName) {
  return sessionAllowedTools.has(String(toolName || ''));
}

/**
 * Запомнить разрешение инструмента до перезагрузки страницы.
 * @param {string} toolName
 */
function rememberSessionAllowed(toolName) {
  sessionAllowedTools.add(String(toolName || ''));
}

/**
 * Сбросить сессионные разрешения (для тестов).
 */
function resetSessionAllowances() {
  sessionAllowedTools.clear();
}

// ===== Очередь запросов подтверждения (FIFO) =====
let queueTail = Promise.resolve();
let activeCancel = null;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${DIALOG_ID} { position:fixed; inset:0; z-index:2147483647; display:flex; align-items:center; justify-content:center; background:rgba(5,8,18,.62); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    #${DIALOG_ID} .cuckoo-approval-card { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(600px,calc(100vw - 32px)); max-height:calc(100vh - 32px); overflow:auto; padding:20px 22px; color:#eef1ff; background:#171b2c; border:1px solid rgba(145,158,255,.42); border-radius:12px; box-shadow:0 20px 70px rgba(0,0,0,.55); box-sizing:border-box; }
    #${DIALOG_ID} .cuckoo-approval-drag { margin:-20px -22px 14px; padding:16px 22px 0; cursor:move; user-select:none; }
    #${DIALOG_ID} h2 { margin:0 0 6px; font-size:17px; }
    #${DIALOG_ID} .cuckoo-approval-sub { margin:0 0 14px; color:#aeb5cd; font-size:12px; }
    #${DIALOG_ID} .cuckoo-approval-name { display:inline-block; padding:3px 10px; margin-bottom:12px; border-radius:6px; background:rgba(139,147,255,.16); border:1px solid rgba(139,147,255,.4); color:#c3caff; font-family:"Consolas",monospace; font-size:13px; font-weight:600; }
    #${DIALOG_ID} .cuckoo-approval-label { margin:0 0 6px; color:#8a90b8; font-size:12px; text-transform:uppercase; letter-spacing:.5px; }
    #${DIALOG_ID} pre { margin:0 0 14px; padding:12px; max-height:220px; overflow:auto; background:#0f1322; border:1px solid rgba(255,255,255,.12); border-radius:8px; color:#d6dbff; font-family:"Consolas",monospace; font-size:12px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
    #${DIALOG_ID} .cuckoo-approval-actions { display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; }
    #${DIALOG_ID} button { padding:9px 16px; border:0; border-radius:7px; color:#fff; cursor:pointer; font-weight:600; font-size:13px; }
    #${DIALOG_ID} .cuckoo-approval-approve { background:#6574ee; }
    #${DIALOG_ID} .cuckoo-approval-approve:hover { background:#7785ff; }
    #${DIALOG_ID} .cuckoo-approval-always { background:rgba(101,116,238,.16); border:1px solid rgba(101,116,238,.55) !important; color:#aab5ff; }
    #${DIALOG_ID} .cuckoo-approval-always:hover { background:rgba(101,116,238,.3); }
    #${DIALOG_ID} .cuckoo-approval-deny { background:rgba(255,107,122,.16); border:1px solid rgba(255,107,122,.5) !important; color:#ff9aa5; }
    #${DIALOG_ID} .cuckoo-approval-deny:hover { background:rgba(255,107,122,.3); }
  `;
  document.head.appendChild(style);
}

/**
 * Показать модальную карточку подтверждения.
 * @param {{kind:'tool'|'js', toolName?:string, params?:object, code?:string}} info
 * @returns {Promise<{approved:boolean, alwaysAllow:boolean}>}
 */
function requestApproval(info) {
  ensureStyles();
  // На случай «висящего» диалога (не должен случаться благодаря очереди)
  const old = document.getElementById(DIALOG_ID);
  if (old) old.remove();

  return new Promise((resolve) => {
    const isJs = info.kind === 'js';
    const dialog = document.createElement('div');
    dialog.id = DIALOG_ID;

    const title = t(isJs ? 'approval.title.js' : 'approval.title.tool');
    const nameText = isJs ? t('approval.name.js') : String(info.toolName || '');
    const detailText = isJs
      ? String(info.code || '')
      : JSON.stringify(info.params || {}, null, 2);

    dialog.innerHTML =
      '<div class="cuckoo-approval-card" role="dialog" aria-modal="true">' +
      '<div class="cuckoo-approval-drag"><h2>' + escapeHtml(title) + '</h2></div>' +
      '<p class="cuckoo-approval-sub">' + escapeHtml(t('approval.subtitle')) + '</p>' +
      '<span class="cuckoo-approval-name">' + escapeHtml(nameText) + '</span>' +
      '<p class="cuckoo-approval-label">' + escapeHtml(isJs ? t('approval.label.code') : t('approval.label.params')) + '</p>' +
      '<pre></pre>' +
      '<div class="cuckoo-approval-actions">' +
      '<button type="button" class="cuckoo-approval-deny">' + escapeHtml(t('approval.deny')) + '</button>' +
      (isJs ? '' : '<button type="button" class="cuckoo-approval-always">' + escapeHtml(t('approval.always', { name: nameText })) + '</button>') +
      '<button type="button" class="cuckoo-approval-approve">' + escapeHtml(t('approval.approve')) + '</button>' +
      '</div>' +
      '</div>';

    dialog.querySelector('pre').textContent = detailText;
    document.body.appendChild(dialog);

    const card = dialog.querySelector('.cuckoo-approval-card');
    const dragHandle = dialog.querySelector('.cuckoo-approval-drag');
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
      if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
        card.style.left = saved.left + 'px';
        card.style.top = saved.top + 'px';
        card.style.transform = 'none';
      }
    } catch (_) {}

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const onMove = (event) => {
      if (!dragging) return;
      const rect = card.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - rect.height);
      const left = Math.max(0, Math.min(maxLeft, startLeft + event.clientX - startX));
      const top = Math.max(0, Math.min(maxTop, startTop + event.clientY - startY));
      card.style.left = left + 'px';
      card.style.top = top + 'px';
      card.style.transform = 'none';
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      try {
        const rect = card.getBoundingClientRect();
        localStorage.setItem(POSITION_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
      } catch (_) {}
    };
    dragHandle.addEventListener('mousedown', (event) => {
      dragging = true;
      const rect = card.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      startX = event.clientX;
      startY = event.clientY;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      event.preventDefault();
    });

    const finish = (approved, alwaysAllow) => {
      activeCancel = null;
      onUp();
      document.removeEventListener('keydown', onKey, true);
      dialog.remove();
      resolve({ approved: !!approved, alwaysAllow: !!alwaysAllow });
    };
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false, false); }
      else if (event.key === 'Enter') { event.preventDefault(); finish(true, false); }
    };
    document.addEventListener('keydown', onKey, true);
    activeCancel = () => finish(false, false);

    dialog.querySelector('.cuckoo-approval-approve').addEventListener('click', () => finish(true, false));
    const alwaysBtn = dialog.querySelector('.cuckoo-approval-always');
    if (alwaysBtn) alwaysBtn.addEventListener('click', () => finish(true, true));
    dialog.querySelector('.cuckoo-approval-deny').addEventListener('click', () => finish(false, false));

    dialog.querySelector('.cuckoo-approval-approve').focus();
  });
}

/**
 * Запросить подтверждение, если того требует текущий режим
 * (state.toolApprovalMode) и память сессии.
 * @param {{kind:'tool'|'js', toolName?:string, params?:object, code?:string}} info
 * @returns {Promise<{approved:boolean, alwaysAllow:boolean}>}
 */
async function requestApprovalIfNeeded(info) {
  const mode = state.toolApprovalMode || 'off';
  if (mode === 'off') return { approved: true };

  if (info.kind === 'tool') {
    if (!needsApproval(info.toolName, mode)) return { approved: true };
    if (isSessionAllowed(info.toolName)) return { approved: true };
  }

  // FIFO: одновременно показываем одну карточку и один Telegram-запрос.
  const run = async () => {
    const requestId = 'approval_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const local = requestApproval(info);
    let remoteResolve;
    const remote = new Promise((resolve) => { remoteResolve = resolve; });
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (api && typeof api.telegramApprovalRequest === 'function') {
      Promise.resolve(api.telegramApprovalRequest(requestId, info)).then((remoteResult) => {
        if (remoteResult && remoteResult.success && typeof remoteResult.approved === 'boolean') {
          remoteResolve(remoteResult);
        }
      }).catch(() => {});
    }

    const winner = await Promise.race([
      local.then((localResult) => ({ source: 'local', result: localResult })),
      remote.then((remoteResult) => ({ source: 'remote', result: remoteResult })),
    ]);
    if (winner.source === 'remote') {
      if (typeof activeCancel === 'function') activeCancel();
      return { approved: !!winner.result.approved, alwaysAllow: false };
    }
    if (api && typeof api.telegramApprovalCancel === 'function') {
      Promise.resolve(api.telegramApprovalCancel(requestId)).catch(() => {});
    }
    return winner.result;
  };
  const result = queueTail.then(run, run);
  queueTail = result.then(
    () => undefined,
    () => undefined
  );
  const res = await result;
  if (res && res.approved && res.alwaysAllow && info.kind === 'tool') {
    rememberSessionAllowed(info.toolName);
  }
  return res;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value || '');
  return div.innerHTML;
}

module.exports = {
  RISKY_TOOLS,
  DENIED_TOOL_ERROR,
  DENIED_JS_ERROR,
  isDenialError,
  isRiskyTool,
  needsApproval,
  isSessionAllowed,
  rememberSessionAllowed,
  resetSessionAllowances,
  requestApproval,
  cancelActiveApproval: () => { if (typeof activeCancel === 'function') activeCancel(); },
  requestApprovalIfNeeded,
};
