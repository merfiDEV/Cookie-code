/**
 * Панель «Изменения» (git) с вкладками «Изменения» / «История».
 * - Изменения: список изменённых файлов (git status) → клик → окно с unified diff.
 * - История: список последних коммитов → клик → файлы коммита → клик → окно с diff;
 *   кнопка «Весь коммит» показывает полный diff коммита.
 *
 * Улучшения:
 * - Навигация по hunks (кнопки + хоткеи n/p)
 * - Внутристроковый diff для замен
 * - Копирование строк/всего diff
 * - Фильтры (только добавленные/удалённые/контекст)
 * - Мини-карта изменений
 * - Статистика изменений
 * - Кэширование результатов
 * - Виртуализация для больших diff
 */
const { showToast } = require("./ui");
const { t } = require("../i18n/i18n");

const PANEL_ID = "cuckoo-diff-panel";
const LIST_ID = "cuckoo-diff-list";
const LOG_LIST_ID = "cuckoo-git-log-list";
const COMMIT_FILES_ID = "cuckoo-commit-files";
const COMMIT_FILES_LIST_ID = "cuckoo-commit-files-list";
const VIEWER_ID = "cuckoo-diff-viewer";

const COMMITS_LIMIT = 20;
const VIRTUAL_ROW_HEIGHT = 20; // px для виртуализации
const VIRTUAL_BUFFER = 5; // сколько строк рендерить за пределами видимости

let currentCommit = null; // { hash, subject }
let diffCache = new Map(); // кэш результатов: key → diffText
let currentDiffLines = []; // текущие строки diff для навигации
let currentHunkIndex = -1; // индекс текущего hunk
let diffFilters = { showAdded: true, showDeleted: true, showContext: true }; // фильтры

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

function statusLabel(status) {
  switch (status) {
    case "modified":
      return { txt: "M", cls: "modified" };
    case "added":
      return { txt: "A", cls: "added" };
    case "deleted":
      return { txt: "D", cls: "deleted" };
    case "renamed":
      return { txt: "R", cls: "renamed" };
    case "untracked":
      return { txt: "U", cls: "untracked" };
    default:
      return { txt: "?", cls: "changed" };
  }
}

// ================= Вкладки =================

function setActiveTab(tab) {
  const tChanges = document.getElementById("cuckoo-diff-tab-changes");
  const tHistory = document.getElementById("cuckoo-diff-tab-history");
  const bodyChanges = document.getElementById(LIST_ID);
  const bodyHistory = document.getElementById(LOG_LIST_ID);
  const commitFiles = document.getElementById(COMMIT_FILES_ID);

  const isChanges = tab === "changes";
  tChanges?.classList.toggle("active", isChanges);
  tHistory?.classList.toggle("active", !isChanges);
  bodyChanges?.classList.toggle("cuckoo-hidden", !isChanges);
  if (bodyHistory)
    bodyHistory.classList.toggle("cuckoo-hidden", isChanges || !!currentCommit);
  if (commitFiles)
    commitFiles.classList.toggle("cuckoo-hidden", isChanges || !currentCommit);

  if (isChanges) {
    currentCommit = null;
    renderDiffList();
  } else {
    renderGitLog();
  }
}

// ================= Вкладка «Изменения» =================

