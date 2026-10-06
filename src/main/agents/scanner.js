/**
 * Сканер субагентов: проектные + пользовательские каталоги -> AgentMeta[].
 *
 * Правила:
 *  - Сканируется только <base>/.cuckoo/agents/ — один уровень, только .md
 *  - Имя: frontmatter.name || basename(file, '.md')
 *  - Описание: frontmatter.description || первый непустой абзац тела
 *  - Без имени/описания — агент пропускается (нельзя показать в промпте)
 *  - При совпадении имён: project > user
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { parseFrontmatter } = require("./frontmatter");

/** Первый непустой не-заголовочный абзац тела -> fallback description */
function firstParagraph(body) {
  for (const raw of String(body || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    return line;
  }
  return "";
}

/**
 * Просканировать одну папку agents (без рекурсии).
 * @param {string} agentsDir абсолютный путь к .cuckoo/agents
 * @param {'project'|'user'} source
 * @returns {AgentMeta[]}
 */
function scanAgentsRoot(agentsDir, source) {
  let entries;
  try {
    entries = fs.readdirSync(agentsDir, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  const out = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.toLowerCase().endsWith(".md")) continue;
    const agentPath = path.join(agentsDir, ent.name);
    let raw = "";
    try {
      raw = fs.readFileSync(agentPath, "utf-8");
    } catch (_) {
      continue;
    }
    const { data, body } = parseFrontmatter(raw);
    const name =
      (data.name && String(data.name).trim()) || ent.name.replace(/\.md$/i, "");
    const description = String(
      data.description || firstParagraph(body) || "",
    ).trim();
    if (!name.trim() || !description) continue;

    let tools;
    if (data.tools) {
      const arr = Array.isArray(data.tools)
        ? data.tools
        : String(data.tools)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
      tools = arr.map((s) => String(s).trim()).filter(Boolean);
      if (tools.length === 0) tools = undefined;
    }

    let maxTurns;
    if (data.maxTurns != null && data.maxTurns !== "") {
      const n = Number(data.maxTurns);
      if (Number.isInteger(n) && n > 0 && n <= 1000) maxTurns = n;
    }

    out.push({
      name: name.trim(),
      description,
      tools,
      maxTurns,
      agentPath,
      systemPrompt: String(body || "").trim(),
      source,
    });
  }
  return out;
}

/** Слить списки по имени: project > user (plugin не поддержан) */
function mergeAgents(project, user) {
  const byName = new Map();
  for (const a of user) byName.set(a.name, a);
  for (const a of project) byName.set(a.name, a);
  return Array.from(byName.values());
}

/**
 * Просканировать все каталоги субагентов.
 * @param {string|null} projectDir корень проекта (может быть null)
 * @returns {AgentMeta[]}
 */
function scanAgents(projectDir) {
  let userHome = "";
  try {
    userHome = os.homedir();
  } catch (_) {}
  const user = userHome
    ? scanAgentsRoot(path.join(userHome, ".cuckoo", "agents"), "user")
    : [];
  const project = projectDir
    ? scanAgentsRoot(path.join(projectDir, ".cuckoo", "agents"), "project")
    : [];
  return mergeAgents(project, user);
}

module.exports = { scanAgents, mergeAgents, scanAgentsRoot };
