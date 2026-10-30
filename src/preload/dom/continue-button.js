/**
 * Автоклик по кнопке «Продолжить» (continueGenerationButton).
 *
 * DeepSeek показывает кнопку, когда ответ оборвался (INCOMPLETE / localInterrupted).
 * У кнопки стоит защита: обработчик срабатывает только при e.nativeEvent.isTrusted,
 * поэтому синтетический el.click() игнорируется. Кликаем реальным вводом через
 * main-процесс (webContents.sendInputEvent по координатам) — событие получается
 * isTrusted=true.
 *
 * Проверка раз в 5 секунд, работает всегда в фоне.
 */

const CHECK_INTERVAL = 5000;
// Не кликать повторно по той же кнопке чаще, чем раз в N мс.
const CLICK_COOLDOWN = 15000;

// Тексты кнопки на разных языках интерфейса DeepSeek.
const LABELS = ["Продолжить", "Continue"];

let timer = null;
let lastClickAt = 0;
let lastBtn = null;

/** Проверить, что элемент реально виден на экране. */
function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (rect.bottom < 0 || rect.right < 0) return false;
  if (rect.top > window.innerHeight || rect.left > window.innerWidth)
    return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  if (Number(style.opacity) === 0) return false;
  return true;
}

/** Кнопка не заблокирована. */
function isEnabled(el) {
  if (!el) return false;
  if (el.disabled) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  return !el.classList.contains("ds-button--disabled");
}

/** Кнопка принадлежит нашему оверлею (не трогаем её). */
function isOwnOverlayButton(el) {
  if (!el) return false;
  if (el.closest('[id^="cuckoo-"]')) return true;
  if (el.classList && el.classList.contains("cuckoo-btn")) return true;
  return false;
}

/** Найти видимую кнопку «Продолжить». Возвращает последнюю (свежее сообщение). */
function findContinueButton() {
  const buttons = document.querySelectorAll("button");
  let found = null;
  for (const btn of buttons) {
    const text = (btn.textContent || "").trim();
    if (!text) continue;
    const match = LABELS.some((l) => text === l);
    if (!match) continue;
    if (isOwnOverlayButton(btn)) continue;
    if (!isVisible(btn) || !isEnabled(btn)) continue;
    found = btn; // берём последнюю подходящую
  }
  return found;
}

/** Один проход проверки. */
async function tick() {
  try {
    if (!window.electronAPI || typeof window.electronAPI.clickAt !== "function")
      return;

    const btn = findContinueButton();
    if (!btn) {
      lastBtn = null;
      return;
    }

    // Кулдаун: та же кнопка недавно кликалась — пропускаем.
    const now = Date.now();
    if (btn === lastBtn && now - lastClickAt < CLICK_COOLDOWN) return;

    const rect = btn.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);

    lastBtn = btn;
    lastClickAt = now;
    console.log("[Cookie Code] Автоклик «Продолжить» в (" + x + "," + y + ")");
    await window.electronAPI.clickAt(x, y);
  } catch (err) {
    console.warn("[Cookie Code] continue-button tick error:", err.message);
  }
}

/** Запустить фоновую проверку (идемпотентно). */
function start() {
  if (timer) return;
  timer = setInterval(() => {
    tick();
  }, CHECK_INTERVAL);
  // Первый проход — чуть позже, чтобы страница успела отрисоваться.
  setTimeout(() => tick(), 3000);
  console.log(
    "[Cookie Code] Автоклик «Продолжить» запущен (каждые " +
      CHECK_INTERVAL +
      "мс)",
  );
}

/** Остановить проверку. */
function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, findContinueButton };