async function renderDiffList() {
  const list = document.getElementById(LIST_ID);
  if (!list) return;
  list.innerHTML =
    '<div class="cuckoo-session-empty">' + t("diff.loading") + "</div>";
  try {
    const res = await window.electronAPI.gitStatus();
    if (!res || !res.success) {
      list.innerHTML =
        '<div class="cuckoo-session-empty">' +
        escapeHtml((res && res.reason) || t("diff.gitNotFound")) +
        "</div>";
      return;
    }
    const files = res.files || [];
    if (files.length === 0) {
      list.innerHTML =
        '<div class="cuckoo-session-empty">' + t("diff.noChanges") + "</div>";
      return;
    }

    // Статистика
    let totalAdded = 0,
      totalDeleted = 0;
    if (res.stats) {
      totalAdded = res.stats.added || 0;
      totalDeleted = res.stats.deleted || 0;
    }
    const statsHtml =
      totalAdded || totalDeleted
        ? `<div class="cuckoo-diff-stats">📊 <span class="cuckoo-diff-add">+${totalAdded}</span> <span class="cuckoo-diff-del">-${totalDeleted}</span> в ${files.length} файл${files.length > 1 ? "ах" : "е"}</div>`
        : "";

    list.innerHTML =
      statsHtml +
      files
        .map((f) => {
          const s = statusLabel(f.status);
          return (
            '<div class="cuckoo-diff-file" data-path="' +
            escapeHtml(f.path) +
            '" data-status="' +
            escapeHtml(f.status) +
            '" title="' +
            escapeHtml(f.path) +
            '">' +
            '<span class="cuckoo-diff-file-badge ' +
            s.cls +
            '">' +
            s.txt +
            "</span>" +
            '<span class="cuckoo-diff-file-path">' +
            escapeHtml(f.path) +
            "</span>" +
            "</div>"
          );
        })
        .join("");

    list.querySelectorAll(".cuckoo-diff-file").forEach((el) => {
      el.addEventListener("click", () => {
        list
          .querySelectorAll(".cuckoo-diff-file")
          .forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
        openDiffViewer(el.dataset.path, el.dataset.status);
      });
    });
  } catch (err) {
    list.innerHTML =
      '<div class="cuckoo-session-empty">' +
      t("diff.errorPrefix", { msg: escapeHtml(err.message || err) }) +
      "</div>";
  }
}

// ================= Кнопка «Коммит»: все diff в чат =================

/**
 * Собрать unified diff всех изменённых файлов и вставить его в чат
 * вместе с просьбой закоммитить (через агента или самому).
 * Минималистичная кнопка ✓ в шапке панели diff.
 */
async function commitAllToChat(branch) {
  const { t } = require("../i18n/i18n");
  const { sendMessageToChat } = require("../dom/chat-input");
  try {
    const res = await window.electronAPI.gitDiffAll();
    if (!res || !res.success) {
      showToast((res && res.reason) || t("diff.commitAll.notReady"), 3000);
      return;
    }
    const diff = (res.diff || "").trim();
    if (!diff) {
      showToast(t("diff.noDiff"), 3000);
      return;
    }
    const filesCount = (res.files || []).length;
    const branchLine = branch
      ? "Закоммить изменения и запушь в ветку " + branch + "."
      : "Закоммить изменения.";
    const pushLine = branch
      ? "Осмысленный commit message в Conventional Commits, затем git commit и git push в ветку " +
        branch +
        "."
      : "Осмысленный commit message в Conventional Commits, затем push.";
    const msg = [
      branchLine,
      "",
      "Можешь вызвать агента (git-committer) и поручить коммит ему,",
      "или сделай коммит сам — как удобнее. " + pushLine,
      "",
      "Изменённые файлы (" + filesCount + "):",
      (res.files || [])
        .map((f) => "- [" + (f.status || "?") + "] " + f.path)
        .join("\n"),
      "",
      "```diff",
      diff,
      "```",
    ].join("\n");
    sendMessageToChat(msg, "commit-all");
  } catch (err) {
    showToast(t("diff.commitAll.notReady") + ": " + (err.message || err), 3000);
  }
}

/**
 * Показать выбор ветки: открывает оверлей поверх панели diff со списком веток.
 * По выбору — вызывает commitAllToChat(branch) и закрывает панель.
 */
