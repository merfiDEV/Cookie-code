/**
 * Whats-new модалка: показывает список нововведений после обновления.
 *
 * Триггерится из main-процесса через IPC 'whats-new-show'.
 * Рендерится минимальный markdown: ### заголовки, **bold**, - списки.
 * Кнопки: «Показать CHANGELOG» (открывает файл) и «Ок, спасибо» (закрывает).
 *
 * Показ происходит один раз за сессию: main присылает событие только
 * один раз (см. whats-new.js → consumePendingForWindow).
 */
const { ipcRenderer } = require('electron');

const MODAL_ID = 'cuckoo-whats-new-modal';
const STYLE_ID = 'cuckoo-whats-new-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    '#' + MODAL_ID + ' { position: fixed; inset: 0; z-index: 2147483600;',
    '  background: rgba(6,8,18,0.72); display: flex; align-items: center; justify-content: center;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }',
    '#' + MODAL_ID + ' .wn-card { background: #141726; border: 1px solid rgba(139,147,255,0.35);',
    '  border-radius: 14px; max-width: 640px; width: 92%; max-height: 80vh; display: flex;',
    '  flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.6); color: #dde1ff; }',
    '#' + MODAL_ID + ' .wn-head { padding: 18px 22px; border-bottom: 1px solid rgba(255,255,255,0.07);',
    '  display: flex; justify-content: space-between; align-items: center; }',
    '#' + MODAL_ID + ' .wn-title { font-size: 17px; font-weight: 700; color: #eef0ff; }',
    '#' + MODAL_ID + ' .wn-sub { font-size: 12px; color: #8a90b8; margin-top: 4px; }',
    '#' + MODAL_ID + ' .wn-body { flex: 1; overflow: auto; padding: 16px 22px; font-size: 13.5px;',
    '  line-height: 1.6; }',
    '#' + MODAL_ID + ' .wn-body h3 { font-size: 14px; margin: 16px 0 6px; color: #bec2ff; font-weight: 700; }',
    '#' + MODAL_ID + ' .wn-body h3:first-child { margin-top: 0; }',
    '#' + MODAL_ID + ' .wn-body strong { color: #dde1ff; }',
    '#' + MODAL_ID + ' .wn-body ul { margin: 4px 0 10px; padding-left: 20px; }',
    '#' + MODAL_ID + ' .wn-body li { margin: 3px 0; }',
    '#' + MODAL_ID + ' .wn-body em { color: #8a90b8; }',
    '#' + MODAL_ID + ' .wn-foot { padding: 12px 20px; border-top: 1px solid rgba(255,255,255,0.07);',
    '  display: flex; gap: 8px; justify-content: flex-end; }',
    '#' + MODAL_ID + ' .wn-btn { padding: 9px 16px; border-radius: 10px; font-weight: 600;',
    '  font-size: 13px; cursor: pointer; border: 1px solid rgba(139,147,255,0.4);',
    '  background: rgba(139,147,255,0.1); color: #a8afff; transition: all 0.18s ease; }',
    '#' + MODAL_ID + ' .wn-btn:hover { background: rgba(139,147,255,0.24); color: #fff; }',
    '#' + MODAL_ID + ' .wn-btn-primary { background: linear-gradient(90deg,#8b93ff,#5b63d6);',
    '  color: #fff; border-color: transparent; }',
    '#' + MODAL_ID + ' .wn-btn-primary:hover { filter: brightness(1.1); }',
    '#' + MODAL_ID + ' .wn-btn[disabled] { opacity: 0.45; cursor: not-allowed; }',
    '#' + MODAL_ID + ' .wn-btn[disabled]:hover { background: rgba(139,147,255,0.1); color: #a8afff; transform: none; filter: none; }',
    '#' + MODAL_ID + ' .wn-btn-primary[disabled]:hover { background: linear-gradient(90deg,#8b93ff,#5b63d6); color: #fff; filter: none; }',
  ].join('\n');
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Минимальный рендер markdown → HTML.
 * Поддерживает: ### заголовки, **bold**, _italic_, - списки, пустые строки.
 * Этого достаточно для нашего CHANGELOG.
 */
function renderMarkdown(md) {
  const lines = String(md || '').split(/\r?\n/);
  const out = [];
  let inList = false;

  const inline = (t) => escapeHtml(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)_([^_]+)_(\s|$)/g, '$1<em>$2</em>$3');

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line) {
      if (inList) { out.push('</ul>'); inList = false; }
      continue;
    }
    const mH = line.match(/^###\s+(.+)$/);
    if (mH) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<h3>' + inline(mH[1]) + '</h3>');
      continue;
    }
    const mI = line.match(/^\s*[-*]\s+(.+)$/);
    if (mI) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + inline(mI[1]) + '</li>');
      continue;
    }
    // Обычная строка
    if (inList) { out.push('</ul>'); inList = false; }
    out.push('<div>' + inline(line) + '</div>');
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function close() {
  const m = document.getElementById(MODAL_ID);
  if (m) m.remove();
}

