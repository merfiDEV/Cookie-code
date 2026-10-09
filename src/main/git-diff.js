/**
 * Git-интеграция для панели «Изменения».
 * Берёт данные из git (status + unified diff), а не из in-memory лога.
 */
const { execFile } = require("child_process");

/**
 * Запустить git-команду.
 * @param {string} cwd - рабочая директория (корень проекта)
 * @param {string[]} args
 * @returns {Promise<{ok:boolean, stdout:string, stderr:string, code:number}>}
 */
function git(cwd, args) {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: stdout || "",
          stderr: stderr || "",
          code: err && typeof err.code === "number" ? err.code : err ? 1 : 0,
        });
      },
    );
  });
}

/**
 * Проверить, что директория — git-репозиторий.
 * @returns {Promise<{isRepo:boolean, root:string|null, reason?:string}>}
 */
async function checkRepo(projectDir) {
  if (!projectDir)
    return { isRepo: false, root: null, reason: "Проект не инициализирован" };
  const r = await git(projectDir, ["rev-parse", "--show-toplevel"]);
  if (!r.ok) {
    return {
      isRepo: false,
      root: null,
      reason: r.stderr.trim() || "Не git-репозиторий",
    };
  }
  return { isRepo: true, root: r.stdout.trim() };
}

/**
 * Разобрать вывод `git status --porcelain=v1`.
 * @returns {Array<{path:string, origPath:string|null, index:string, worktree:string, status:string}>}
 */
function parseStatus(stdout) {
  const out = [];
  for (const raw of stdout.split(/\r?\n/)) {
    if (!raw) continue;
    const x = raw[0];
    const y = raw[1];
    let rest = raw.slice(3);
    let origPath = null;
    // Переименования: "R  old -> new"
    const arrow = rest.indexOf(" -> ");
    if (arrow !== -1 && (x === "R" || y === "R")) {
      origPath = rest.slice(0, arrow).replace(/^"|"$/g, "");
      rest = rest.slice(arrow + 4);
    }
    const path = rest.replace(/^"|"$/g, "");
    let status;
    if (x === "?" && y === "?") status = "untracked";
    else if (x === "A") status = "added";
    else if (x === "D" || y === "D") status = "deleted";
    else if (x === "R") status = "renamed";
    else if (x === "M" || y === "M") status = "modified";
    else status = "changed";
    out.push({ path, origPath, index: x, worktree: y, status });
  }
  return out;
}

/**
 * Получить список изменённых файлов.
 * @returns {Promise<{success:boolean, files?:Array, reason?:string}>}
 */
async function getStatus(projectDir) {
  const repo = await checkRepo(projectDir);
  if (!repo.isRepo)
    return { success: false, reason: "git не найден: " + (repo.reason || "") };
  const r = await git(repo.root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  if (!r.ok)
    return { success: false, reason: r.stderr.trim() || "git status failed" };

  // -z формат: записи разделены NUL; переименования содержат два NUL-поля
  const parts = r.stdout.split("\u0000").filter(Boolean);
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];
    const x = rec[0],
      y = rec[1];
    let path = rec.slice(3);
    let origPath = null;
    if (x === "R" || x === "C") {
      // следующий элемент — исходный путь
      origPath = parts[++i] || null;
    }
    let status;
    if (x === "?" && y === "?") status = "untracked";
    else if (x === "A") status = "added";
    else if (x === "D" || y === "D") status = "deleted";
    else if (x === "R") status = "renamed";
    else if (x === "M" || y === "M") status = "modified";
    else status = "changed";
    files.push({ path, origPath, index: x, worktree: y, status });
  }
  return { success: true, root: repo.root, files };
}

/**
 * Получить unified diff одного файла (против HEAD, включая stage+worktree).
 * Для untracked — синтетический diff через --no-index с /dev/null.
 * @param {string} projectDir
 * @param {string} filePath - относительный путь (как в git status)
 * @param {string} status - тип (untracked → --no-index)
 * @returns {Promise<{success:boolean, diff?:string, reason?:string}>}
 */
