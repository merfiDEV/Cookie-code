/**
 * Матовое стекло для поля ввода сообщения DeepSeek (._77cefa5).
 *
 * Работает по тому же принципу, что reasoning-glass.js: backdrop-filter
 * не срабатывает (обёртка лежит внутри виртуализированного списка с
 * transform), поэтому стекло рисует псевдоэлемент ::before самой обёртки
 * _77cefa5, а мы считаем ему размер и позицию так, чтобы фоновая картинка
 * совпадала с фоном страницы и покрывала поле с запасом pad.
 */

const INPUT_SELECTOR = '._77cefa5';
const MIN_PAD = 40;

/**
 * Динамический отступ ::before: не меньше 4× blur, чтобы края размытия
 * полностью скрывались за границей поля (overflow: hidden).
 */
function computePad() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--cuckoo-input-glass-blur').trim();
  const blur = parseFloat(raw) || 12;
  return Math.max(MIN_PAD, Math.ceil(blur * 4));
}

let imgNatural = null; // { w, h } — натуральные размеры фоновой картинки
let pending = false;
let started = false;

function getBgUrl() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--cuckoo-bg-image').trim();
  if (!v || v === 'none') return '';
  const m = v.match(/url\((['"]?)([^'")]+)\1\)/);
  return m ? m[2] : '';
}

function ensureImageLoaded(url) {
  if (!url || imgNatural) return;
  const img = new Image();
  img.onload = () => { imgNatural = { w: img.naturalWidth, h: img.naturalHeight }; schedule(); };
  img.onerror = () => { imgNatural = null; };
  img.src = url;
}

/**
 * Размер картинки в px так, чтобы она покрывала И вьюпорт, И само поле
 * (с запасом pad с каждой стороны). Пропорции сохраняем.
 */
function computeSizeFor(vw, vh, rect, pad) {
  const url = getBgUrl();
  if (!url) return null;
  ensureImageLoaded(url);
  if (!imgNatural || !imgNatural.w || !imgNatural.h) return null;
  const needW = Math.max(vw, rect.width + 2 * pad);
  const needH = Math.max(vh, rect.height + 2 * pad);
  const scale = Math.max(needW / imgNatural.w, needH / imgNatural.h);
  const iw = Math.round(imgNatural.w * scale);
  const ih = Math.round(imgNatural.h * scale);
  return { iw, ih };
}

function positionInputs() {
  const inputs = document.querySelectorAll(INPUT_SELECTOR);
  if (!inputs.length) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = computePad();
  inputs.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    // ::before в координатах вьюпорта: [r.left-pad, r.right+pad] × [r.top-pad, r.bottom+pad].
    const pvLeft = r.left - pad;
    const pvTop = r.top - pad;
    const size = computeSizeFor(vw, vh, r, pad);
    if (!size) return;
    // Базовая позиция — центрирование cover от вьюпорта (совпадает с фоном body).
    const bx = (vw - size.iw) / 2;
    const by = (vh - size.ih) / 2;
    // Позиция картинки внутри ::before (локальные координаты).
    const px = bx - pvLeft;
    const py = by - pvTop;
    el.style.setProperty('--cuckoo-input-pad', pad + 'px');
    el.style.setProperty('--cuckoo-input-bg-size', size.iw + 'px ' + size.ih + 'px');
    el.style.setProperty('--cuckoo-input-bg-pos', px + 'px ' + py + 'px');
  });
}

function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    try { positionInputs(); } catch (_) {}
  });
}

function startWatch() {
  if (started) return;
  started = true;

  // Скролл любого контейнера (в т.ч. виртуализированного списка DeepSeek) — через capture.
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('resize', schedule, { passive: true });

  // Любое появление/удаление элементов (React перерисовывает поле ввода).
  const mo = new MutationObserver(schedule);
  try {
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // Изменение переменной --cuckoo-bg-image (смена фона в настройках).
  const rootMo = new MutationObserver(() => { imgNatural = null; schedule(); });
  try {
    rootMo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  } catch (_) {}

  // Стартовый прогон.
  schedule();
  // Интервал-страховка на случай, если rAF «съедается» React-перерисовками.
  setInterval(schedule, 400);
}

module.exports = { startWatch, schedule };