// Сколько миллисекунд пользователь не может закрыть модалку (защита от
// «пролистал не глядя»). Кнопки становятся кликабельными после отсчёта.
const CLOSE_LOCK_MS = 3000;

/**
 * Показать модалку whats-new.
 * Текст рендерится сразу; закрытие блокируется на CLOSE_LOCK_MS мс,
 * чтобы пользователь успел прочитать нововведения.
 * @param {{from: string, to: string, markdown: string}} payload
 */
function show(payload) {
  ensureStyles();
  close(); // на всякий случай — не должно быть открыто

  const from = payload && payload.from ? payload.from : null;
  const to = payload && payload.to ? payload.to : '';
  const md = payload && payload.markdown ? payload.markdown : '';
  const subtitle = from
    ? 'Обновление ' + from + ' → ' + to
    : 'Новая версия ' + to;

  const modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.innerHTML =
    '<div class="wn-card">' +
      '<div class="wn-head">' +
        '<div>' +
          '<div class="wn-title">🎉 Что нового в Cookie Code v' + escapeHtml(to) + '</div>' +
          '<div class="wn-sub">' + escapeHtml(subtitle) + '</div>' +
        '</div>' +
        '<button class="wn-btn" data-act="close" disabled>' +
          '<span data-role="close-icon">✕</span>' +
        '</button>' +
      '</div>' +
      '<div class="wn-body">' + renderMarkdown(md) + '</div>' +
      '<div class="wn-foot">' +
        '<button class="wn-btn" data-act="changelog">📄 Показать CHANGELOG</button>' +
        '<button class="wn-btn wn-btn-primary" data-act="close" disabled>' +
          '<span data-role="close-label">Ок, спасибо</span>' +
        '</button>' +
      '</div>' +
    '</div>';

  // ---- Блокировка закрытия на CLOSE_LOCK_MS ----
  let locked = true;
  const lockUntil = Date.now() + CLOSE_LOCK_MS;

  const closeIconEl = modal.querySelector('[data-role="close-icon"]');
  const closeLabelEl = modal.querySelector('[data-role="close-label"]');
  const closeBtns = modal.querySelectorAll('[data-act="close"]');

  const tick = () => {
    const left = Math.max(0, lockUntil - Date.now());
    if (left > 0) {
      const sec = Math.ceil(left / 1000);
      if (closeLabelEl) closeLabelEl.textContent = 'Прочитайте — ' + sec + '…';
    } else {
      locked = false;
      if (closeIconEl) closeIconEl.textContent = '✕';
      if (closeLabelEl) closeLabelEl.textContent = 'Ок, спасибо';
      closeBtns.forEach((b) => { b.disabled = false; b.removeAttribute('disabled'); });
      return;
    }
    setTimeout(tick, 100);
  };
  tick();

  // Заблокировать Esc на время лока
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      if (locked) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      close();
      document.removeEventListener('keydown', escHandler, true);
    }
  };
  document.addEventListener('keydown', escHandler, true);

  // Клик по кнопкам / вне карточки
  modal.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t || !t.closest) return;

    // Клик вне карточки — попытка закрыть
    const card = t.closest('.wn-card');
    if (!card) {
      if (!locked) { close(); document.removeEventListener('keydown', escHandler, true); }
      return;
    }

    const btn = t.closest('[data-act]');
    if (!btn) return;
    if (btn.disabled) return;

    const act = btn.getAttribute('data-act');
    if (act === 'close') {
      if (locked) return;
      close();
      document.removeEventListener('keydown', escHandler, true);
    } else if (act === 'changelog') {
      // «Показать CHANGELOG» доступна всегда — она не закрывает модалку
      try { await ipcRenderer.invoke('whats-new-open-changelog'); } catch (_) {}
    }
  });

  document.body.appendChild(modal);
}

/**
 * Подписаться на событие из main. Вызывается из preload/index.js.
 */
function registerWhatsNewListener() {
  ipcRenderer.on('whats-new-show', (_event, payload) => {
    try { show(payload); } catch (err) {
      console.error('[WhatsNew] render error:', err && err.message);
    }
  });
}

module.exports = { registerWhatsNewListener, show, close };