async function getFileDiff(projectDir, filePath, status) {
  const repo = await checkRepo(projectDir);
  if (!repo.isRepo)
    return { success: false, reason: "git не найден: " + (repo.reason || "") };

  if (status === "untracked") {
    // /dev/null через git показываем как новый файл
    const r = await git(repo.root, [
      "diff",
      "--no-index",
      "--no-color",
      "--",
      process.platform === "win32" ? "NUL" : "/dev/null",
      filePath,
    ]);
    // --no-index возвращает код 1 при наличии различий — это нормально
    const diff = r.stdout || "";
    if (diff) return { success: true, diff };
    // fallback: просто показать содержимое файла как «+» строки
    try {
      const fs = require("fs");
      const path = require("path");
      const abs = path.join(repo.root, filePath);
      const content = fs.readFileSync(abs, "utf-8");
      const lines = content.split(/\r?\n/);
      const fake = [
        "diff --git a/" + filePath + " b/" + filePath,
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/" + filePath,
        "@@ -0,0 +1," + lines.length + " @@",
      ]
        .concat(lines.map((l) => "+" + l))
        .join("\n");
      return { success: true, diff: fake };
    } catch (e) {
      return {
        success: false,
        reason: "Не удалось прочитать файл: " + e.message,
      };
    }
  }

  const r = await git(repo.root, [
    "diff",
    "HEAD",
    "--no-color",
    "--",
    filePath,
  ]);
  if (!r.ok)
    return { success: false, reason: r.stderr.trim() || "git diff failed" };
  return { success: true, diff: r.stdout };
}

/**
 * Получить последние коммиты (git log).
 * @param {string} projectDir
 * @param {number} [limit] - сколько коммитов (по умолчанию 20)
 * @returns {Promise<{success:boolean, commits?:Array<{hash:string,short:string,author:string,date:string,subject:string}>, reason?:string}>}
 */
async function getLog(projectDir, limit) {
  const repo = await checkRepo(projectDir);
  if (!repo.isRepo)
    return { success: false, reason: "git не найден: " + (repo.reason || "") };
  const n = Math.max(1, Math.min(200, limit || 20));
  // Разделители: RS (0x1e) между записями, US (0x1f) между полями
  const fmt = "%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1e";
  const r = await git(repo.root, [
    "log",
    "-n",
    String(n),
    "--date=iso",
    "--pretty=format:" + fmt,
  ]);
  if (!r.ok)
    return { success: false, reason: r.stderr.trim() || "git log failed" };
  const commits = r.stdout
    .split("\x1e")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((rec) => {
      const p = rec.split("\x1f");
      return {
        hash: p[0] || "",
        short: p[1] || "",
        author: p[2] || "",
        date: p[3] || "",
        subject: p[4] || "",
      };
    });
  return { success: true, root: repo.root, commits };
}

/**
 * Получить unified diff одного коммита (все файлы).
 * @param {string} projectDir
 * @param {string} hash
 * @returns {Promise<{success:boolean, diff?:string, reason?:string}>}
 */
async function getCommitDiff(projectDir, hash) {
  const repo = await checkRepo(projectDir);
  if (!repo.isRepo)
    return { success: false, reason: "git не найден: " + (repo.reason || "") };
  if (!hash) return { success: false, reason: "hash is required" };
  const r = await git(repo.root, [
    "show",
    "--no-color",
    "--stat",
    "--patch",
    hash,
  ]);
  if (!r.ok)
    return { success: false, reason: r.stderr.trim() || "git show failed" };
  return { success: true, diff: r.stdout };
}

/**
 * Список файлов, изменённых в коммите.
 * @returns {Promise<{success:boolean, files?:Array<{status:string,path:string}>, reason?:string}>}
 */
