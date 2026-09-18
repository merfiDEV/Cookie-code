/**
 * Подсчёт сообщений для статистики дашборда.
 *
 * Точка учёта — появление новых .ds-message в DOM:
 *   - пользовательские сообщения (не служебные, отправленные Cookie Code) → role: 'user';
 *   - ответы AI                                                             → role: 'ai'.
 *
 * Идемпотентность:
 *   1) WeakSet 'counted' — один DOM-узел учитывается один раз;
 *   2) хэш (role + индекс + текст) уходит в main-процесс, где дедуплицируется —
 *      повторный рендер диалога (SPA-навигация туда-обратно) не раздувает счётчики.
 *
 * Служебные сообщения Cookie Code (результаты инструментов, сводки JS, контекст)
 * не считаются пользовательскими.
 */
const { getProviderByUrl } = require("../../../src/providers");
const statsRecorder = require("./stats-recorder");

const MSG_SELECTOR = ".ds-message";
// Даём сообщению немного времени наполниться контентом после появления узла.
const COUNT_DELAY_MS = 400;

const counted = new WeakSet();
let observer = null;
let started = false;
let scanTimer = null;

/** Служебные сообщения, отправленные Cookie Code (не «пользователь»). */
function isServiceText(text) {
  const head = (text || "").slice(0, 60);
  return (
    head.indexOf("【工具执行结果】") !== -1 ||
    head.indexOf("【JS 执行结果汇总】") !== -1 ||
    head.indexOf("【КОНТЕКСТ ИЗ ПРЕДЫДУЩЕГО ЧАТА】") !== -1 ||
    head.indexOf("【Контекст") !== -1
  );
}

/** Текст сообщения без кнопок/тулбаров/заголовков код-блоков. */
function messageText(node) {
  if (!node) return "";
  try {
    const clone = node.cloneNode(true);
    clone
      .querySelectorAll(
        'button, [class*="toolbar"], [class*="copy"], [class*="download"], [class*="code-block-header"], [class*="lang"], [class*="header"]',
      )
      .forEach((el) => el.remove && el.remove());
    return (clone.textContent || "").trim();
  } catch (_) {
    return "";
  }
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h.toString(36) + ":" + s.length.toString(36);
}

function countNode(node) {
  if (!node || counted.has(node)) return;
  try {
    const provider = getProviderByUrl(window.location.href);
    if (!provider) return;
    const text = messageText(node);
    if (!text) return;
    const isUser =
      typeof provider.isUserMessage === "function"
        ? provider.isUserMessage(node)
        : false;
    counted.add(node);
    if (isUser && isServiceText(text)) return; // служебное — не считаем

    // Индекс среди .ds-message — стабилен при перерендере, поэтому попадает
    // в хэш: одинаковый текст двух разных сообщений не склеится в одно.
    let idx = -1;
    try {
      idx = Array.prototype.indexOf.call(
        document.querySelectorAll(MSG_SELECTOR),
        node,
      );
    } catch (_) {}

    // Хэш без текста: индекс в списке сообщений стабилен при перерендере,
    // а текст растёт по мере стриминга — иначе одна и та же AI-реплика
    // учитывалась бы несколько раз (короткая версия, полная версия и т.д.).
    const role = isUser ? "user" : "ai";
    const hash = hashStr(role + "|" + idx);
    statsRecorder.recordMessage(role, { hash });
  } catch (_) {}
}

function scanAll() {
  try {
    document.querySelectorAll(MSG_SELECTOR).forEach(countNode);
  } catch (_) {}
}

function scheduleScan() {
  if (scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    scanAll();
  }, COUNT_DELAY_MS);
}

// Периодический fallback: узлы .ds-message могут появляться пустыми и
// наполняться позже (стриминг ответа) — MutationObserver такое не ловит.
const FALLBACK_INTERVAL_MS = 3000;

/** Запуск: первичный скан + наблюдение за DOM + fallback-опрос. */
function start() {
  if (started) return;
  started = true;

  scanAll();

  try {
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (!m.addedNodes || m.addedNodes.length === 0) continue;
        for (const n of m.addedNodes) {
          if (!(n instanceof Element)) continue;
          if (
            n.matches(MSG_SELECTOR) ||
            (n.querySelector && n.querySelector(MSG_SELECTOR))
          ) {
            scheduleScan();
            break;
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (_) {}

  // Fallback-опрос: покрывает случай «узел добавлен пустым, наполнился позже».
  try {
    setInterval(scanAll, FALLBACK_INTERVAL_MS);
  } catch (_) {}

  // Смена URL (SPA-навигация между чатами) — перепроверяем DOM.
  window.addEventListener("popstate", scanAll);
  window.addEventListener("hashchange", scanAll);
}

module.exports = { start, scanAll };
