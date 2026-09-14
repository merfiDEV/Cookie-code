/**
 * Скрытие служебных сообщений в чате (stealth mode).
 *
 * Cookie Code отправляет в чат служебные сообщения: результаты выполнения
 * инструментов (【工具执行结果】…), JS-сводки (【JS 执行结果汇总】…),
 * системный промпт при инициализации проекта и т.п. Они нужны AI, но
 * загромождают UI. Этот модуль:
 *   1. находит пользовательские «пузыри» с такими сообщениями по маркерам;
 *   2. скрывает их классом .cuckoo-hidden-msg (display:none !important) —
 *      узлы остаются в DOM, поэтому textContent-детекторы (isUserMessage,
 *      обработка истории после перезагрузки) продолжают работать;
 *   3. держит MutationObserver + периодический пересканинг, чтобы скрывать
 *      новые сообщения сразу после отправки и восстанавливать скрытие
 *      после перезагрузки страницы.
 *
 * Переключается настройкой hideSystemMessages (Settings → Cookie Code),
 * состояние живёт в state.hideSystemMessages и меняется на лету.
 */
const state = require('./state');
const { safe } = require('./safe');

const STYLE_ID = 'cuckoo-stealth-style';

/**
 * Маркеры служебных сообщений (поиск по подстроке в тексте пузыря).
 * Все сообщения, которые Cookie Code отправляет сам, начинаются с одного
 * из этих фрагментов либо содержат их в первых строках.
 */
const SERVICE_MARKERS = [
  '【工具执行结果】',            // результаты tool-вызовов (sendToolResultToChat)
  '【JS 执行结果汇总】',          // JS-сводки (sendCombinedJsResultsToChat)
  '【MCP 配置已更新】',           // MCP-информация после сохранения конфига
  '# 身份与能力',                // заголовок системного промпта (шаблоны src/prompt)
  '你是一个由 Cookie Code 驱动的 AI 编程助手', // первая строка системного промпта
  '我已选择目录：',              // легаси-инициализация (дерево каталогов)
  '系统提示词：',                // легаси-инициализация
  '工具使用规则：',              // легаси-инициализация
  '不要使用 XML invoke 格式',     // подсказка AI про cuckoo-формат
];

/**
 * Окно поиска маркера от начала сообщения (в символах).
 * Все служебные сообщения Cookie Code начинаются с маркера в первых
 * символах (самый «глубокий» случай — подсказка про XML-формат,
 * маркер на ~26-й позиции). Ограничение окна защищает от ложного
 * скрытия ответов AI, цитирующих маркер в середине длинной реплики.
 */
const MARKER_WINDOW = 200;

/**
 * Проверить, является ли текст служебным сообщением Cookie Code.
 * Маркер должен встретиться в первых MARKER_WINDOW символах.
 * @param {string} text
 * @returns {boolean}
 */
function isServiceText(text) {
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, MARKER_WINDOW);
  return SERVICE_MARKERS.some((m) => head.indexOf(m) !== -1);
}

/**
 * Является ли элемент пользовательским «пузырём» (а не ответом AI).
 *
 * Логика повторяет канонический детектор provider.isUserMessage
 * (src/providers/deepseek.js): role-атрибуты, классы user-message /
 * message-user / human и легаси-текстовые маркеры. ВАЖНО: признаком AI
 * считается только .ds-markdown, являющийся ПРЯМЫМ дочерним узлом реплики
 * (как в provider.getMessageMarkdown — `:scope > .ds-markdown`). Поиск по
 * всем потомкам (`el.querySelector('.ds-markdown')`) в новых версиях
 * DeepSeek давал ложные срабатывания: пользовательские пузыри (особенно
 * результаты инструментов с JSON-нагрузкой) тоже рендерятся с markdown-
 * контейнерами внутри, из-за чего служебные сообщения не скрывались.
 * @param {Element} el
 * @returns {boolean}
 */
function isUserBubble(el) {
  if (!el || typeof el.querySelector !== 'function') return false;
  try {
    // Ответ AI: .ds-markdown — прямой потомок реплики (канонический признак)
    if (el.querySelector(':scope > .ds-markdown')) return false;
  } catch (_) { /* мок в тестах без querySelector — считаем пузырём */ }
  for (let n = el; n; n = n.parentElement) {
    const role = n.getAttribute && (n.getAttribute('data-role') || n.getAttribute('data-author'));
    const roleLc = String(role || '').toLowerCase();
    if (roleLc === 'user' || roleLc === 'human') return true;
    if (roleLc === 'assistant' || roleLc === 'ai' || roleLc === 'bot') return false;
    const cls = typeof n.className === 'string' ? n.className.toLowerCase() : '';
    if (cls) {
      if (cls.indexOf('user-message') !== -1 || cls.indexOf('message-user') !== -1 || cls.indexOf('human') !== -1) return true;
      if (cls.indexOf('ai-message') !== -1 || cls.indexOf('assistant') !== -1) return false;
    }
  }
  // Легаси-инициализация: текстовые маркеры (как в provider.isUserMessage)
  try {
    const head = String(el.textContent || '').trim().slice(0, 200);
    if (head.indexOf('我已选择目录：') !== -1 || head.indexOf('系统提示词：') !== -1 || head.indexOf('工具使用规则：') !== -1) return true;
  } catch (_) { /* без textContent — пропускаем */ }
  return true;
}

