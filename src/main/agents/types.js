/**
 * Agent (субагент) — типы и документация.
 *
 * Формат: markdown-файл с frontmatter, размещённый в:
 *   - <projectDir>/.cuckoo/agents/<name>.md   (проектный, приоритет выше)
 *   - ~/.cuckoo/agents/<name>.md              (пользовательский)
 *
 * Frontmatter-поля:
 *   - name        : имя агента (по умолчанию — имя файла без .md)
 *   - description : когда делегировать (обязательно, иначе агент пропускается)
 *   - tools       : список разрешённых инструментов через запятую (по умолчанию — все)
 *   - maxTurns    : лимит шагов 1..1000 (по умолчанию — без лимита)
 *
 * @typedef {Object} AgentMeta
 * @property {string} name
 * @property {string} description
 * @property {string[]|undefined} tools
 * @property {number|undefined} maxTurns
 * @property {string} agentPath      — абсолютный путь к файлу
 * @property {string} systemPrompt   — тело без frontmatter
 * @property {'project'|'user'} source
 */

module.exports = {};
