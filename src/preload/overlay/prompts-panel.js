/**
 * Панель «Промпты»: список сохранённых промптов проекта (.cookie/prompts/*.md).
 * - Вставить: только текст промпта в поле ввода (без отправки).
 * - Создать / редактировать / удалить.
 * Изолированные стили — чтобы глобальный CSS DeepSeek не ломал вёрстку.
 */
const { t } = require("../i18n/i18n");
const { showToast } = require("./ui");
const { findInputArea, setInputContent } = require("../dom/chat-input");

const OVERLAY_ID = "cuckoo-prompts-panel";

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function injectStyles() {
  if (document.getElementById(OVERLAY_ID + "-style")) return;
  const style = document.createElement("style");
  style.id = OVERLAY_ID + "-style";
  style.textContent =
    "#" +
    OVERLAY_ID +
    "{position:fixed;inset:0;z-index:2147483600;display:flex;" +
    "align-items:center;justify-content:center;background:rgba(0,0,0,0.45);" +
    "backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);}" +
    "#" +
    OVERLAY_ID +
    " .cp-box{width:min(560px,92vw);max-height:80vh;display:flex;" +
    "flex-direction:column;background:rgba(22,24,44,0.98);" +
    "border:1px solid rgba(139,147,255,0.35);border-radius:14px;" +
    "box-shadow:0 16px 50px rgba(0,0,0,0.55);overflow:hidden;" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}" +
    "#" +
    OVERLAY_ID +
    " .cp-header{display:flex;align-items:center;justify-content:space-between;" +
    "padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);" +
    "color:#e8eaff;font-size:14px;font-weight:600;}" +
    "#" +
    OVERLAY_ID +
    " .cp-close{background:transparent;border:none;color:#aab0ff;" +
    "font-size:20px;cursor:pointer;line-height:1;padding:0 4px;}" +
    "#" +
    OVERLAY_ID +
    " .cp-body{overflow-y:auto;padding:10px;display:flex;" +
    "flex-direction:column;gap:6px;}" +
    "#" +
    OVERLAY_ID +
    " .cp-row{display:flex;align-items:center;gap:8px;" +
    "border:1px solid rgba(139,147,255,0.2);background:rgba(139,147,255,0.06);" +
    "border-radius:9px;padding:6px 8px;}" +
    "#" +
    OVERLAY_ID +
    " .cp-name{flex:1;min-width:0;color:#cfd3ff;font-size:13px;" +
    "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    "#" +
    OVERLAY_ID +
    " .cp-btn{background:rgba(139,147,255,0.14);" +
    "border:1px solid rgba(139,147,255,0.3);color:#dfe2ff;border-radius:7px;" +
    "font-size:12px;padding:4px 8px;cursor:pointer;white-space:nowrap;" +
    "font-family:inherit;line-height:1.3;}" +
    "#" +
    OVERLAY_ID +
    " .cp-btn:hover{background:rgba(139,147,255,0.28);color:#fff;}" +
    "#" +
    OVERLAY_ID +
    " .cp-btn.danger{background:rgba(255,90,110,0.14);" +
    "border-color:rgba(255,90,110,0.35);color:#ffb3bd;}" +
    "#" +
    OVERLAY_ID +
    " .cp-btn.danger:hover{background:rgba(255,90,110,0.28);color:#fff;}" +
    "#" +
    OVERLAY_ID +
    " .cp-new{margin:0 10px 10px;text-align:center;}" +
    "#" +
    OVERLAY_ID +
    " .cp-input,#" +
    OVERLAY_ID +
    " .cp-text{width:100%;" +
    "box-sizing:border-box;background:rgba(10,12,26,0.9);color:#e8eaff;" +
    "border:1px solid rgba(139,147,255,0.3);border-radius:8px;padding:8px 10px;" +
    "font-size:13px;font-family:inherit;outline:none;}" +
    "#" +
    OVERLAY_ID +
    " .cp-text{min-height:160px;resize:vertical;" +
    "white-space:pre-wrap;line-height:1.45;}" +
    "#" +
    OVERLAY_ID +
    " .cp-editor{display:flex;flex-direction:column;gap:8px;padding:10px;}" +
    "#" +
    OVERLAY_ID +
    " .cp-editor-actions{display:flex;gap:8px;justify-content:flex-end;}" +
    "#" +
    OVERLAY_ID +
    " .cp-empty{color:#8a90b8;font-size:13px;text-align:center;padding:16px;}";
  document.head.appendChild(style);
}

function close() {
  const el = document.getElementById(OVERLAY_ID);
  if (el) el.remove();
}

