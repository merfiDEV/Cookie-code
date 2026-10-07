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
const { ipcRenderer } = require("electron");

const MODAL_ID = "cuckoo-whats-new-modal";
const STYLE_ID = "cuckoo-whats-new-style";

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    "#" + MODAL_ID + " { position: fixed; inset: 0; z-index: 2147483600;",
    "  background: rgba(6,8,18,0.72); display: flex; align-items: center; justify-content: center;",
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }',
    "#" +
      MODAL_ID +
      " .wn-card { background: #141726; border: 1px solid rgba(139,147,255,0.35);",
    "  border-radius: 14px; width: 92vw; max-width: 1100px; max-height: 85vh; display: flex;",
    "  flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.6); color: #dde1ff;",
    "  position: relative; }",
    "#" + MODAL_ID + " .wn-head { cursor: grab; user-select: none; }",
    "#" + MODAL_ID + " .wn-head:active { cursor: grabbing; }",
    "#" +
      MODAL_ID +
      " .wn-head { padding: 18px 22px; border-bottom: 1px solid rgba(255,255,255,0.07);",
    "  display: flex; justify-content: space-between; align-items: center; }",
    "#" +
      MODAL_ID +
      " .wn-title { font-size: 17px; font-weight: 700; color: #eef0ff; }",
    "#" +
      MODAL_ID +
      " .wn-sub { font-size: 12px; color: #8a90b8; margin-top: 4px; }",
    "#" +
      MODAL_ID +
      " .wn-body { flex: 1; overflow: auto; padding: 16px 22px; font-size: 13.5px;",
    "  line-height: 1.6; }",
    "#" +
      MODAL_ID +
      " .wn-body h3 { font-size: 14px; margin: 16px 0 6px; color: #bec2ff; font-weight: 700; }",
    "#" + MODAL_ID + " .wn-body h3:first-child { margin-top: 0; }",
    "#" + MODAL_ID + " .wn-body strong { color: #dde1ff; }",
    "#" + MODAL_ID + " .wn-body ul { margin: 4px 0 10px; padding-left: 20px; }",
    "#" + MODAL_ID + " .wn-body li { margin: 3px 0; }",
    "#" + MODAL_ID + " .wn-body em { color: #8a90b8; }",
    "#" +
      MODAL_ID +
      " .wn-foot { padding: 12px 20px; border-top: 1px solid rgba(255,255,255,0.07);",
    "  display: flex; gap: 8px; justify-content: flex-end; }",
    "#" +
      MODAL_ID +
      " .wn-btn { padding: 9px 16px; border-radius: 10px; font-weight: 600;",
    "  font-size: 13px; cursor: pointer; border: 1px solid rgba(139,147,255,0.4);",
    "  background: rgba(139,147,255,0.1); color: #a8afff; transition: all 0.18s ease; }",
    "#" +
      MODAL_ID +
      " .wn-btn:hover { background: rgba(139,147,255,0.24); color: #fff; }",
    "#" +
      MODAL_ID +
      " .wn-btn-primary { background: linear-gradient(90deg,#8b93ff,#5b63d6);",
    "  color: #fff; border-color: transparent; }",
    "#" + MODAL_ID + " .wn-btn-primary:hover { filter: brightness(1.1); }",
    "#" +
      MODAL_ID +
      " .wn-btn[disabled] { opacity: 0.45; cursor: not-allowed; }",
    "#" +
      MODAL_ID +
      " .wn-btn[disabled]:hover { background: rgba(139,147,255,0.1); color: #a8afff; transform: none; filter: none; }",
    "#" +
      MODAL_ID +
      " .wn-btn-primary[disabled]:hover { background: linear-gradient(90deg,#8b93ff,#5b63d6); color: #fff; filter: none; }",
    // Жёлтая подсветка (==маркер==)
    "#" +
      MODAL_ID +
      " .wn-body mark { background: rgba(255, 214, 51, 0.32); color: #ffe9a3; padding: 0 3px; border-radius: 3px; box-decoration-break: clone; }",
    // Таблицы
    "#" +
      MODAL_ID +
      " .wn-table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 12.5px; }",
    "#" +
      MODAL_ID +
      " .wn-table th, #" +
      MODAL_ID +
      " .wn-table td { border: 1px solid rgba(139,147,255,0.22); padding: 6px 10px; text-align: left; vertical-align: top; }",
    "#" +
      MODAL_ID +
      " .wn-table th { background: rgba(139,147,255,0.14); color: #d6d9ff; font-weight: 700; }",
    "#" +
      MODAL_ID +
      " .wn-table tr:nth-child(even) td { background: rgba(255,255,255,0.02); }",
    // Инлайн-код
    "#" +
      MODAL_ID +
      " .wn-body code { background: rgba(139,147,255,0.14); color: #cfd4ff; padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }",
    // Блок кода
    "#" +
      MODAL_ID +
      " .wn-pre { background: rgba(0,0,0,0.35); border: 1px solid rgba(139,147,255,0.2); border-radius: 8px; padding: 10px 12px; overflow: auto; margin: 8px 0; }",
    "#" +
      MODAL_ID +
      " .wn-pre code { background: transparent; padding: 0; color: #c8cdff; font-size: 12px; line-height: 1.5; }",
    // Цитата
    "#" +
      MODAL_ID +
      " .wn-quote { border-left: 3px solid rgba(139,147,255,0.55); padding: 2px 0 2px 12px; margin: 8px 0; color: #a9aed6; font-style: italic; }",
    // Зачёркнутый
    "#" + MODAL_ID + " .wn-body del { color: #6c729a; }",
    // Ссылки
    "#" +
      MODAL_ID +
      " .wn-body a { color: #a8afff; text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }",
    "#" + MODAL_ID + " .wn-body a:hover { color: #fff; }",
    // Нумерованный список
    "#" +
      MODAL_ID +
      " .wn-body ol.wn-ol { margin: 4px 0 10px; padding-left: 22px; }",
    // Чек-лист
    "#" +
      MODAL_ID +
      " .wn-body li.wn-task { list-style: none; margin-left: -18px; }",
    "#" +
      MODAL_ID +
      " .wn-body li.wn-task-done { color: #7e85a8; text-decoration: line-through; }",
    "#" +
      MODAL_ID +
      " .wn-body .wn-check { color: #9aa1ff; margin-right: 4px; }",
    // Разделитель
    "#" +
      MODAL_ID +
      " .wn-hr { border: none; border-top: 1px solid rgba(139,147,255,0.22); margin: 12px 0; }",
    // Заголовки h4-h6 (для ## и ниже в CHANGELOG)
    "#" +
      MODAL_ID +
      " .wn-body h4, #" +
      MODAL_ID +
      " .wn-body h5, #" +
      MODAL_ID +
      " .wn-body h6 { font-size: 13.5px; margin: 14px 0 6px; color: #bec2ff; font-weight: 700; }",
  ].join("\n");
  document.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Минимальный рендер markdown → HTML.
 * Поддерживает: ### заголовки, **bold**, _italic_, - списки, пустые строки.
 * Этого достаточно для нашего CHANGELOG.
 */
