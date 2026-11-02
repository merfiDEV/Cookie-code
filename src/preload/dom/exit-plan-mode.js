/**
 * Диалог утверждения плана (exit_plan_mode).
 *
 * Когда модель вызывает exit_plan_mode(), главный процесс присылает событие
 * 'exit-plan-mode' с markdown-текстом плана. Здесь рендерим план и показываем
 * две кнопки: «Отказать в плане» и «Согласиться». По согласию — снимаем режим
 * плана для ТЕКУЩЕЙ СЕССИИ и подставляем в поле ввода «Работай в соответствии
 * с планом» (без автоотправки — пользователь отправляет сам).
 */
const { ipcRenderer } = require("electron");
const state = require("./state");
const chatInput = require("./chat-input");
const { t } = require("../i18n/i18n");

const STYLE_ID = "cuckoo-exit-plan-style";
const DIALOG_ID = "cuckoo-exit-plan-dialog";

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value || "");
  return div.innerHTML;
}

/**
 * Мини-Markdown → HTML. Заголовки, списки, код, жирный/курсив, ссылки, таблицы.
 * @param {string} md
 * @returns {string}
 */
function renderMarkdown(md) {
  const lines = String(md || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const out = [];
  let inCode = false;
  let inUl = false;
  let inOl = false;

  const inline = (text) => {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );
    return s;
  };
  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  for (const line of lines) {
    if (/^```/.test(line)) {
      closeLists();
      if (!inCode) {
        out.push('<pre class="cuckoo-plan-pre"><code>');
        inCode = true;
      } else {
        out.push("</code></pre>");
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line));
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeLists();
      const lv = h[1].length;
      out.push(
        "<h" + lv + ' class="cuckoo-plan-h">' + inline(h[2]) + "</h" + lv + ">",
      );
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      closeLists();
      out.push('<hr class="cuckoo-plan-hr">');
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul) {
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul class="cuckoo-plan-ul">');
        inUl = true;
      }
      out.push("<li>" + inline(ul[1]) + "</li>");
      continue;
    }
    if (ol) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol class="cuckoo-plan-ol">');
        inOl = true;
      }
      out.push("<li>" + inline(ol[1]) + "</li>");
      continue;
    }
    closeLists();
    if (!line.trim()) continue;
    out.push('<p class="cuckoo-plan-p">' + inline(line) + "</p>");
  }
  closeLists();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${DIALOG_ID} { position:fixed; inset:0; z-index:2147483647; display:flex; align-items:center; justify-content:center; background:rgba(5,8,18,.62); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    #${DIALOG_ID} .cuckoo-plan-card { position:relative; width:min(760px,calc(100vw - 32px)); max-height:calc(100vh - 48px); display:flex; flex-direction:column; color:var(--ck-text, #e8eaff); background:var(--ck-bg, #141726); border:1px solid var(--ck-border, rgba(145,158,255,.28)); border-radius:12px; box-shadow:0 20px 70px rgba(0,0,0,.55); overflow:hidden; }
    #${DIALOG_ID} .cuckoo-plan-head { display:flex; align-items:center; gap:10px; padding:16px 20px; border-bottom:1px solid var(--ck-border, rgba(255,255,255,.08)); cursor:move; user-select:none; }
    #${DIALOG_ID} .cuckoo-plan-head h2 { margin:0; font-size:17px; flex:1; }
    #${DIALOG_ID} .cuckoo-plan-close { border:0; background:transparent; color:var(--ck-text-2, #9aa2c6); font-size:20px; line-height:1; cursor:pointer; padding:2px 6px; border-radius:6px; }
    #${DIALOG_ID} .cuckoo-plan-close:hover { background:var(--ck-bg-sub, rgba(255,255,255,.08)); color:var(--ck-text, #fff); }
    #${DIALOG_ID} .cuckoo-plan-body { padding:18px 22px; overflow:auto; flex:1; line-height:1.6; font-size:14px; }
    #${DIALOG_ID} .cuckoo-plan-p { margin:0 0 10px; }
    #${DIALOG_ID} .cuckoo-plan-h { margin:16px 0 8px; line-height:1.3; }
    #${DIALOG_ID} h1.cuckoo-plan-h { font-size:20px; }
    #${DIALOG_ID} h2.cuckoo-plan-h { font-size:17px; }
    #${DIALOG_ID} h3.cuckoo-plan-h { font-size:15px; }
    #${DIALOG_ID} .cuckoo-plan-ul, #${DIALOG_ID} .cuckoo-plan-ol { margin:0 0 12px; padding-left:22px; }
    #${DIALOG_ID} .cuckoo-plan-pre { margin:0 0 12px; padding:12px; background:var(--ck-bg-sub, #0f1322); border:1px solid var(--ck-border, rgba(255,255,255,.12)); border-radius:8px; overflow:auto; font-family:"Consolas",monospace; font-size:12px; line-height:1.5; }
    #${DIALOG_ID} code { font-family:"Consolas",monospace; font-size:12px; background:var(--ck-bg-sub, rgba(255,255,255,.08)); padding:1px 5px; border-radius:4px; }
    #${DIALOG_ID} .cuckoo-plan-pre code { background:transparent; padding:0; }
    #${DIALOG_ID} .cuckoo-plan-hr { border:0; border-top:1px solid var(--ck-border, rgba(255,255,255,.12)); margin:16px 0; }
    #${DIALOG_ID} a { color:var(--ck-primary, #8ea2ff); }
    #${DIALOG_ID} .cuckoo-plan-foot { display:flex; gap:10px; justify-content:flex-end; padding:14px 20px; border-top:1px solid var(--ck-border, rgba(255,255,255,.08)); flex-wrap:wrap; }
    #${DIALOG_ID} button.cuckoo-plan-btn { padding:10px 18px; border:0; border-radius:8px; color:#fff; cursor:pointer; font-weight:600; font-size:13px; }
    #${DIALOG_ID} .cuckoo-plan-deny { background:rgba(255,107,122,.16); border:1px solid rgba(255,107,122,.5) !important; color:#ff9aa5; }
    #${DIALOG_ID} .cuckoo-plan-deny:hover { background:rgba(255,107,122,.3); }
    #${DIALOG_ID} .cuckoo-plan-comment { background:var(--ck-bg-sub, rgba(139,147,255,.22)); border:1px solid var(--ck-border, rgba(139,147,255,.5)) !important; color:var(--ck-text, #cfd3ff); margin-right:auto; }
    #${DIALOG_ID} .cuckoo-plan-comment:hover { background:var(--ck-bg-hover, rgba(139,147,255,.4)); color:var(--ck-text, #fff); }
    .cuckoo-plan-comment-fab { position:absolute; z-index:2147483647; width:34px; height:34px; padding:0; border-radius:8px; border:1px solid var(--ck-border, rgba(139,147,255,.6)); background:var(--ck-bg-sub, #3a3f66); color:var(--ck-text, #fff); font-size:16px; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.4); }
    .cuckoo-plan-comment-fab:hover { background:var(--ck-primary, #6574ee); }
    #${DIALOG_ID} .cuckoo-comment-box { margin:8px 0 12px; padding:10px; border-left:3px solid var(--ck-primary, #6574ee); background:var(--ck-bg-sub, rgba(101,116,238,.1)); border-radius:8px; }
    #${DIALOG_ID} .cuckoo-comment-quote { font-size:12px; color:var(--ck-text-2, #a7adcf); margin-bottom:6px; }
    #${DIALOG_ID} .cuckoo-comment-input { width:100%; box-sizing:border-box; background:var(--ck-bg-sub, #0f1322); color:var(--ck-text, #eef1ff); border:1px solid var(--ck-border, rgba(145,158,255,.4)); border-radius:8px; padding:8px; font-size:13px; font-family:inherit; resize:vertical; }
    #${DIALOG_ID} .cuckoo-comment-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:6px; }
    #${DIALOG_ID} .cuckoo-comment-actions button { padding:6px 12px; border-radius:7px; border:1px solid var(--ck-border, rgba(145,158,255,.4)); background:transparent; color:var(--ck-text, #cfd3ff); cursor:pointer; font-size:12px; }
    #${DIALOG_ID} .cuckoo-comment-save { background:var(--ck-primary, #6574ee) !important; border-color:var(--ck-primary, #6574ee) !important; color:#fff !important; }
    #${DIALOG_ID} .cuckoo-has-comment { box-shadow: inset 3px 0 0 var(--ck-primary, #6574ee); background:var(--ck-bg-sub, rgba(101,116,238,.08)); }
    #${DIALOG_ID} .cuckoo-plan-approve { background:var(--ck-primary, #6574ee); }
    #${DIALOG_ID} .cuckoo-plan-approve:hover { background:var(--ck-primary-hover, #7785ff); }
  `;
  document.head.appendChild(style);
}

/**
 * Показать диалог утверждения плана.
 * @param {string} plan — markdown плана
 * @returns {Promise<boolean>} true — согласие, false — отказ
 */
function showExitPlanDialog(plan) {
  ensureStyles();
  const old = document.getElementById(DIALOG_ID);
  if (old) old.remove();

  return new Promise((resolve) => {
    const comments = [];
    const dialog = document.createElement("div");
    dialog.id = DIALOG_ID;
    dialog.innerHTML =
      '<div class="cuckoo-plan-card" role="dialog" aria-modal="true">' +
      '<div class="cuckoo-plan-head">' +
      "<h2>" +
      escapeHtml(t("plan.dialog.title")) +
      "</h2>" +
      '<button type="button" class="cuckoo-plan-close" aria-label="close">×</button>' +
      "</div>" +
      '<div class="cuckoo-plan-body"></div>' +
      '<div class="cuckoo-plan-foot">' +
      '<button type="button" class="cuckoo-plan-btn cuckoo-plan-deny">' +
      escapeHtml(t("plan.dialog.deny")) +
      "</button>" +
      '<button type="button" class="cuckoo-plan-btn cuckoo-plan-approve">' +
      escapeHtml(t("plan.dialog.approve")) +
      "</button>" +
      "</div>" +
      "</div>";
    document.body.appendChild(dialog);

    dialog.querySelector(".cuckoo-plan-body").innerHTML = renderMarkdown(plan);

    // ===== Перетаскивание окна за заголовок =====
    (function enableDrag() {
      const card = dialog.querySelector(".cuckoo-plan-card");
      const head = dialog.querySelector(".cuckoo-plan-head");
      if (!card || !head) return;
      head.style.cursor = "move";
      let offsetX = 0;
      let offsetY = 0;
      head.addEventListener("mousedown", (e) => {
        if (e.target.closest(".cuckoo-plan-close")) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const baseX = offsetX;
        const baseY = offsetY;
        const onMove = (ev) => {
          offsetX = baseX + (ev.clientX - startX);
          offsetY = baseY + (ev.clientY - startY);
          card.style.transform =
            "translate(" + offsetX + "px," + offsetY + "px)";
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        e.preventDefault();
      });
    })();

    let settled = false;
    const finish = (approved, extraComments) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey, true);
      dialog.remove();
      const all = (
        extraComments && extraComments.length ? extraComments : comments
      ).slice();
      resolve({ approved, comments: all });
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      }
    };
    document.addEventListener("keydown", onKey, true);

    dialog
      .querySelector(".cuckoo-plan-approve")
      .addEventListener("click", () => finish(true));
    dialog
      .querySelector(".cuckoo-plan-deny")
      .addEventListener("click", () => finish(false));
    dialog
      .querySelector(".cuckoo-plan-close")
      .addEventListener("click", () => finish(false));

    // ===== Комментарии к строкам плана =====
    // Выделяем строку в плане → под ней появляется кнопка «💬».
    // Клик → inline-поле ввода → «Сохранить» добавляет комментарий к этой строке.
    const body = dialog.querySelector(".cuckoo-plan-body");
    const BLOCK_SEL = "li, p, h1, h2, h3, h4, h5, h6, pre, tr";
    let floatBtn = null;

    const removeFloatBtn = () => {
      if (floatBtn) {
        floatBtn.remove();
        floatBtn = null;
      }
    };

    const findBlock = (node) => {
      let n = node;
      while (n && n !== body) {
        if (n.nodeType === 1 && n.matches && n.matches(BLOCK_SEL)) return n;
        n = n.parentNode;
      }
      return null;
    };

    // Открыть inline-редактор комментария под указанным блоком.
    const openCommentBox = (block, selection) => {
      // Закрываем уже открытый редактор, если есть.
      const existing = body.querySelector(".cuckoo-comment-box");
      if (existing) existing.remove();

      const line = (block.textContent || "").trim();
      const box = document.createElement("div");
      box.className = "cuckoo-comment-box";
      box.innerHTML =
        '<div class="cuckoo-comment-quote">💬 ' +
        escapeHtml(line.slice(0, 160)) +
        (line.length > 160 ? "…" : "") +
        "</div>" +
        '<textarea class="cuckoo-comment-input" rows="2" placeholder="' +
        escapeHtml(t("plan.dialog.commentPrompt")) +
        '"></textarea>' +
        '<div class="cuckoo-comment-actions">' +
        '<button type="button" class="cuckoo-comment-cancel">' +
        escapeHtml(t("plan.dialog.cancel") || "Отмена") +
        "</button>" +
        '<button type="button" class="cuckoo-comment-save">' +
        escapeHtml(t("plan.dialog.comment")) +
        "</button>" +
        "</div>";
      block.insertAdjacentElement("afterend", box);
      const ta = box.querySelector(".cuckoo-comment-input");
      ta.focus();
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          box.querySelector(".cuckoo-comment-save").click();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          box.remove();
        }
      });
      box
        .querySelector(".cuckoo-comment-cancel")
        .addEventListener("click", () => box.remove());
      box
        .querySelector(".cuckoo-comment-save")
        .addEventListener("click", () => {
          const text = (ta.value || "").trim();
          if (!text) {
            box.remove();
            return;
          }
          comments.push({ text, selection: selection || "", line });
          // Помечаем блок как «с комментарием» и показываем бейдж.
          block.classList.add("cuckoo-has-comment");
          box.remove();
          removeFloatBtn();
        });
    };

    // Плавающая кнопка «💬» рядом с выделением.
    const showFloatBtn = (block, selection) => {
      removeFloatBtn();
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cuckoo-plan-comment-fab";
      btn.textContent = "💬";
      btn.title = t("plan.dialog.comment");
      document.body.appendChild(btn);
      const rect = block.getBoundingClientRect();
      let left = rect.right + 6;
      let top = rect.top + window.scrollY;
      // Не улетаем за экран.
      const bw = 34;
      if (left + bw > window.innerWidth - 6) left = rect.left - bw - 6;
      if (left < 6) left = 6;
      if (top < 6) top = 6;
      btn.style.left = left + "px";
      btn.style.top = top + "px";
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        removeFloatBtn();
        openCommentBox(block, selection);
      });
      floatBtn = btn;
    };

    // На выделение текста внутри плана — показать кнопку.
    body.addEventListener("mouseup", () => {
      let selection = "";
      let block = null;
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          const range = sel.getRangeAt(0);
          if (body.contains(range.commonAncestorContainer)) {
            selection = sel.toString().trim();
            block = findBlock(range.startContainer);
          }
        }
      } catch (_) {}
      if (block) showFloatBtn(block, selection);
      else removeFloatBtn();
    });
    // Клик мимо кнопки/поля — прячем кнопку.
    dialog.addEventListener("mousedown", (e) => {
      if (floatBtn && e.target !== floatBtn) removeFloatBtn();
    });

    dialog.querySelector(".cuckoo-plan-approve").focus();
  });
}

