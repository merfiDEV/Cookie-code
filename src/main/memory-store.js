/**
 * Хранилище долговременной памяти AI-ассистента.
 *
 * Два уровня:
 *   - Глобальная: <userData>/memory.md — общая для всех профилей и проектов.
 *   - Проектная:  <projectDir>/.cuckoo/memory/ProjectMemory.md — своя для каждого проекта.
 *
 * Формат (единый для обоих уровней): append-заметка с датой, одна запись — одна строка:
 *   - [YYYY-MM-DD] текст записи
 *
 * Модуль живёт в main-процессе; инструменты (tools/MemoryTool.js) ходят
 * сюда через toolRegistry.
 */
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

// Максимальная длина одной записи (символов). Слишком длинные тексты режем.
const MAX_ENTRY_LEN = 2000;

const GLOBAL_HEADER =
  "# Память Cookie Code\n\nЗаметки о пользователе, его системе и предпочтениях.\nФормат: - [YYYY-MM-DD] текст\n\n";

const PROJECT_HEADER =
  "# Память проекта\n\nЗаметки о данном проекте: соглашения, архитектурные решения, важные пути.\nФормат: - [YYYY-MM-DD] текст\n\n";

/** Путь к глобальному файлу памяти. */
function getGlobalMemoryPath() {
  return path.join(app.getPath("userData"), "memory.md");
}

/** Путь к проектному файлу памяти (папка создаётся при записи). */
function getProjectMemoryPath(projectDir) {
  if (!projectDir) return null;
  return path.join(projectDir, ".cuckoo", "memory", "ProjectMemory.md");
}

/**
 * Путь к файлу памяти по scope.
 * @param {'global'|'project'} scope
 * @param {string|null} projectDir
 * @returns {string|null}
 */
function getMemoryPath(scope, projectDir) {
  if (scope === "project") return getProjectMemoryPath(projectDir);
  return getGlobalMemoryPath();
}

function ensureFile(file, header) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, header, "utf-8");
  }
  return file;
}

/**
 * Прочитать содержимое одного файла памяти.
 * @param {'global'|'project'} scope
 * @param {string|null} projectDir
 * @returns {string}
 */
function readOne(scope, projectDir) {
  try {
    const file = getMemoryPath(scope, projectDir);
    if (!file || !fs.existsSync(file)) return "";
    return fs.readFileSync(file, "utf-8");
  } catch (err) {
    console.error(
      "[MemoryStore] чтение памяти (" + scope + ")失败:",
      err.message,
    );
    return "";
  }
}

/**
 * Прочитать память.
 * @param {object} [opts]
 * @param {'all'|'global'|'project'} [opts.scope='all']
 * @param {string|null} [opts.projectDir]
 * @returns {string}
 */
function readMemory(opts) {
  const o = opts || {};
  const scope = o.scope || "all";
  const projectDir = o.projectDir || null;

  if (scope === "global") return readOne("global", projectDir);
  if (scope === "project") return readOne("project", projectDir);

  // all: проектная, потом глобальная. Без заголовков "# ..." — они в файлах.
  const parts = [];
  const p = readOne("project", projectDir);
  const g = readOne("global", projectDir);
  if (p && p.trim()) parts.push(p.trim());
  if (g && g.trim()) parts.push(g.trim());
  return parts.join("\n\n");
}

/** Текущая дата в формате YYYY-MM-DD (локально). */
function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

/**
 * Добавить одну запись в память.
 * @param {string} text  непустой текст (trim); длиннее MAX_ENTRY_LEN — обрезается
 * @param {object} [opts]
 * @param {'global'|'project'} [opts.scope='global']
 * @param {string|null} [opts.projectDir]
 * @returns {{ok: true, entry: string, path: string} | {ok: false, error: string}}
 */
function appendMemory(text, opts) {
  try {
    if (typeof text !== "string")
      return { ok: false, error: "text must be a string" };
    let t = text.trim();
    if (!t) return { ok: false, error: "text must be a non-empty string" };
    if (t.length > MAX_ENTRY_LEN) t = t.slice(0, MAX_ENTRY_LEN) + "…";
    // Однострочная запись: переносы заменяем пробелами.
    t = t.replace(/\s*\r?\n\s*/g, " ");
    const entry = "- [" + todayStamp() + "] " + t;

    const o = opts || {};
    const scope = o.scope === "project" ? "project" : "global";
    const file = getMemoryPath(scope, o.projectDir || null);
    if (!file)
      return { ok: false, error: "projectDir не задан для проектной памяти" };

    const header = scope === "project" ? PROJECT_HEADER : GLOBAL_HEADER;
    ensureFile(file, header);

    let existing = fs.readFileSync(file, "utf-8");
    if (existing.length > 0 && !existing.endsWith("\n")) existing += "\n";
    fs.writeFileSync(file, existing + entry + "\n", "utf-8");
    console.log("[MemoryStore] добавлена запись (" + scope + "): " + entry);
    return { ok: true, entry, path: file };
  } catch (err) {
    console.error("[MemoryStore] запись памяти失败:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Полностью очистить память (файл остаётся с заголовком).
 * @param {object} [opts]
 * @param {'global'|'project'} [opts.scope='global']
 * @param {string|null} [opts.projectDir]
 * @returns {{ok: true} | {ok: false, error: string}}
 */
function clearMemory(opts) {
  try {
    const o = opts || {};
    const scope = o.scope === "project" ? "project" : "global";
    const file = getMemoryPath(scope, o.projectDir || null);
    if (!file)
      return { ok: false, error: "projectDir не задан для проектной памяти" };
    const header = scope === "project" ? PROJECT_HEADER : GLOBAL_HEADER;
    ensureFile(file, header);
    fs.writeFileSync(file, header, "utf-8");
    console.log("[MemoryStore] память очищена (" + scope + ")");
    return { ok: true };
  } catch (err) {
    console.error("[MemoryStore] очистка памяти失败:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Статистика по файлу памяти.
 * @param {object} [opts]
 * @param {'global'|'project'} [opts.scope='global']
 * @param {string|null} [opts.projectDir]
 */
function getStats(opts) {
  try {
    const o = opts || {};
    const scope = o.scope === "project" ? "project" : "global";
    const file = getMemoryPath(scope, o.projectDir || null);
    if (!file || !fs.existsSync(file))
      return { exists: false, bytes: 0, entries: 0, path: file };
    const raw = fs.readFileSync(file, "utf-8");
    const bytes = Buffer.byteLength(raw, "utf-8");
    const entries = raw.split(/\r?\n/).filter((l) => /^-\s*\[/.test(l)).length;
    return { exists: true, bytes, entries, path: file };
  } catch (err) {
    return { exists: false, bytes: 0, entries: 0, error: err.message };
  }
}

module.exports = {
  MAX_ENTRY_LEN,
  getGlobalMemoryPath,
  getProjectMemoryPath,
  getMemoryPath,
  ensureFile,
  readMemory,
  appendMemory,
  clearMemory,
  getStats,
};
