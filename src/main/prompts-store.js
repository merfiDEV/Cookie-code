/**
 * Хранилище промптов проекта: <projectDir>/.cookie/prompts/*.md
 * Один промпт — один .md файл. Имя файла = имя промпта (санитизированное).
 * Содержимое файла = текст промпта (без заголовка).
 */
const fs = require("fs");
const path = require("path");

const PROMPTS_DIR = ".cookie";
const PROMPTS_SUB = "prompts";

function promptsDir(projectDir) {
  if (!projectDir) return null;
  return path.join(projectDir, PROMPTS_DIR, PROMPTS_SUB);
}

function safeName(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  // Убираем разделители пути и недопустимые символы Windows.
  return s
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.md$/i, "")
    .slice(0, 120);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Список промптов: [{ name, text }] */
function list(projectDir) {
  const dir = promptsDir(projectDir);
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.toLowerCase().endsWith(".md")) continue;
    try {
      const text = fs.readFileSync(path.join(dir, f), "utf-8");
      out.push({ name: f.replace(/\.md$/i, ""), text });
    } catch (_) {}
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Сохранить (создать/перезаписать) промпт. */
function save(projectDir, name, text) {
  const dir = promptsDir(projectDir);
  const clean = safeName(name);
  if (!dir) return { ok: false, error: "проект не инициализирован" };
  if (!clean) return { ok: false, error: "пустое имя" };
  ensureDir(dir);
  const file = path.join(dir, clean + ".md");
  fs.writeFileSync(file, String(text == null ? "" : text), "utf-8");
  return { ok: true, name: clean };
}

/** Удалить промпт по имени. */
function remove(projectDir, name) {
  const dir = promptsDir(projectDir);
  const clean = safeName(name);
  if (!dir || !clean) return { ok: false, error: "неверное имя" };
  const file = path.join(dir, clean + ".md");
  try {
    if (fs.existsSync(file)) fs.rmSync(file);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { list, save, remove, promptsDir };
