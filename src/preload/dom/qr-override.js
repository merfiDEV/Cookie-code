/**
 * Подмена QR-кода в попапе «Скачать приложение» DeepSeek.
 *
 * DeepSeek показывает в меню пользователя пункт «Скачать приложение»,
 * при клике/ховере на который всплывает тултип:
 *
 *   <div class="ds-tooltip ...">
 *     <img src="https://fe-static.deepseek.com/chat/static/qrcode.9cc32b1ee3.svg">
 *     <div class="_9e0c9c6">Сканируйте, чтобы получить DeepSeek App</div>
 *   </div>
 *
 * Модуль перехватывает появление такой картинки и:
 *   1. подменяет src на собственную QR-картинку (base64 из qr-asset.js);
 *   2. заменяет подпись на @TYTA_ZDESYAA777 и делает её ссылкой на Telegram;
 *   3. ставит MutationObserver — срабатывает при каждом открытии тултипа.
 *
 * Все DOM-операции обёрнуты в safe(): при изменении вёрстки DeepSeek
 * модуль просто пропускает шаг и пишет предупреждение в консоль.
 */

const { safe } = require('./safe');

const QR_DATA_URI = require('./qr-asset');

/** Новый текст подписи под QR. */
const NEW_LABEL = '@TYTA_ZDESYAA777';

/** Новый текст пункта меню «Скачать приложение». */
const NEW_MENU_ITEM = { ru: 'Разработчик', en: 'Developer' };

/** Регулярка на исходный текст пункта (RU + EN). */
const MENU_ITEM_RE = /^\s*(Скачать приложение|Download\s+app|Get\s+app)\s*$/i;

/** Определение языка: если на странице русский — RU, иначе EN. */
function pickMenuLabel() {
  const lang = (document.documentElement.lang || '').toLowerCase();
  if (lang.startsWith('en')) return NEW_MENU_ITEM.en;
  // Смотрим на остальные пункты меню: если там «Настройки» — RU, «Settings» — EN
  const menu = document.querySelector('.ds-dropdown-menu');
  if (menu) {
    const txt = menu.textContent || '';
    if (/Настройки|Выйти/.test(txt)) return NEW_MENU_ITEM.ru;
    if (/Settings|Logout|Sign out/.test(txt)) return NEW_MENU_ITEM.en;
  }
  return NEW_MENU_ITEM.ru;
}

/** Ссылка для клика по подписи (без @). */
const TG_URL = 'https://t.me/TYTA_ZDESYAA777';

/** Селекторы кандидатов картинки QR в тултипе DeepSeek. */
const QR_IMG_SELECTORS = [
  '.ds-tooltip img[src*="qrcode" i]',
  '.ds-tooltip img[src*="qr" i]',
  '.ds-floating-container img[src*="qrcode" i]',
  '.ds-floating-container img[src*="qr" i]',
];

/** Селекторы подписи под QR. */
const LABEL_SELECTORS = [
  '.ds-tooltip ._9e0c9c6',
  '.ds-tooltip [class*="caption"]',
  '.ds-tooltip > div:last-child',
];

/** Метка, что картинка уже подменена — чтобы не переписывать её каждый раз. */
const PATCHED_ATTR = 'data-cuckoo-qr-patched';

/**
 * Подменить одну картинку QR: src, alt и (опционально) размеры оставить.
 * @param {HTMLImageElement} img
 */
function patchQrImage(img) {
  if (!img || img.getAttribute(PATCHED_ATTR) === '1') return;
  img.src = QR_DATA_URI;
  img.alt = NEW_LABEL;
  // Гарантируем размер, как у оригинала (160×160 при 264px в тултипе)
  if (!img.style.width) img.style.width = '160px';
  if (!img.style.height) img.style.height = '160px';
  img.setAttribute(PATCHED_ATTR, '1');
  console.log('[Cookie Code] QR: картинка подменена на локальный asset');
}

/**
 * Подменить текст пункта меню «Скачать приложение» на «Разработчик» / «Developer».
 * Идемпотентно — не трогает уже подменённый пункт.
 * @param {Element} menu корень .ds-dropdown-menu
 */