/**
 * После согласия: снять режим плана и подставить в поле ввода запрос на работу.
 */
function applyApproval(comments) {
  state.planMode = false;
  try {
    window.electronAPI.setPlanMode(false).catch(() => {});
  } catch (_) {}
  try {
    require("./plan-mode-toggle").syncState();
  } catch (_) {}
  // Вставляем запрос на работу и ПРИНУДИТЕЛЬНО отправляем его (как с вопросами:
  // даже если AI не вызвал log, сообщение всё равно уходит). Текст — одной строкой.
  let prompt = t("plan.approve.prompt").replace(/\s+/g, " ").trim();
  // Если пользователь оставил комментарии к строкам — прикладываем их к сообщению,
  // чтобы ИИ их увидел и учёл даже при одобрении плана.
  const list = Array.isArray(comments) ? comments : [];
  if (list.length > 0) {
    const lines = list.map((c, i) => {
      const line = c && c.line ? "«" + c.line + "»" : "(план)";
      return i + 1 + ". к строке " + line + ": " + ((c && c.text) || "");
    });
    prompt += "\n\nКомментарии к плану:\n" + lines.join("\n");
  }
  try {
    const input = chatInput.findInputArea();
    if (input) chatInput.setInputContent(input, prompt);
  } catch (_) {}
  // Автоотправка через тот же надёжный механизм, что и у кнопки «План»
  // (native Enter + фолбэк на кнопку отправки).
  try {
    require("./plan-mode-toggle").scheduleAutoSend(prompt, 300);
  } catch (_) {}
}

/** Слушатель события exit-plan-mode от главного процесса. */
function registerExitPlanModeListener() {
  ipcRenderer.on("exit-plan-mode", (_event, payload = {}) => {
    const { requestId, plan } = payload;
    showExitPlanDialog(plan).then((res) => {
      const approved = !!(res && res.approved);
      const comments = (res && res.comments) || [];
      try {
        window.electronAPI.exitPlanModeResponse(requestId, approved, comments);
      } catch (_) {}
      if (approved) applyApproval(comments);
    });
  });
  // План утверждён/отклонён в Telegram — закрываем диалог в окне.
  ipcRenderer.on("exit-plan-mode-resolved", (_event, payload = {}) => {
    const dialog = document.getElementById(DIALOG_ID);
    if (dialog) dialog.remove();
    if (payload.approved)
      applyApproval(Array.isArray(payload.comments) ? payload.comments : []);
  });
}

module.exports = {
  registerExitPlanModeListener,
  showExitPlanDialog,
  renderMarkdown,
};