/**
 * Скрыть элемент и «пустые» обёртки над ним (до 3 уровней), чтобы в чате
 * не оставалось пустных блоков с отступами.
 * @param {Element} el
 * @returns {boolean}
 */
function hideMessageEl(el) {
  if (!el) return false;
  if (el.classList) el.classList.add('cuckoo-hidden-msg');
  if (el.setAttribute) el.setAttribute('data-cuckoo-hidden', '1');

  let node = el;
  for (let depth = 0; depth < 3; depth++) {
    const parent = node.parentElement || node.parentNode;
    if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;
    const children = parent.children || [];
    let otherElements = 0;
    for (let i = 0; i < children.length; i++) {
      if (children[i] !== node) otherElements++;
    }
    // собственный текстовый контент обёртки (вне вложенных элементов)
    let ownText = '';
    const childNodes = parent.childNodes || [];
    for (let i = 0; i < childNodes.length; i++) {
      const n = childNodes[i];
      if (n.nodeType === 3 && n.nodeValue) ownText += n.nodeValue;
    }
    if (otherElements === 0 && !ownText.trim()) {
      if (parent.classList) parent.classList.add('cuckoo-hidden-msg');
      node = parent;
    } else {
      break;
    }
  }
  return true;
}

/**
 * Селекторы кандидатов: основная реплика DeepSeek (.ds-message) плюс
 * специализированные контейнеры пользовательских сообщений, которые
 * встречаются в новых версиях UI (role-атрибуты и классы user-message).
 */
const CANDIDATE_SELECTORS = ['.ds-message', '[data-role="user"]', '[class*="user-message"]'];

/**
 * Найти служебные пользовательские пузыри внутри root.
 * Кандидаты собираются по всем CANDIDATE_SELECTORS с дедупликацией;
 * вложенные кандидаты, чей предок уже выбран, пропускаются.
 * @param {Document|Element} [root]
 * @returns {Element[]}
 */
function findServiceBubbles(root) {
  return safe('stealth.findServiceBubbles', () => findServiceBubblesInner(root), []);
}

function findServiceBubblesInner(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  const out = [];
  const acceptedSet = new Set();
  const seen = new Set();
  const candidates = [];
  for (const sel of CANDIDATE_SELECTORS) {
    let found = null;
    try {
      found = doc.querySelectorAll(sel);
    } catch (_) { continue; } // селектор не поддержан — пробуем следующий
    if (!found) continue;
    for (const el of found) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      candidates.push(el);
    }
  }
  for (const el of candidates) {
    if (el.classList && el.classList.contains('cuckoo-hidden-msg')) continue;
    // вложенный кандидат, чей предок уже выбран, — пропускаем
    let covered = false;
    for (let p = el.parentElement || el.parentNode; p; p = p.parentElement || p.parentNode) {
      if (acceptedSet.has(p)) { covered = true; break; }
    }
    if (covered) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    if (!isServiceText(text)) continue;
    if (!isUserBubble(el)) continue;
    out.push(el);
    acceptedSet.add(el);
  }
  return out;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = '.cuckoo-hidden-msg { display: none !important; }';
  document.head.appendChild(style);
}

let scanTimer = null;
let pollTimer = null;

/**
 * Разовый перескан: скрыть все найденные служебные пузыри.
 * Ничего не делает, если hideSystemMessages выключен.
 */
function scanAndHide() {
  safe('stealth.scanAndHide', () => {
    if (state.hideSystemMessages === false) return;
    const bubbles = findServiceBubbles(document);
    for (const el of bubbles) hideMessageEl(el);
  });
}

function throttledScan() {
  if (scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    try { scanAndHide(); } catch (err) {
      console.error('[Cookie Code] stealth scan error:', err.message);
    }
  }, 400);
}

/**
 * Запустить наблюдатель скрытия служебных сообщений.
 * Безопасно вызывать повторно (защита от двойного старта).
 */
function startStealthWatcher() {
  if (pollTimer) return; // уже запущен
  safe('stealth.startStealthWatcher.ensureStyles', () => ensureStyles());
  scanAndHide();

  safe('stealth.startStealthWatcher.observe', () => {
    const observer = new MutationObserver(throttledScan);
    const target = document.body || document.documentElement;
    if (target) observer.observe(target, { childList: true, subtree: true });
  });

  // Поллинг-страховка: сообщение появляется в DOM не одним узлом,
  // а по мере рендера; периодический проход добирает «хвосты».
  pollTimer = setInterval(() => { scanAndHide(); }, 3000);
}

/**
 * Остановить наблюдатель (для тестов).
 */
function stopStealthWatcher() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
}

module.exports = {
  SERVICE_MARKERS,
  isServiceText,
  isUserBubble,
  hideMessageEl,
  findServiceBubbles,
  scanAndHide,
  startStealthWatcher,
  stopStealthWatcher,
};