/** Вставить только текст промпта в поле ввода (без отправки). */
function insertPrompt(text) {
  const input = findInputArea();
  if (!input) {
    showToast(t("prompts.saveFailed") + ": поле ввода не найдено", 3000);
    return false;
  }
  if (!setInputContent(input, text)) {
    showToast(t("prompts.saveFailed"), 3000);
    return false;
  }
  showToast(t("prompts.inserted"), 1800);
  return true;
}

async function refreshList(body) {
  body.innerHTML = "";
  let prompts = [];
  try {
    const res = await window.electronAPI.listPrompts();
    prompts = (res && res.success && res.prompts) || [];
  } catch (_) {}

  if (prompts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cp-empty";
    empty.textContent = t("prompts.empty");
    body.appendChild(empty);
    return;
  }

  prompts.forEach((p) => {
    const row = document.createElement("div");
    row.className = "cp-row";

    const name = document.createElement("div");
    name.className = "cp-name";
    name.textContent = p.name;
    name.title = p.name;

    const btnInsert = document.createElement("button");
    btnInsert.className = "cp-btn";
    btnInsert.textContent = t("prompts.insert");
    btnInsert.addEventListener("click", () => {
      insertPrompt(p.text || "");
      close();
    });

    const btnEdit = document.createElement("button");
    btnEdit.className = "cp-btn";
    btnEdit.textContent = t("prompts.edit");
    btnEdit.addEventListener("click", () => openEditor(body, p));

    const btnDel = document.createElement("button");
    btnDel.className = "cp-btn danger";
    btnDel.textContent = t("prompts.delete");
    btnDel.addEventListener("click", async () => {
      if (!confirm(t("prompts.deleteConfirm") + " " + p.name)) return;
      try {
        await window.electronAPI.deletePrompt(p.name);
        showToast(t("prompts.deleted"), 1800);
      } catch (_) {}
      refreshList(body);
    });

    row.appendChild(name);
    row.appendChild(btnInsert);
    row.appendChild(btnEdit);
    row.appendChild(btnDel);
    body.appendChild(row);
  });
}

/** Редактор: создать (p = null) или изменить существующий промпт. */
function openEditor(body, p) {
  body.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "cp-editor";

  const nameInput = document.createElement("input");
  nameInput.className = "cp-input";
  nameInput.placeholder = t("prompts.namePlaceholder");
  nameInput.value = p ? p.name : "";

  const textArea = document.createElement("textarea");
  textArea.className = "cp-text";
  textArea.placeholder = t("prompts.textPlaceholder");
  textArea.value = p ? p.text || "" : "";

  const actions = document.createElement("div");
  actions.className = "cp-editor-actions";

  const btnCancel = document.createElement("button");
  btnCancel.className = "cp-btn";
  btnCancel.textContent = t("prompts.cancel");
  btnCancel.addEventListener("click", () => refreshList(body));

  const btnSave = document.createElement("button");
  btnSave.className = "cp-btn";
  btnSave.textContent = t("prompts.save");
  btnSave.addEventListener("click", async () => {
    const nm = nameInput.value.trim();
    const tx = textArea.value;
    if (!nm) {
      showToast(t("prompts.namePlaceholder"), 2000);
      return;
    }
    try {
      const res = await window.electronAPI.savePrompt(nm, tx);
      if (res && res.success) {
        showToast(t("prompts.saved"), 1800);
        refreshList(body);
      } else {
        showToast(t("prompts.saveFailed") + ": " + (res && res.reason), 3000);
      }
    } catch (err) {
      showToast(t("prompts.saveFailed") + ": " + (err.message || err), 3000);
    }
  });

  actions.appendChild(btnCancel);
  actions.appendChild(btnSave);
  wrap.appendChild(nameInput);
  wrap.appendChild(textArea);
  wrap.appendChild(actions);
  body.appendChild(wrap);
  nameInput.focus();
}

async function open() {
  injectStyles();
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;

  const box = document.createElement("div");
  box.className = "cp-box";

  const header = document.createElement("div");
  header.className = "cp-header";
  const titleSpan = document.createElement("span");
  titleSpan.textContent = t("prompts.title");
  const closeBtn = document.createElement("button");
  closeBtn.className = "cp-close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", close);
  header.appendChild(titleSpan);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "cp-body";

  const newWrap = document.createElement("div");
  newWrap.className = "cp-new";
  const newBtn = document.createElement("button");
  newBtn.className = "cp-btn";
  newBtn.textContent = t("prompts.new");
  newBtn.addEventListener("click", () => openEditor(body, null));
  newWrap.appendChild(newBtn);

  box.appendChild(header);
  box.appendChild(body);
  box.appendChild(newWrap);
  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);

  refreshList(body);
}

module.exports = { open, close };