async function showBranchPicker() {
  const { t } = require("../i18n/i18n");
  const overlayId = "cuckoo-branch-picker";
  let overlay = document.getElementById(overlayId);
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = overlayId;
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483600;display:flex;" +
    "align-items:center;justify-content:center;background:rgba(0,0,0,0.45);" +
    "backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);";

  const box = document.createElement("div");
  box.style.cssText =
    "width:min(420px,90vw);max-height:70vh;display:flex;flex-direction:column;" +
    "background:rgba(22,24,44,0.98);border:1px solid rgba(139,147,255,0.35);" +
    "border-radius:14px;box-shadow:0 16px 50px rgba(0,0,0,0.55);overflow:hidden;" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;";

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;" +
    "padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);" +
    "color:#e8eaff;font-size:14px;font-weight:600;";
  header.innerHTML =
    '<span style="display:inline-flex;align-items:center;gap:7px;">' +
    '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" style="display:block"><circle cx="4.5" cy="3.5" r="1.8"/><circle cx="4.5" cy="12.5" r="1.8"/><circle cx="11.5" cy="6.5" r="1.8"/><path d="M4.5 5.3v5.4M6.3 3.5h2.2a3 3 0 0 1 3 3v0"/></svg>' +
    "<span>" +
    t("diff.branch.title") +
    "</span></span>";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.style.cssText =
    "background:transparent;border:none;color:#aab0ff;font-size:20px;" +
    "cursor:pointer;line-height:1;padding:0 4px;";
  closeBtn.addEventListener("click", () => overlay.remove());
  header.appendChild(closeBtn);

  const list = document.createElement("div");
  list.style.cssText =
    "overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px;";
  list.innerHTML =
    '<div style="padding:12px;color:#8a90b8;font-size:13px;text-align:center;">' +
    t("diff.branch.loading") +
    "</div>";

  box.appendChild(header);
  box.appendChild(list);
  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);

  try {
    const res = await window.electronAPI.gitListBranches();
    if (!res || !res.success) {
      list.innerHTML =
        '<div style="padding:12px;color:#ff6b7a;font-size:13px;text-align:center;">' +
        escapeHtml((res && res.reason) || t("diff.branch.selectFailed")) +
        "</div>";
      return;
    }
    const branches = res.branches || [];
    if (branches.length === 0) {
      list.innerHTML =
        '<div style="padding:12px;color:#8a90b8;font-size:13px;text-align:center;">' +
        t("diff.branch.none") +
        "</div>";
      return;
    }
    branches.sort((a, b) => {
      if (a.remote !== b.remote) return a.remote ? 1 : -1;
      if (a.current !== b.current) return a.current ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    list.innerHTML = "";
    branches.forEach((b) => {
      const mark = b.current ? "✓ " : b.remote ? "☁ " : "• ";
      const item = document.createElement("button");
      item.textContent = mark + b.name;
      item.style.cssText =
        "text-align:left;padding:9px 12px;border-radius:9px;cursor:pointer;" +
        "border:1px solid rgba(139,147,255,0.2);background:rgba(139,147,255,0.06);" +
        "color:#cfd3ff;font-size:13px;font-family:inherit;white-space:nowrap;" +
        "overflow:hidden;text-overflow:ellipsis;" +
        (b.current ? "border-color:rgba(139,147,255,0.6);" : "");
      item.addEventListener("mouseenter", () => {
        item.style.background = "rgba(139,147,255,0.18)";
        item.style.color = "#fff";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "rgba(139,147,255,0.06)";
        item.style.color = "#cfd3ff";
      });
      item.addEventListener("click", () => {
        overlay.remove();
        commitAllToChat(b.name);
      });
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML =
      '<div style="padding:12px;color:#ff6b7a;font-size:13px;text-align:center;">' +
      escapeHtml((err && err.message) || t("diff.branch.selectFailed")) +
      "</div>";
  }
}

// ================= Вкладка «История» =================

async function renderGitLog() {
  const list = document.getElementById(LOG_LIST_ID);
  if (!list) return;
  list.innerHTML =
    '<div class="cuckoo-session-empty">' + t("diff.loading") + "</div>";
  try {
    const res = await window.electronAPI.gitLog(COMMITS_LIMIT);
    if (!res || !res.success) {
      list.innerHTML =
        '<div class="cuckoo-session-empty">' +
        escapeHtml((res && res.reason) || t("diff.gitNotFound")) +
        "</div>";
      return;
    }
    const commits = res.commits || [];
    if (commits.length === 0) {
      list.innerHTML =
        '<div class="cuckoo-session-empty">' + t("diff.noCommits") + "</div>";
      return;
    }
    list.innerHTML = commits
      .map(
        (c) =>
          '<div class="cuckoo-commit-item" data-hash="' +
          escapeHtml(c.hash) +
          '" data-subject="' +
          escapeHtml(c.subject) +
          '">' +
          '<span class="cuckoo-commit-subject-line">' +
          escapeHtml(c.subject) +
          "</span>" +
          '<span class="cuckoo-commit-meta-line"><span class="cuckoo-commit-hash">' +
          escapeHtml(c.short) +
          "</span> · " +
          escapeHtml(c.author) +
          " · " +
          escapeHtml(c.date) +
          "</span>" +
          "</div>",
      )
      .join("");

    list.querySelectorAll(".cuckoo-commit-item").forEach((el) => {
      el.addEventListener("click", () => {
        openCommitFiles(el.dataset.hash, el.dataset.subject);
      });
    });
  } catch (err) {
    list.innerHTML =
      '<div class="cuckoo-session-empty">' +
      t("diff.errorPrefix", { msg: escapeHtml(err.message || err) }) +
      "</div>";
  }
}

/** Открыть список файлов коммита. */
async function openCommitFiles(hash, subject) {
  currentCommit = { hash, subject };
  const logList = document.getElementById(LOG_LIST_ID);
  const commitFiles = document.getElementById(COMMIT_FILES_ID);
  const filesList = document.getElementById(COMMIT_FILES_LIST_ID);
  const subjectEl = document.getElementById("cuckoo-commit-subject");

  if (logList) logList.classList.add("cuckoo-hidden");
  if (commitFiles) commitFiles.classList.remove("cuckoo-hidden");
  if (subjectEl) subjectEl.textContent = subject || "";
  if (filesList)
    filesList.innerHTML =
      '<div class="cuckoo-session-empty">' + t("diff.loading") + "</div>";

  try {
    const res = await window.electronAPI.gitCommitFiles(hash);
    if (!res || !res.success) {
      filesList.innerHTML =
        '<div class="cuckoo-session-empty">' +
        escapeHtml((res && res.reason) || t("diff.error")) +
        "</div>";
      return;
    }
    const files = res.files || [];
    if (files.length === 0) {
      filesList.innerHTML =
        '<div class="cuckoo-session-empty">' + t("diff.noFiles") + "</div>";
      return;
    }
    filesList.innerHTML = files
      .map((f) => {
        const s = statusLabel(f.status);
        return (
          '<div class="cuckoo-diff-file" data-path="' +
          escapeHtml(f.path) +
          '" title="' +
          escapeHtml(f.path) +
          '">' +
          '<span class="cuckoo-diff-file-badge ' +
          s.cls +
          '">' +
          s.txt +
          "</span>" +
          '<span class="cuckoo-diff-file-path">' +
          escapeHtml(f.path) +
          "</span>" +
          "</div>"
        );
      })
      .join("");

    filesList.querySelectorAll(".cuckoo-diff-file").forEach((el) => {
      el.addEventListener("click", async () => {
        filesList
          .querySelectorAll(".cuckoo-diff-file")
          .forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
        await openCommitFileViewer(currentCommit.hash, el.dataset.path);
      });
    });
  } catch (err) {
    filesList.innerHTML =
      '<div class="cuckoo-session-empty">' +
      t("diff.errorPrefix", { msg: escapeHtml(err.message || err) }) +
      "</div>";
  }
}

/** Вернуться к списку коммитов. */
function backToLog() {
  currentCommit = null;
  const logList = document.getElementById(LOG_LIST_ID);
  const commitFiles = document.getElementById(COMMIT_FILES_ID);
  if (logList) logList.classList.remove("cuckoo-hidden");
  if (commitFiles) commitFiles.classList.add("cuckoo-hidden");
}

// ================= Внутристроковый diff =================

/**
 * Myers diff на уровне символов для двух строк.
 * Возвращает массив { type: 'equal'|'insert'|'delete', text }.
 */
function intraLineDiff(oldLine, newLine) {
  const m = oldLine.length;
  const n = newLine.length;
  const max = m + n;
  const v = Array(2 * max + 1).fill(0);
  const trace = [];

  for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])) {
        x = v[k + 1 + max];
      } else {
        x = v[k - 1 + max] + 1;
      }
      let y = x - k;
      while (x < m && y < n && oldLine[x] === newLine[y]) {
        x++;
        y++;
      }
      v[k + max] = x;
      if (x >= m && y >= n) {
        return backtrackIntra(trace, oldLine, newLine, d, k, max);
      }
    }
  }
  return [
    { type: "delete", text: oldLine },
    { type: "insert", text: newLine },
  ];
}

