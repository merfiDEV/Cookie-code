/**
 * Реестр slash-команд Cookie Code.
 * Каждая команда: { name, description, prompt }.
 * prompt — текст (китайский), которым заменяется токен /name в поле ввода.
 *
 * 命令注册表：每条命令包含 name（名称）、description（描述）、prompt（注入的提示词正文）。
 * 触发方式：在输入框中输入 "/" 开头，弹出补全菜单。
 */

/**
 * 计划模式提示词（译自 dsh-plan-mode 的 plan:policy）。
 * 当用户选择 /plan 时，用此文本替换输入框中的 /plan 标记。
 */
const PLAN_PROMPT = [
  '你正处于计划模式（plan mode）。请一直保持计划模式，直到用户明确切换会话模式为止。',
  '命令式的「去实现某改动」意味着要规划实现方案，而不是直接执行。用户的口头同意——包括对你提问的回答——并不代表批准，也不会退出计划模式；',
  '请把确认的结论并入计划。',
  '',
  '先探索。使用非破坏性的读取、搜索、静态分析和检查，让计划扎根于真实的代码库。不要编辑或写入文件、不要修改配置、不要运行会重写已跟踪文件的格式化或代码生成、不要提交，',
  '也不要执行计划中的任何改动。优先复用已有的函数和模式，而不是引入新机制。',
  '',
  '为保持请求缓存稳定，工具目录在各模式下保持一致。本计划模式规则优先于任何后续工具描述或指引中「建议使用修改类工具」的内容；这些工具仍然列出，只是为了保持请求结构稳定。',
  '',
  '规划时用 todoWrite 维护一份结构化的任务清单：为「决策完备」的计划拆出可执行的条目，随探索进展用 todoWrite 更新其状态（pending / in_progress / completed）。',
  '该清单用于组织计划本身，不代表对改动的批准；在你获得用户明确批准之前，不要开始实现任何条目。',
  '',
  '通过检查代码来确认可查证的事实。只有面对用户自有的选择，或检查无法解答的实质性歧义时，才使用 ask_user_question。',
  '当你能自己查清楚代码在哪里、当前行为如何时，不要向用户提问。',
  '',
  '让计划达到「决策完备」：说明目标与成功标准；按子系统归类实现改动；指出公共 API、schema 与数据流的变化；覆盖边界情况、失败模式、测试、验收标准以及明确的假设。',
  '保持足够简洁以便审阅，同时足够详细，使另一位工程师无需再做设计决策就能实现。',
  '',
  '准备好后，用完整的计划 Markdown（以 # 标题开头）作为普通回复给出，等待用户确认。实现只在用户明确批准后的后续步骤中开始。',
  '不要把「我可以继续吗？」作为唯一内容提问。如果用户驳回计划，请吸收反馈后重新给出修订后的计划；在用户明确切换模式之前，不要继续实现。',
].join('\n');

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
    name: 'plan',
    // Ключ i18n; резолвится через descOf() в момент отрисовки.
    descriptionKey: 'cmd.plan.description',
    prompt: PLAN_PROMPT,
  },
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
  PLAN_PROMPT,
  REVIEW_PROMPT,
  SUMMARIZE_PROMPT,
  findCommand,
  searchCommands,
  descOf,
};
