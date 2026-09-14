/**
 * Реестр slash-команд Cookie Code.
 * Каждая команда: { name, description, prompt }.
 * prompt — текст (китайский), которым заменяется токен /name в поле ввода.
 *
 * 命令注册表：每条命令包含 name（名称）、description（描述）、prompt（注入的提示词正文）。
 * 触发方式：在输入框中输入 "/" 开头，弹出补全菜单。
 */

/**
 * Промпт ревью текущих изменений проекта.
 * Команда заменяется этим текстом в поле ввода, после чего обычная отправка
 * сообщения запускает анализ через доступные инструменты проекта.
 */
const REVIEW_PROMPT = [
  '请对项目当前的代码变更进行 code review。',
  '',
  '先检查 git status，并查看相对于 HEAD 的 diff。不要猜测不存在的变更。',
  '检查相关代码、现有测试以及项目本地约定。',
  '',
  '只报告有证据支持的问题：',
  '- 错误和潜在回归；',
  '- 安全漏洞和不安全的数据处理；',
  '- 模块之间的契约被破坏；',
  '- 变更代码缺少必要的错误处理；',
  '- 缺失或明显失效的测试。',
  '',
  '不要报告纯粹的风格建议，也不要进行不必要的重写。',
  '每条问题都必须包含优先级（CRITICAL、HIGH、MEDIUM 或 LOW）、文件、行号、原因和简短的修复建议。',
  '先按优先级列出问题，然后简要说明检查过的范围以及成功运行的测试。',
  '如果没有发现问题，请明确说明，并指出仍未覆盖的检查范围。',
].join('\n');

/**
 * Промпт краткого итога текущей сессии.
 */
const SUMMARIZE_PROMPT = [
  '请总结当前会话和项目工作的进展。',
  '',
  '请简洁列出：',
  '- 已完成的任务和关键决策；',
  '- 修改过的文件以及每个文件的作用；',
  '- 已运行的测试、构建或其他验证及其结果；',
  '- 尚未完成的问题、风险和下一步建议。',
  '',
  '只使用当前会话和项目中可以确认的事实，不要编造没有执行过的操作。',
  '使用简洁的 Markdown，先给出结论，再列出必要的细节。',
].join('\n');

/**
 * 已注册的命令列表。
 * @type {Array<{name: string, description: string, prompt: string}>}
 */
const COMMANDS = [
  {
    name: 'review',
    descriptionKey: 'cmd.review.description',
    prompt: REVIEW_PROMPT,
  },
  {
    name: 'summarize',
    descriptionKey: 'cmd.summarize.description',
    prompt: SUMMARIZE_PROMPT,
  },
];

/**
 * Возвращает локализованное описание команды.
 * @param {{descriptionKey?: string, description?: string}} cmd
 * @param {Function} [t] - функция перевода; если нет — возвращает descriptionKey/description
 * @returns {string}
 */
function descOf(cmd, t) {
  if (!cmd) return '';
  if (cmd.descriptionKey && typeof t === 'function') return t(cmd.descriptionKey);
  return cmd.description || cmd.descriptionKey || '';
}

/**
 * 按名称查找命令（大小写不敏感）。
 * @param {string} name
 * @returns {{name: string, description: string, prompt: string} | undefined}
 */
function findCommand(name) {
  if (!name) return undefined;
  const lower = String(name).toLowerCase();
  return COMMANDS.find((c) => c.name.toLowerCase() === lower);
}

/**
 * 返回名称以 query 前缀开头的命令（用于补全候选）。
 * 空 query 返回全部；结果按名称排序。
 * @param {string} query - "/" 之后的已输入文本
 * @returns {Array}
 */
function searchCommands(query) {
  const q = String(query || '').toLowerCase();
  const list = COMMANDS.filter((c) => c.name.toLowerCase().startsWith(q));
  return list.slice().sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  COMMANDS,
  REVIEW_PROMPT,
  SUMMARIZE_PROMPT,
  findCommand,
  searchCommands,
  descOf,
};
