/**
 * Хранилище долговременной памяти AI-ассистента.
 *
 * Файл: <userData>/memory.md — общий для всех профилей и проектов.
 * Формат: append-заметка с датой, одна запись — одна строка:
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

const HEADER =
  "# Память Cookie Code\n\nЗаметки о пользователе, его системе и предпочтениях.\nФормат: - [YYYY-MM-DD] текст\n\n";

function getMemoryPath() {
  return path.join(app.getPath("userData"), "memory.md");
}

function ensureFile() {
  const file = getMemoryPath();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, HEADER, "utf-8");
  }
  return file;
}

/** Прочитать содержимое памяти (пустая строка, если файла нет). */
function readMemory() {
  try {
    const file = getMemoryPath();
    if (!fs.existsSync(file)) return "";
    return fs.readFileSync(file, "utf-8");
  } catch (err) {
    console.error("[MemoryStore] чтение памяти失败:", err.message);
    return "";
  }
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
 * @returns {{ok: true, entry: string} | {ok: false, error: string}}
 */
function appendMemory(text) {
  try {
    if (typeof text !== "string")
      return { ok: false, error: "text must be a string" };
    let t = text.trim();
    if (!t) return { ok: false, error: "text must be a non-empty string" };
    if (t.length > MAX_ENTRY_LEN) t = t.slice(0, MAX_ENTRY_LEN) + "…";
    // Однострочная запись: переносы заменяем пробелами.
    t = t.replace(/\s*\r?\n\s*/g, " ");
    const entry = "- [" + todayStamp() + "] " + t;
    ensureFile();
    const file = getMemoryPath();
    let existing = fs.readFileSync(file, "utf-8");
    if (existing.length > 0 && !existing.endsWith("\n")) existing += "\n";
    fs.writeFileSync(file, existing + entry + "\n", "utf-8");
    console.log("[MemoryStore] добавлена запись: " + entry);
    return { ok: true, entry };
  } catch (err) {
    console.error("[MemoryStore] запись памяти失败:", err.message);
    return { ok: false, error: err.message };
  }
}

/** Полностью очистить память (файл остаётся с заголовком). */
function clearMemory() {
  try {
    fs.writeFileSync(getMemoryPath(), HEADER, "utf-8");
    console.log("[MemoryStore] память очищена");
    return { ok: true };
  } catch (err) {
    console.error("[MemoryStore] очистка памяти失败:", err.message);
    return { ok: false, error: err.message };
  }
}

/** Статистика: существует ли файл, размер в байтах, число записей. */
function getStats() {
  try {
    const file = getMemoryPath();
    if (!fs.existsSync(file)) return { exists: false, bytes: 0, entries: 0 };
    const raw = fs.readFileSync(file, "utf-8");
    const bytes = Buffer.byteLength(raw, "utf-8");
    const entries = raw.split(/\r?\n/).filter((l) => /^-\s*\[/.test(l)).length;
    return { exists: true, bytes, entries };
  } catch (err) {
    return { exists: false, bytes: 0, entries: 0, error: err.message };
  }
}

module.exports = {
  MAX_ENTRY_LEN,
  getMemoryPath,
  ensureFile,
  readMemory,
  appendMemory,
  clearMemory,
  getStats,
};