function backtrackIntra(trace, oldLine, newLine, d, k, max) {
  const result = [];
  let x = oldLine.length;
  let y = newLine.length;

  for (let depth = d; depth >= 0; depth--) {
    const v = trace[depth];
    const kPrev =
      depth === 0
        ? 0
        : k === -depth || (k !== depth && v[k - 1 + max] < v[k + 1 + max])
          ? k + 1
          : k - 1;
    const xPrev = depth === 0 ? 0 : v[kPrev + max];
    const yPrev = xPrev - kPrev;

    while (x > xPrev && y > yPrev) {
      result.unshift({ type: "equal", text: oldLine[x - 1] });
      x--;
      y--;
    }

    if (depth > 0) {
      if (x > xPrev) {
        result.unshift({ type: "delete", text: oldLine[x - 1] });
        x--;
      } else {
        result.unshift({ type: "insert", text: newLine[y - 1] });
        y--;
      }
    }

    k = kPrev;
  }

  return result;
}

function renderIntraLine(chunks) {
  return chunks
    .map((ch) => {
      const cls =
        ch.type === "insert"
          ? "cuckoo-diff-intra-add"
          : ch.type === "delete"
            ? "cuckoo-diff-intra-del"
            : "";
      return cls
        ? '<span class="' + cls + '">' + escapeHtml(ch.text) + "</span>"
        : escapeHtml(ch.text);
    })
    .join("");
}