function patchMenuItem(menu) {
  if (!menu || !menu.querySelectorAll) return;
  const options = menu.querySelectorAll('.ds-dropdown-menu-option');
  for (const opt of options) {
    const label = opt.querySelector('.ds-dropdown-menu-option__label');
    if (!label) continue;
    if (label.getAttribute(PATCHED_ATTR) === '1') continue;
    const text = (label.textContent || '').trim();
    if (!MENU_ITEM_RE.test(text)) continue;
    label.textContent = pickMenuLabel();
    label.setAttribute(PATCHED_ATTR, '1');
    console.log('[Cookie Code] QR: пункт меню переименован в "' + label.textContent + '"');
  }
}

/**
 * Заменить подпись под QR и сделать её ссылкой.
 * @param {Element} tooltip корень .ds-tooltip
 */
function patchLabel(tooltip) {
  let label = null;
  for (const sel of LABEL_SELECTORS) {
    try {
      const el = tooltip.querySelector(sel);
      if (el) { label = el; break; }
    } catch (_) {}
  }
  if (!label) return;
  if (label.getAttribute(PATCHED_ATTR) === '1') return;

  // Найти <a> или создать
  let link = null;
  if (label.tagName === 'A') {
    link = label;
  } else {
    link = label.querySelector('a');
  }
  if (!link) {
    link = document.createElement('a');
    link.href = TG_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.cssText = 'color:inherit;text-decoration:none;';
    while (label.firstChild) link.appendChild(label.firstChild);
    label.appendChild(link);
  } else {
    link.href = TG_URL;
  }
  link.textContent = NEW_LABEL;
  label.setAttribute(PATCHED_ATTR, '1');
  console.log('[Cookie Code] QR: подпись заменена на ' + NEW_LABEL);
}

/**
 * Обработать один контейнер тултипа: подменить картинку + подпись.
 * @param {Element} root
 */
function patchTooltip(root) {
  // Подменяем пункт меню «Скачать приложение» → «Разработчик»
  const menus = [];
  if (root.matches && root.matches('.ds-dropdown-menu')) menus.push(root);
  if (root.querySelectorAll) {
    for (const m of root.querySelectorAll('.ds-dropdown-menu')) menus.push(m);
  }
  for (const menu of menus) patchMenuItem(menu);

  const tooltips = [];
  if (root.matches && root.matches('.ds-tooltip')) tooltips.push(root);
  if (root.querySelectorAll) {
    for (const t of root.querySelectorAll('.ds-tooltip')) tooltips.push(t);
  }
  for (const tooltip of tooltips) {
    // Только тултипы с QR
    const img = tooltip.querySelector('img[src*="qrcode" i], img[src*="qr" i]');
    if (!img) continue;
    patchQrImage(img);
    patchLabel(tooltip);
  }
}

/**
 * Просканировать весь документ (первый прогон / периодический).
 */
function scanAll() {
  safe('qr-override.scanAll', () => {
    // Пункт меню «Скачать приложение» → «Разработчик»
    for (const menu of document.querySelectorAll('.ds-dropdown-menu')) {
      patchMenuItem(menu);
    }
    for (const sel of QR_IMG_SELECTORS) {
      let imgs;
      try { imgs = document.querySelectorAll(sel); } catch (_) { continue; }
      for (const img of imgs) {
        const tooltip = img.closest('.ds-tooltip') || img.closest('.ds-floating-container');
        if (tooltip) patchTooltip(tooltip);
        else patchQrImage(img);
      }
    }
  });
}

let started = false;

/**
 * Запустить наблюдение за появлением QR-тултипа.
 */
function startWatch() {
  if (started) return;
  started = true;

  // Стартовый прогон
  scanAll();

  // MutationObserver на появление новых тултипов
  safe('qr-override.startWatch.observe', () => {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          safe('qr-override.mutation', () => patchTooltip(node));
        }
      }
    });
    const target = document.body || document.documentElement;
    if (target) mo.observe(target, { childList: true, subtree: true });
  });

  // Периодическая подстраховка (на случай, если что-то пропустили)
  setInterval(() => scanAll(), 2000);

  console.log('[Cookie Code] qr-override: наблюдение запущено');
}

module.exports = { startWatch, scanAll, patchTooltip, patchQrImage, patchLabel, patchMenuItem, NEW_LABEL, NEW_MENU_ITEM, TG_URL };