function renderMarkdown(md) {
  const lines = String(md || "").split(/\r?\n/);
  const out = [];
  let inList = false;
  let inOList = false;
  let inCode = false;
  let codeBuf = [];
  let tableBuf = [];

  const flushTable = () => {
    if (!tableBuf.length) return;
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (inOList) {
      out.push("</ol>");
      inOList = false;
    }
    const rows = tableBuf.map((r) =>
      r
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
    tableBuf = [];
    if (rows.length < 2) {
      out.push("<div>" + inline(rows[0] ? rows[0].join(" | ") : "") + "</div>");
      return;
    }
    const isSep = rows[1].every((c) => /^:?-{2,}:?$/.test(c));
    const head = isSep ? rows[0] : null;
    const body = isSep ? rows.slice(2) : rows;
    let html = '<table class="wn-table">';
    if (head) {
      html +=
        "<thead><tr>" +
        head.map((c) => "<th>" + inline(c) + "</th>").join("") +
        "</tr></thead>";
    }
    html +=
      "<tbody>" +
      body
        .map(
          (r) =>
            "<tr>" +
            r.map((c) => "<td>" + inline(c) + "</td>").join("") +
            "</tr>",
        )
        .join("") +
      "</tbody>";
    html += "</table>";
    out.push(html);
  };

  const flushCode = () => {
    out.push(
      '<pre class="wn-pre"><code>' +
        escapeHtml(codeBuf.join("\n")) +
        "</code></pre>",
    );
    codeBuf = [];
    inCode = false;
  };

  const inline = (t) => {
    // Код в бэктиках — инлайн: \`code\`
    const codes = [];
    let s = escapeHtml(t).replace(/`([^`]+)`/g, (_m, c) => {
      codes.push(c);
      return "\u0000CODE" + (codes.length - 1) + "\u0000";
    });
    s = s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\s)_([^_]+)_(\s|$)/g, "$1<em>$2</em>$3")
      // \u0416\u0451\u043b\u0442\u0430\u044f \u043f\u043e\u0434\u0441\u0432\u0435\u0442\u043a\u0430: ==\u043c\u0430\u0440\u043a\u0435\u0440==
      .replace(/==([^=]+)==/g, "<mark>$1</mark>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      // \u0421\u0441\u044b\u043b\u043a\u0438: [text](url)
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>',
      )
      // \u0410\u0432\u0442\u043e\u0441\u0441\u044b\u043b\u043a\u0438 http(s)://...
      .replace(
        /(^|[^"'=])(https?:\/\/[^\s<]+)/g,
        '$1<a href="$2" target="_blank" rel="noopener">$2</a>',
      );
    s = s.replace(
      /\u0000CODE(\d+)\u0000/g,
      (_m, i) => "<code>" + codes[i] + "</code>",
    );
    return s;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    // Блок кода ```
    if (/^\s*```/.test(line)) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (inOList) {
        out.push("</ol>");
        inOList = false;
      }
      flushTable();
      if (inCode) flushCode();
      else inCode = true;
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }

    // Таблица GFM
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (inOList) {
        out.push("</ol>");
        inOList = false;
      }
      tableBuf.push(line.trim());
      continue;
    } else {
      flushTable();
    }

    if (!line) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (inOList) {
        out.push("</ol>");
        inOList = false;
      }
      continue;
    }

    const mH = line.match(/^(#{1,6})\s+(.+)$/);
    if (mH) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (inOList) {
        out.push("</ol>");
        inOList = false;
      }
      const hl = mH[1].length;
      const lvl = hl <= 3 ? 3 : Math.min(hl, 6);
      out.push("<h" + lvl + ">" + inline(mH[2]) + "</h" + lvl + ">");
      continue;
    }

    // Горизонтальная линия
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (inOList) {
        out.push("</ol>");
        inOList = false;
      }
      out.push('<hr class="wn-hr">');
      continue;
    }

    // Цитата
    const mQ = line.match(/^\s*>\s?(.*)$/);
    if (mQ) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (inOList) {
        out.push("</ol>");
        inOList = false;
      }
      out.push(
        '<blockquote class="wn-quote">' + inline(mQ[1]) + "</blockquote>",
      );
      continue;
    }

    // Нумерованный список
    const mO = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (mO) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (!inOList) {
        out.push('<ol class="wn-ol">');
        inOList = true;
      }
      out.push("<li>" + inline(mO[1]) + "</li>");
      continue;
    }

    const mI = line.match(/^\s*[-*]\s+(.+)$/);
    if (mI) {
      if (inOList) {
        out.push("</ol>");
        inOList = false;
      }
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      const mTask = mI[1].match(/^\[([ xX])\]\s+(.*)$/);
      if (mTask) {
        const checked = mTask[1].toLowerCase() === "x";
        out.push(
          '<li class="wn-task' +
            (checked ? " wn-task-done" : "") +
            '">' +
            '<span class="wn-check">' +
            (checked ? "☑" : "☐") +
            "</span> " +
            inline(mTask[2]) +
            "</li>",
        );
      } else {
        out.push("<li>" + inline(mI[1]) + "</li>");
      }
      continue;
    }

    // Обычная строка
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (inOList) {
      out.push("</ol>");
      inOList = false;
    }
    out.push("<div>" + inline(line) + "</div>");
  }
  flushTable();
  if (inCode) flushCode();
  if (inList) out.push("</ul>");
  if (inOList) out.push("</ol>");
  return out.join("\n");
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
  const to = payload && payload.to ? payload.to : "";
  const md = payload && payload.markdown ? payload.markdown : "";
  const subtitle = from
    ? "Обновление " + from + " → " + to
    : "Новая версия " + to;

  const modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.innerHTML =
    '<div class="wn-card">' +
    '<div class="wn-head">' +
    "<div>" +
    '<div class="wn-title">🎉 Что нового в Cookie Code v' +
    escapeHtml(to) +
    "</div>" +
    '<div class="wn-sub">' +
    escapeHtml(subtitle) +
    "</div>" +
    "</div>" +
    '<button class="wn-btn" data-act="close" disabled>' +
    '<span data-role="close-icon">✕</span>' +
    "</button>" +
    "</div>" +
    '<div class="wn-body">' +
    renderMarkdown(md) +
    "</div>" +
    '<div class="wn-foot">' +
    '<button class="wn-btn" data-act="changelog">📄 Показать CHANGELOG</button>' +
    '<button class="wn-btn wn-btn-primary" data-act="close" disabled>' +
    '<span data-role="close-label">Ок, спасибо</span>' +
    "</button>" +
    "</div>" +
    "</div>";

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
      if (closeLabelEl) closeLabelEl.textContent = "Прочитайте — " + sec + "…";
    } else {
      locked = false;
      if (closeIconEl) closeIconEl.textContent = "✕";
      if (closeLabelEl) closeLabelEl.textContent = "Ок, спасибо";
      closeBtns.forEach((b) => {
        b.disabled = false;
        b.removeAttribute("disabled");
      });
      return;
    }
    setTimeout(tick, 100);
  };
  tick();

  // Заблокировать Esc на время лока
  const escHandler = (e) => {
    if (e.key === "Escape") {
      if (locked) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      close();
      document.removeEventListener("keydown", escHandler, true);
    }
  };
  document.addEventListener("keydown", escHandler, true);

  // Клик по кнопкам / вне карточки
  modal.addEventListener("click", async (e) => {
    const t = e.target;
    if (!t || !t.closest) return;

    // Клик вне карточки — попытка закрыть
    const card = t.closest(".wn-card");
    if (!card) {
      if (!locked) {
        close();
        document.removeEventListener("keydown", escHandler, true);
      }
      return;
    }

    const btn = t.closest("[data-act]");
    if (!btn) return;
    if (btn.disabled) return;

    const act = btn.getAttribute("data-act");
    if (act === "close") {
      if (locked) return;
      close();
      document.removeEventListener("keydown", escHandler, true);
    } else if (act === "changelog") {
      // «Показать CHANGELOG» доступна всегда — она не закрывает модалку
      try {
        await ipcRenderer.invoke("whats-new-open-changelog");
      } catch (_) {}
    }
  });

  // ---- Перетаскивание модалки за шапку ----
  // Модалка позиционируется через transform (центрирование), поэтому при
  // перетаскивании переводим её в абсолютные left/top и двигаем оттуда.
  const headEl = modal.querySelector(".wn-head");
  if (headEl) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMove = (e) => {
      if (!dragging) return;
      const card = modal.querySelector(".wn-card");
      if (!card) return;
      let left = startLeft + (e.clientX - startX);
      let top = startTop + (e.clientY - startY);
      // Не выпускаем за пределы окна (оставляем шапку видимой).
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      const maxLeft = window.innerWidth - 40;
      const maxTop = window.innerHeight - 40;
      left = Math.max(-(w - 80), Math.min(maxLeft, left));
      top = Math.max(0, Math.min(maxTop, top));
      card.style.left = left + "px";
      card.style.top = top + "px";
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    headEl.addEventListener("mousedown", (e) => {
      // Не начинать перетаскивание с кнопок в шапке.
      if (e.target.closest("button")) return;
      const card = modal.querySelector(".wn-card");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      // Фиксируем текущую позицию в left/top, снимаем центрирование.
      card.style.position = "absolute";
      card.style.left = rect.left + "px";
      card.style.top = rect.top + "px";
      card.style.margin = "0";
      // Переводим контейнер из flex-центрирования в свободное позиционирование.
      modal.style.alignItems = "flex-start";
      modal.style.justifyContent = "flex-start";
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }

  document.body.appendChild(modal);
}

/**
 * Подписаться на событие из main. Вызывается из preload/index.js.
 */
function registerWhatsNewListener() {
  ipcRenderer.on("whats-new-show", (_event, payload) => {
    try {
      show(payload);
    } catch (err) {
      console.error("[WhatsNew] render error:", err && err.message);
    }
  });
}

module.exports = { registerWhatsNewListener, show, close };