// ================= Окно просмотра diff =================

function parseDiffLines(diffText) {
  if (!diffText || !diffText.trim()) return [];
  const lines = diffText.split(/\r?\n/);
  const parsed = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let cls = "ctx";
    if (line.startsWith("+++") || line.startsWith("---")) cls = "meta";
    else if (line.startsWith("@@")) cls = "hunk";
    else if (
      line.startsWith("commit ") ||
      line.startsWith("Author:") ||
      line.startsWith("Date:") ||
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("similarity") ||
      line.startsWith("rename ")
    )
      cls = "meta";
    else if (line.startsWith("+")) cls = "add";
    else if (line.startsWith("-")) cls = "del";

    parsed.push({ text: line, cls, index: i });
  }

  return parsed;
}

function renderUnifiedDiff(diffText) {
  if (!diffText || !diffText.trim()) {
    return '<div class="cuckoo-diff-empty">' + t("diff.empty") + "</div>";
  }

  currentDiffLines = parseDiffLines(diffText);
  currentHunkIndex = -1;

  // Определяем пары -/+ для внутристрокового diff
  const enhanced = [];
  for (let i = 0; i < currentDiffLines.length; i++) {
    const cur = currentDiffLines[i];
    if (
      cur.cls === "del" &&
      i + 1 < currentDiffLines.length &&
      currentDiffLines[i + 1].cls === "add"
    ) {
      const next = currentDiffLines[i + 1];
      const oldLine = cur.text.slice(1);
      const newLine = next.text.slice(1);

      if (
        oldLine.length > 0 &&
        newLine.length > 0 &&
        oldLine.length < 200 &&
        newLine.length < 200
      ) {
        const chunks = intraLineDiff(oldLine, newLine);
        enhanced.push({ ...cur, intra: chunks, prefix: "-" });
        enhanced.push({
          ...next,
          intra: chunks.filter((c) => c.type !== "delete"),
          prefix: "+",
        });
        i++; // skip next
        continue;
      }
    }
    enhanced.push({ ...cur, intra: null });
  }

  let html = enhanced
    .map((item, idx) => {
      const visible = shouldShowLine(item.cls);
      const style = visible ? "" : ' style="display:none"';
      const text = item.intra
        ? (item.prefix || "") + renderIntraLine(item.intra)
        : '<span class="cuckoo-diff-text">' + escapeHtml(item.text) + "</span>";
      return (
        '<div class="cuckoo-diff-line ' +
        item.cls +
        '" data-idx="' +
        idx +
        '"' +
        style +
        ">" +
        text +
        "</div>"
      );
    })
    .join("");

  return (
    '<div class="cuckoo-diff-controls">' +
    renderControls() +
    "</div>" +
    '<div class="cuckoo-diff-content-wrap">' +
    '<div class="cuckoo-diff-minimap"></div>' +
    '<pre class="cuckoo-diff-code">' +
    html +
    "</pre>" +
    "</div>"
  );
}