async function getCommitFiles(projectDir, hash) {
  const repo = await checkRepo(projectDir);
  if (!repo.isRepo)
    return { success: false, reason: "git не найден: " + (repo.reason || "") };
  if (!hash) return { success: false, reason: "hash is required" };
  const r = await git(repo.root, [
    "show",
    "--name-status",
    "--pretty=format:",
    hash,
  ]);
  if (!r.ok)
    return { success: false, reason: r.stderr.trim() || "git show failed" };
  const files = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(/\t/);
    const code = (parts[0] || "").trim();
    let path = (parts[1] || "").trim();
    if (code.startsWith("R") && parts[2]) path = parts[2].trim();
    let status = "changed";
    if (code.startsWith("A")) status = "added";
    else if (code.startsWith("M")) status = "modified";
    else if (code.startsWith("D")) status = "deleted";
    else if (code.startsWith("R")) status = "renamed";
    files.push({ status, path });
  }
  return { success: true, files };
}

/**
 * Unified diff одного файла в рамках коммита.
 * @returns {Promise<{success:boolean, diff?:string, reason?:string}>}
 */
async function getCommitFileDiff(projectDir, hash, filePath) {
  const repo = await checkRepo(projectDir);
  if (!repo.isRepo)
    return { success: false, reason: "git не найден: " + (repo.reason || "") };
  if (!hash) return { success: false, reason: "hash is required" };
  if (!filePath) return { success: false, reason: "filePath is required" };
  const r = await git(repo.root, ["show", "--no-color", hash, "--", filePath]);
  if (!r.ok)
    return { success: false, reason: r.stderr.trim() || "git show failed" };
  return { success: true, diff: r.stdout };
}

/**
 * Получить объединённый unified diff всех изменённых файлов (status + worktree).
 * Используется кнопкой «Вставить все diff в чат».
 * @param {string} projectDir
 * @returns {Promise<{success:boolean, diff?:string, files?:Array, reason?:string}>}
 */
async function getAllDiff(projectDir) {
  const st = await getStatus(projectDir);
  if (!st.success) return { success: false, reason: st.reason };
  const files = st.files || [];
  if (files.length === 0) return { success: true, diff: "", files: [] };

  const parts = [];
  for (const f of files) {
    const r = await getFileDiff(projectDir, f.path, f.status);
    if (r && r.success && r.diff && r.diff.trim()) {
      parts.push(r.diff.trimEnd());
    }
  }
  return { success: true, diff: parts.join("\n\n"), files };
}

/**
 * Список веток репозитория (локальные + удалённые).
 * @param {string} projectDir
 * @returns {Promise<{success:boolean, branches?:Array<{name:string, remote:boolean, current:boolean}>, reason?:string}>}
 */
async function listBranches(projectDir) {
  const repo = await checkRepo(projectDir);
  if (!repo.isRepo)
    return { success: false, reason: "git не найден: " + (repo.reason || "") };
  const r = await git(repo.root, [
    "branch",
    "-a",
    "--no-color",
    "--format=%(HEAD)%(refname)",
  ]);
  if (!r.ok)
    return { success: false, reason: r.stderr.trim() || "git branch failed" };
  const branches = [];
  const seen = new Set();
  for (const raw of r.stdout.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const current = raw[0] === "*";
    let ref = raw.slice(1).trim();
    const remote = ref.startsWith("refs/remotes/");
    if (ref.startsWith("refs/heads/")) ref = ref.slice("refs/heads/".length);
    else if (remote) ref = ref.slice("refs/remotes/".length);
    // Пропускаем симлинк HEAD удалённых (origin/HEAD).
    if (ref.endsWith("/HEAD")) continue;
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    branches.push({ name: ref, remote, current });
  }
  return { success: true, root: repo.root, branches };
}

/**
 * Текущая ветка репозитория.
 * @param {string} projectDir
 * @returns {Promise<{success:boolean, branch?:string, reason?:string}>}
 */
async function currentBranch(projectDir) {
  const repo = await checkRepo(projectDir);
  if (!repo.isRepo)
    return { success: false, reason: "git не найден: " + (repo.reason || "") };
  const r = await git(repo.root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!r.ok) return { success: false, reason: r.stderr.trim() || "git failed" };
  return { success: true, branch: r.stdout.trim() };
}

module.exports = {
  checkRepo,
  getStatus,
  getFileDiff,
  getAllDiff,
  parseStatus,
  getLog,
  getCommitDiff,
  getCommitFiles,
  getCommitFileDiff,
  listBranches,
  currentBranch,
};
