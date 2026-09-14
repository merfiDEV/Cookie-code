/**
 * Принудительно держит тёмную тему DeepSeek.
 *
 * Детектор: у <body> класс "dark" при тёмной теме (проверено в F12).
 * Если класс пропал (светлая/системная светлая) — кликаем по кнопке
 * темы с текстом «Тёмная» (ru) / «Dark» (en).
 *
 * Работает постоянно: MutationObserver на class <body> + interval-страховка.
 *
 * Все операции с DOM обёрнуты в safe(): при изменении вёрстки на сайте
 * модуль просто пропускает шаг и пишет предупреждение в консоль,
 * не ломая приложение.
 */

const { safe } = require('./safe');

let started = false;
let clicking = false;

/** Кнопка переключения на тёмную тему. */
function findDarkButton() {
  return safe('force-dark-theme.findDarkButton', () => {
    const btns = document.querySelectorAll('div[role="button"], button');
    for (const b of btns) {
      const txt = (b.textContent || '').trim();
      if (txt === 'Тёмная' || txt === 'Dark' || txt === 'Темная') return b;
    }
    return null;
  }, null);
}

/** Тёмная ли сейчас тема. */
function isDark() {
  return safe('force-dark-theme.isDark', () => {
    return document.body && document.body.classList.contains('dark');
  }, false);
}

/** Если тема не тёмная — переключить на тёмную. */
function enforce() {
  if (clicking) return;
  if (isDark()) return;
  const btn = findDarkButton();
  if (!btn) return;
  clicking = true;
  try {
    btn.click();
  } catch (_) {
  } finally {
    // Небольшая пауза, чтобы React успел применить тему и observer не зациклился.
    setTimeout(() => { clicking = false; }, 300);
  }
}

function startWatch() {
  if (started) return;
  started = true;

  // Реакция на смену класса <body> (переключение темы).
  safe('force-dark-theme.observeBody', () => {
    const bodyMo = new MutationObserver(enforce);
    bodyMo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });

  // На случай, если кнопка появляется позже (SPA-перерисовка).
  safe('force-dark-theme.observeDoc', () => {
    const docMo = new MutationObserver(enforce);
    docMo.observe(document.documentElement, { childList: true, subtree: true });
  });

  // Стартовый прогон + интервал-страховка.
  safe('force-dark-theme.enforceStart', enforce);
  setInterval(() => safe('force-dark-theme.enforceInterval', enforce), 1000);
}

module.exports = { startWatch, enforce, isDark };