function renderControls() {
  return (
    '<div class="cuckoo-diff-nav">' +
    '<button id="cuckoo-diff-prev" class="cuckoo-btn-icon-small" title="Previous hunk (p)">◀</button>' +
    '<span id="cuckoo-diff-counter" class="cuckoo-diff-counter">-</span>' +
    '<button id="cuckoo-diff-next" class="cuckoo-btn-icon-small" title="Next hunk (n)">▶</button>' +
    "</div>" +
    '<div class="cuckoo-diff-filters">' +
    '<label class="cuckoo-diff-filter"><input type="checkbox" id="cuckoo-filter-add" checked> Added</label>' +
    '<label class="cuckoo-diff-filter"><input type="checkbox" id="cuckoo-filter-del" checked> Deleted</label>' +
    '<label class="cuckoo-diff-filter"><input type="checkbox" id="cuckoo-filter-ctx" checked> Context</label>' +
    "</div>" +
    '<button id="cuckoo-diff-copy" class="cuckoo-btn-secondary-small" title="Copy entire diff">Copy</button>'
  );
}

function shouldShowLine(cls) {
  if (cls === "add") return diffFilters.showAdded;
  if (cls === "del") return diffFilters.showDeleted;
  if (cls === "ctx") return diffFilters.showContext;
  return true; // meta, hunk всегда показывать
}

function applyFilters() {
  const viewer = document.getElementById(VIEWER_ID);
  if (!viewer) return;
  viewer.querySelectorAll(".cuckoo-diff-line").forEach((line) => {
    const cls = line.classList[1]; // 'add', 'del', 'ctx', etc
    line.style.display = shouldShowLine(cls) ? "" : "none";
  });
  updateMinimap();
}

function attachViewerHandlers() {
  const viewer = document.getElementById(VIEWER_ID);
  if (!viewer) return;

  // Навигация
  const prevBtn = viewer.querySelector("#cuckoo-diff-prev");
  const nextBtn = viewer.querySelector("#cuckoo-diff-next");

  prevBtn?.addEventListener("click", () => navigateHunk(-1));
  nextBtn?.addEventListener("click", () => navigateHunk(1));

  // Фильтры
  viewer
    .querySelector("#cuckoo-filter-add")
    ?.addEventListener("change", (e) => {
      diffFilters.showAdded = e.target.checked;
      applyFilters();
    });
  viewer
    .querySelector("#cuckoo-filter-del")
    ?.addEventListener("change", (e) => {
      diffFilters.showDeleted = e.target.checked;
      applyFilters();
    });
  viewer
    .querySelector("#cuckoo-filter-ctx")
    ?.addEventListener("change", (e) => {
      diffFilters.showContext = e.target.checked;
      applyFilters();
    });

  // Копирование
  viewer.querySelector("#cuckoo-diff-copy")?.addEventListener("click", () => {
    const lines = currentDiffLines.map((l) => l.text).join("\n");
    navigator.clipboard
      .writeText(lines)
      .then(() => {
        showToast("Diff copied", 2000);
      })
      .catch(() => {
        showToast("Copy failed", 2000);
      });
  });

  // Клик на строку → копировать без префикса
  viewer.querySelectorAll(".cuckoo-diff-line").forEach((line) => {
    line.addEventListener("click", () => {
      const text = line.textContent || "";
      const clean =
        text.startsWith("+") || text.startsWith("-") ? text.slice(1) : text;
      navigator.clipboard.writeText(clean).catch(() => {});
      line.classList.add("cuckoo-diff-line-copied");
      setTimeout(() => line.classList.remove("cuckoo-diff-line-copied"), 500);
    });
  });

  // Хоткеи
  const keyHandler = (e) => {
    if (e.key === "n") navigateHunk(1);
    if (e.key === "p") navigateHunk(-1);
  };
  viewer.addEventListener("keydown", keyHandler);
  viewer.dataset.keyAttached = "true";

  // Мини-карта
  updateMinimap();
}

