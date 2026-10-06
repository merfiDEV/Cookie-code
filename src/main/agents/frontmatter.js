/**
 * Парсер YAML-frontmatter (минимальный, без внешних зависимостей).
 *
 * Ожидаемый формат:
 *   ---
 *   name: value
 *   description: some text
 *   tools: read, grep, glob
 *   maxTurns: 20
 *   ---
 *   <тело>
 *
 * Поддерживает: строки (без кавычек), строки в одинарных/двойных кавычках,
 * массивы в виде "- item" на отдельной строке, массив через запятую в одной
 * строке. Вложенные объекты и блоки "|" НЕ поддерживаются (нам не нужны).
 */

function stripQuotes(s) {
  if (typeof s !== "string") return s;
  const t = s.trim();
  if (t.length >= 2) {
    const a = t[0],
      b = t[t.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return t.slice(1, -1);
    }
  }
  return s;
}

/**
 * Распарсить frontmatter.
 * @param {string} raw
 * @returns {{data: Object, body: string}}
 */
function parseFrontmatter(raw) {
  const text = String(raw || "");
  // Frontmatter должен начинаться с первой строки "---"
  if (!/^---\s*\r?\n/.test(text)) {
    return { data: {}, body: text };
  }
  const rest = text.replace(/^---\s*\r?\n/, "");
  const endMatch = rest.match(/\r?\n---\s*(\r?\n|$)/);
  if (!endMatch) return { data: {}, body: text };
  const fmRaw = rest.slice(0, endMatch.index);
  const body = rest.slice(endMatch.index + endMatch[0].length);

  const data = {};
  let lastKey = null;
  for (const rawLine of fmRaw.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    // Массив "- item"
    if (/^\s*-\s+/.test(rawLine) && lastKey) {
      const item = stripQuotes(rawLine.replace(/^\s*-\s+/, ""));
      if (!Array.isArray(data[lastKey])) data[lastKey] = [];
      data[lastKey].push(item);
      continue;
    }
    const m = rawLine.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const valueRaw = m[2];
    lastKey = key;
    if (valueRaw === "") {
      data[key] = "";
      continue;
    }
    // Массив в одну строку через запятую (для tools)
    if (key === "tools" || key === "paths") {
      data[key] = valueRaw
        .split(",")
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean);
    } else {
      data[key] = stripQuotes(valueRaw);
    }
  }
  return { data, body };
}

module.exports = { parseFrontmatter };