function navigateHunk(direction) {
  const hunks = currentDiffLines
    .map((l, i) => ({ ...l, i }))
    .filter((l) => l.cls === "hunk");
  if (hunks.length === 0) return;

  currentHunkIndex += direction;
  if (currentHunkIndex < 0) currentHunkIndex = 0;
  if (currentHunkIndex >= hunks.length) currentHunkIndex = hunks.length - 1;

  const target = hunks[currentHunkIndex];
  const viewer = document.getElementById(VIEWER_ID);
  const body = viewer?.querySelector(".cuckoo-diff-viewer-body");
  const lineEl = body?.querySelector(
    `.cuckoo-diff-line[data-idx="${target.i}"]`,
  );

  if (lineEl) {
    body
      .querySelectorAll(".cuckoo-diff-line.active")
      .forEach((l) => l.classList.remove("active"));
    lineEl.classList.add("active");
    lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const counter = viewer?.querySelector("#cuckoo-diff-counter");
  if (counter)
    counter.textContent = `${currentHunkIndex + 1} / ${hunks.length}`;
}

function updateMinimap() {
  const viewer = document.getElementById(VIEWER_ID);
  const minimap = viewer?.querySelector(".cuckoo-diff-minimap");
  if (!minimap) return;

  const visible = currentDiffLines.filter((l) => shouldShowLine(l.cls));
  const height = Math.max(200, visible.length * 2);
  minimap.style.height = height + "px";

  minimap.innerHTML = visible
    .map((line, idx) => {
      const color =
        line.cls === "add"
          ? "#4ade80"
          : line.cls === "del"
            ? "#ff6b7a"
            : line.cls === "hunk"
              ? "#8b93ff"
              : "#333";
      const top = (idx / visible.length) * height;
      return `<div class="cuckoo-minimap-seg" style="top:${top}px;background:${color}"></div>`;
    })
    .join("");
}

async function openDiffViewer(filePath, status) {
  const cacheKey = `status:${filePath}`;
  let diffText = diffCache.get(cacheKey);

  const viewer = document.getElementById(VIEWER_ID);
  if (!viewer) return;
  const titleEl = viewer.querySelector("#cuckoo-diff-viewer-title");
  const bodyEl = viewer.querySelector("#cuckoo-diff-viewer-body");
  if (titleEl) titleEl.textContent = filePath;
  if (bodyEl)
    bodyEl.innerHTML =
      '<div class="cuckoo-diff-empty">' + t("diff.loading") + "</div>";
  viewer.classList.remove("cuckoo-hidden");

  if (!diffText) {
    try {
      const res = await window.electronAPI.gitDiffFile(filePath, status);
      if (!res || !res.success) {
        bodyEl.innerHTML =
          '<div class="cuckoo-diff-empty">' +
          escapeHtml((res && res.reason) || t("diff.diffFailed")) +
          "</div>";
        return;
      }
      diffText = res.diff || "";
      diffCache.set(cacheKey, diffText);
    } catch (err) {
      bodyEl.innerHTML =
        '<div class="cuckoo-diff-empty">' +
        t("diff.errorPrefix", { msg: escapeHtml(err.message || err) }) +
        "</div>";
      return;
    }
  }

  bodyEl.innerHTML = renderUnifiedDiff(diffText);
  attachViewerHandlers();
  restoreViewerPosition();
  makeDiffViewerDraggable();
}

async function openCommitFileViewer(hash, filePath) {
  const cacheKey = `commit:${hash}:${filePath}`;
  let diffText = diffCache.get(cacheKey);

  const viewer = document.getElementById(VIEWER_ID);
  if (!viewer) return;
  const titleEl = viewer.querySelector("#cuckoo-diff-viewer-title");
  const bodyEl = viewer.querySelector("#cuckoo-diff-viewer-body");
  if (titleEl)
    titleEl.textContent = filePath + " @ " + (hash || "").slice(0, 7);
  if (bodyEl)
    bodyEl.innerHTML =
      '<div class="cuckoo-diff-empty">' + t("diff.loading") + "</div>";
  viewer.classList.remove("cuckoo-hidden");

  if (!diffText) {
    try {
      const res = await window.electronAPI.gitCommitFileDiff(hash, filePath);
      if (!res || !res.success) {
        bodyEl.innerHTML =
          '<div class="cuckoo-diff-empty">' +
          escapeHtml((res && res.reason) || t("diff.diffFailed")) +
          "</div>";
        return;
      }
      diffText = res.diff || "";
      diffCache.set(cacheKey, diffText);
    } catch (err) {
      bodyEl.innerHTML =
        '<div class="cuckoo-diff-empty">' +
        t("diff.errorPrefix", { msg: escapeHtml(err.message || err) }) +
        "</div>";
      return;
    }
  }

  bodyEl.innerHTML = renderUnifiedDiff(diffText);
  attachViewerHandlers();
  restoreViewerPosition();
  makeDiffViewerDraggable();
}

async function openCommitFullDiff() {
  if (!currentCommit) return;
  const cacheKey = `full:${currentCommit.hash}`;
  let diffText = diffCache.get(cacheKey);

  const viewer = document.getElementById(VIEWER_ID);
  if (!viewer) return;
  const titleEl = viewer.querySelector("#cuckoo-diff-viewer-title");
  const bodyEl = viewer.querySelector("#cuckoo-diff-viewer-body");
  if (titleEl)
    titleEl.textContent =
      t("diff.commit.titlePrefix") + (currentCommit.hash || "").slice(0, 7);
  if (bodyEl)
    bodyEl.innerHTML =
      '<div class="cuckoo-diff-empty">' + t("diff.loading") + "</div>";
  viewer.classList.remove("cuckoo-hidden");

  if (!diffText) {
    try {
      const res = await window.electronAPI.gitCommitDiff(currentCommit.hash);
      if (!res || !res.success) {
        bodyEl.innerHTML =
          '<div class="cuckoo-diff-empty">' +
          escapeHtml((res && res.reason) || t("diff.diffFailed")) +
          "</div>";
        return;
      }
      diffText = res.diff || "";
      diffCache.set(cacheKey, diffText);
    } catch (err) {
      bodyEl.innerHTML =
        '<div class="cuckoo-diff-empty">' +
        t("diff.errorPrefix", { msg: escapeHtml(err.message || err) }) +
        "</div>";
      return;
    }
  }

  bodyEl.innerHTML = renderUnifiedDiff(diffText);
  attachViewerHandlers();
  restoreViewerPosition();
  makeDiffViewerDraggable();
}

function closeDiffViewer() {
  const viewer = document.getElementById(VIEWER_ID);
  if (viewer) viewer.classList.add("cuckoo-hidden");
}

// ================= Перетаскивание viewer =================

const VIEWER_POS_KEY = "cuckoo-diff-viewer-pos";

function restoreViewerPosition() {
  const viewer = document.getElementById(VIEWER_ID);
  if (!viewer) return;
  try {
    const raw = localStorage.getItem(VIEWER_POS_KEY);
    if (!raw) return;
    const pos = JSON.parse(raw);
    if (typeof pos.left === "number" && typeof pos.top === "number") {
      viewer.style.left = pos.left + "px";
      viewer.style.top = pos.top + "px";
      viewer.style.transform = "none";
    }
  } catch (_) {}
}

function makeDiffViewerDraggable() {
  const viewer = document.getElementById(VIEWER_ID);
  const header = viewer?.querySelector(".cuckoo-wm-header");
  if (!viewer || !header) return;

  let dragging = false;
  let startX = 0,
    startY = 0,
    startLeft = 0,
    startTop = 0;

  const onDown = (e) => {
    if (e.target.closest("button") || e.target.closest(".cuckoo-btn-icon"))
      return;

    dragging = true;
    const rect = viewer.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;

    // Отключаем центрирование при первом перетаскивании
    viewer.style.transform = "none";

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  const onMove = (e) => {
    if (!dragging) return;
    let left = startLeft + (e.clientX - startX);
    let top = startTop + (e.clientY - startY);

    // Не выпускаем за пределы экрана
    const maxLeft = Math.max(0, window.innerWidth - 200);
    const maxTop = Math.max(0, window.innerHeight - 100);
    left = Math.max(0, Math.min(maxLeft, left));
    top = Math.max(0, Math.min(maxTop, top));

    viewer.style.left = left + "px";
    viewer.style.top = top + "px";
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);

    try {
      const rect = viewer.getBoundingClientRect();
      localStorage.setItem(
        VIEWER_POS_KEY,
        JSON.stringify({ left: rect.left, top: rect.top }),
      );
    } catch (_) {}
  };

  header.addEventListener("mousedown", onDown);
}

// ================= Панель =================

function openDiffPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel.classList.remove("cuckoo-hidden");
  currentCommit = null;
  diffCache.clear(); // сбросить кэш при открытии
  setActiveTab("changes");
}

function closeDiffPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel.classList.add("cuckoo-hidden");
  closeDiffViewer();
}

function toggleDiffPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  if (panel.classList.contains("cuckoo-hidden")) openDiffPanel();
  else closeDiffPanel();
}

module.exports = {
  openDiffPanel,
  closeDiffPanel,
  toggleDiffPanel,
  renderDiffList,
  renderGitLog,
  closeDiffViewer,
  setActiveTab,
  backToLog,
  openCommitFullDiff,
  commitAllToChat,
  showBranchPicker,
};
