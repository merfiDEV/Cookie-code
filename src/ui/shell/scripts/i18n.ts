/**
 * i18n для shell-страницы Cookie Code.
 */
type Lang = "ru" | "en";

const DICT: Record<string, { ru: string; en: string }> = {
  "工作区（会话）": { ru: "Рабочие области", en: "Workspaces" },
  工作区: { ru: "Рабочие области", en: "Workspaces" },
  项目文件: { ru: "Файлы проекта", en: "Files" },
  文件: { ru: "Файлы", en: "Files" },
  提示词: { ru: "Промпты", en: "Prompts" },
  记忆: { ru: "Память", en: "Memory" },
  技能: { ru: "Навыки", en: "Skills" },
  子代理: { ru: "Субагенты", en: "Agents" },
  "MCP（连接器）": { ru: "MCP", en: "MCP" },
  "MCP 连接器": { ru: "MCP", en: "MCP" },
  窗口: { ru: "Окна", en: "Windows" },
  "Token（词元）": { ru: "Токены", en: "Tokens" },
  Token: { ru: "Токены", en: "Tokens" },
  主页: { ru: "Главная", en: "Home" },
  关于: { ru: "О программе", en: "About" },
  设置: { ru: "Настройки", en: "Settings" },
  对话: { ru: "Диалоги", en: "Conversations" },
  元: { ru: "ток", en: "tok" },
  当前项目目录: { ru: "Текущий проект", en: "Current project" },
  未选择: { ru: "Не выбран", en: "Not selected" },
  "未选择项目目录（点击初始化）": {
    ru: "Проект не выбран (нажмите)",
    en: "Project not selected (click)",
  },
  后退: { ru: "Назад", en: "Back" },
  前进: { ru: "Вперёд", en: "Forward" },
  刷新: { ru: "Обновить", en: "Reload" },
  "显示/隐藏地址栏": { ru: "Показать/скрыть адрес", en: "Toggle address bar" },
  新建对话: { ru: "Новый чат", en: "New chat" },
  新对话: { ru: "Новый чат", en: "New chat" },
  新建会话: { ru: "Новый диалог", en: "New conversation" },
  新建窗口: { ru: "Новое окно", en: "New window" },
  最小化: { ru: "Свернуть", en: "Minimize" },
  最大化: { ru: "Развернуть", en: "Maximize" },
  关闭: { ru: "Закрыть", en: "Close" },
  输入网址后回车: { ru: "URL + Enter", en: "URL + Enter" },
  "对话上下文:": { ru: "Контекст:", en: "Context:" },
  "对话上下文：本会话当前占用的 token 总量": {
    ru: "Контекст: токенов в диалоге",
    en: "Context: tokens in chat",
  },
  "输出速度:": { ru: "Скорость:", en: "Speed:" },
  "输出速度：tokens/秒（生成中实时更新，结束后保留最终值）": {
    ru: "Скорость (tokens/сек)",
    en: "Speed (tokens/s)",
  },
  最近: { ru: "Недавно", en: "Recent" },
  保存: { ru: "Сохранить", en: "Save" },
  保存名称: { ru: "Сохранить имя", en: "Save name" },
  保存失败: { ru: "Ошибка сохранения", en: "Save failed" },
  取消: { ru: "Отмена", en: "Cancel" },
  确定: { ru: "OK", en: "OK" },
  确认: { ru: "Подтвердить", en: "Confirm" },
  删除: { ru: "Удалить", en: "Delete" },
  删除失败: { ru: "Ошибка удаления", en: "Delete failed" },
  "删除失败: ": { ru: "Ошибка удаления: ", en: "Delete failed: " },
  新建: { ru: "Создать", en: "New" },
  新建子代理: { ru: "Новый субагент", en: "New subagent" },
  新建提示词: { ru: "Новый промпт", en: "New prompt" },
  新建快捷提示词: { ru: "Новый промпт", en: "New prompt" },
  编辑: { ru: "Редактировать", en: "Edit" },
  编辑子代理: { ru: "Редактировать субагента", en: "Edit subagent" },
  编辑提示词: { ru: "Редактировать промпт", en: "Edit prompt" },
  重命名: { ru: "Переименовать", en: "Rename" },
  重命名对话: { ru: "Переименовать диалог", en: "Rename chat" },
  归档: { ru: "В архив", en: "Archive" },
  归档项目: { ru: "Архивировать проект", en: "Archive project" },
  取消归档: { ru: "Разархивировать", en: "Unarchive" },
  发送: { ru: "Отправить", en: "Send" },
  创建失败: { ru: "Ошибка создания", en: "Create failed" },
  创建并打开: { ru: "Создать и открыть", en: "Create & open" },
  打开失败: { ru: "Ошибка открытия", en: "Open failed" },
  "打开失败: ": { ru: "Ошибка открытия: ", en: "Open failed: " },
  打开正文: { ru: "Открыть файл", en: "Open file" },
  "操作失败: ": { ru: "Ошибка: ", en: "Operation failed: " },
  取消初始化: { ru: "Отменить инициализацию", en: "Cancel init" },
  "加载中…": { ru: "Загрузка…", en: "Loading…" },
  "加载中…（若持续为空，请点刷新）": {
    ru: "Загрузка… (нажмите «Обновить»)",
    en: "Loading… (click Refresh)",
  },
  加载失败: { ru: "Ошибка загрузки", en: "Load failed" },
  读取失败: { ru: "Ошибка чтения", en: "Read failed" },
  无匹配结果: { ru: "Ничего не найдено", en: "No matches" },
  暂无会话: { ru: "Нет диалогов", en: "No conversations" },
  暂无插件面板: { ru: "Нет панелей плагинов", en: "No plugin panels" },
  空目录: { ru: "Пустая папка", en: "Empty folder" },
  提示: { ru: "Уведомление", en: "Notice" },
  未指定工作区: { ru: "Рабочая область не указана", en: "No workspace" },
  未发现子代理: { ru: "Субагентов не найдено", en: "No agents found" },
  未发现技能: { ru: "Навыков не найдено", en: "No skills found" },
  "未配置 MCP server": {
    ru: "MCP-серверы не настроены",
    en: "No MCP configured",
  },
  请先选择项目目录: {
    ru: "Сначала выберите папку проекта",
    en: "Select project folder first",
  },
  请填写名称: { ru: "Введите имя", en: "Enter name" },
  请填写内容: { ru: "Введите содержимое", en: "Enter content" },
  请选择: { ru: "Выберите", en: "Select" },
  输入: { ru: "Ввод", en: "Input" },
  输入对话名称: { ru: "Введите имя диалога", en: "Enter chat name" },
  初始化项目: { ru: "Инициализация проекта", en: "Project init" },
  "初始化中…": { ru: "Инициализация…", en: "Initializing…" },
  项目目录: { ru: "Папка проекта", en: "Project folder" },
  项目级: { ru: "Проектный", en: "Project" },
  用户级: { ru: "Пользовательский", en: "User" },
  "项目级（.cuckoo/agents/）": {
    ru: "Проектный (.cuckoo/agents/)",
    en: "Project (.cuckoo/agents/)",
  },
  "用户级（~/.cuckoo/agents/）": {
    ru: "Пользовательский (~/.cuckoo/agents/)",
    en: "User (~/.cuckoo/agents/)",
  },
  "请输入你要对 AI 说的内容（发送时将自动附加系统提示词）": {
    ru: "Введите сообщение для AI",
    en: "Enter message for AI",
  },
  "例如：帮我看看这个项目的入口文件在哪里...": {
    ru: "Например: где точка входа?",
    en: "Example: where is entry?",
  },
  选择目录: { ru: "Выбрать папку", en: "Select folder" },
  用该项目新建对话: { ru: "Новый чат в проекте", en: "New chat for project" },
  重新项目初始化: { ru: "Переинициализировать проект", en: "Re-init project" },
  位置: { ru: "Расположение", en: "Location" },
  范围: { ru: "Область", en: "Scope" },
  名称: { ru: "Имя", en: "Name" },
  内容: { ru: "Содержимое", en: "Content" },
  "如：生成项目说明": {
    ru: "Например: описание проекта",
    en: "Example: project description",
  },
  "如：code-reviewer（英文）": {
    ru: "Например: code-reviewer (EN)",
    en: "Example: code-reviewer (EN)",
  },
  点击后将填入输入框的文本: {
    ru: "Текст для поля ввода",
    en: "Text for input",
  },
  自动发送: { ru: "Автоотправка", en: "Auto-send" },
  "生成模板后，会用系统默认程序打开，你直接编辑保存即可。": {
    ru: "Шаблон откроется в системе — редактируйте.",
    en: "Template opens in system — edit.",
  },
  "改名会重命名文件；「打开正文」用系统程序编辑提示词。": {
    ru: "Переименование файла; «Открыть» — редактор.",
    en: "Rename; «Open» — editor.",
  },
  "确定删除该子代理文件？此操作不可恢复。": {
    ru: "Удалить файл субагента? Необратимо.",
    en: "Delete subagent? Irreversible.",
  },
  "已创建：": { ru: "Создано: ", en: "Created: " },
  "还没有提示词，点上方新建": {
    ru: "Нет промптов — создайте выше",
    en: "No prompts — create above",
  },
  "已归档 ": { ru: "Архив: ", en: "Archived: " },
  "压缩历史（": { ru: "История сжатий (", en: "Compactions (" },
  "子代理（": { ru: "Субагенты (", en: "Subagents (" },
  "子代理: ": { ru: "Субагент: ", en: "Subagent: " },
  "（无描述）": { ru: "(без описания)", en: "(no description)" },
  "（点击追加到输入框）": { ru: "(клик — вставить)", en: "(click to insert)" },
  工具: { ru: "инструментов", en: "tools" },
  "这个 MCP": { ru: "Этот MCP", en: "This MCP" },
  "请使用 ": { ru: "Используй ", en: "Use " },
  "请使用 xxx 子代理": {
    ru: "Используй субагента xxx",
    en: "Use subagent xxx",
  },
  "请使用 xxx 技能": { ru: "Используй навык xxx", en: "Use skill xxx" },
  "请使用 xxx 这个 MCP": { ru: "Используй MCP xxx", en: "Use MCP xxx" },
  "追加 @": { ru: "Добавить @", en: "Append @" },
  到输入框: { ru: "в поле ввода", en: "to input" },
  "（.cuckoo/skills/ 或 ~/.cuckoo/skills/）": {
    ru: "(.cuckoo/skills/ или ~/.cuckoo/skills/)",
    en: "(.cuckoo/skills/ or ~/.cuckoo/skills/)",
  },
  "搜索文件名…": { ru: "Поиск файлов…", en: "Search files…" },
  拖动调整宽度: { ru: "Потяните для ширины", en: "Drag to resize" },
  用系统程序打开: { ru: "Открыть системно", en: "Open externally" },
  "（结果过多，仅显示前 500 项）": {
    ru: "(много, показано 500)",
    en: "(too many, 500 shown)",
  },
  "（节点过多，已截断显示）": { ru: "(обрезано)", en: "(truncated)" },
  管理窗口组: { ru: "Группы окон", en: "Window groups" },
  组名: { ru: "Имя группы", en: "Group name" },
  "组内窗口（按顺序轮换）": { ru: "Окна в группе", en: "Windows in group" },
  添加窗口: { ru: "Добавить окно", en: "Add window" },
  外观: { ru: "Внешний вид", en: "Appearance" },
  主题: { ru: "Тема", en: "Theme" },
  浅色: { ru: "Светлая", en: "Light" },
  深色: { ru: "Тёмная", en: "Dark" },
  跟随系统: { ru: "Как в системе", en: "System" },
  恢复默认: { ru: "Восстановить по умолчанию", en: "Restore defaults" },
  纯净页面: { ru: "Чистая страница", en: "Pure page" },
  切换到纯净对话模式: { ru: "Чистый режим чата", en: "Pure chat mode" },
  切回原版网页: { ru: "К обычной странице", en: "Back to web" },
  净: { ru: "Чист", en: "Pure" },
  原: { ru: "Ориг", en: "Orig" },
  原页面: { ru: "Оригинал", en: "Original" },
  刚刚: { ru: "только что", en: "just now" },
  分钟前: { ru: "мин назад", en: "min ago" },
  小时前: { ru: "ч назад", en: "h ago" },
  天前: { ru: "дн назад", en: "d ago" },
  个月前: { ru: "мес назад", en: "mo ago" },
  年前: { ru: "г назад", en: "y ago" },
  "日 ": { ru: "д ", en: "d " },
  月: { ru: "мес", en: "mo" },
  年: { ru: "г", en: "y" },
  万: { ru: "тыс", en: "k" },
  亿: { ru: "млрд", en: "B" },
  嵌: { ru: "Встр", en: "Embed" },
  项目: { ru: "Проект", en: "Project" },
  ") 失败": { ru: ") ошибка", en: ") failed" },
  "[dsh-page] Page 崩溃": { ru: "[page] Сбой", en: "[page] Crash" },
  "[dsh-page] 组件栈:": { ru: "[page] Стек:", en: "[page] Stack:" },
  "[dsh-slot] 组件崩溃": { ru: "[slot] Сбой", en: "[slot] Crash" },
  "⚠ 插件出错": { ru: "⚠ Ошибка плагина", en: "⚠ Plugin error" },
  "⚠ 页面组件崩溃": { ru: "⚠ Сбой компонента", en: "⚠ Component crash" },
  "」尚未重写": { ru: "» не готово", en: "' not ready" },
  "页面「": { ru: "Страница «", en: "Page '" },
  "插件组件崩溃：": { ru: "Сбой плагина:", en: "Plugin crash:" },
  "非 React 挂载点": { ru: "Не React-точка", en: "Not a React mount" },
  通用弹窗: { ru: "Общие диалоги", en: "Common dialogs" },
  侧栏: { ru: "Боковая панель", en: "Sidebar" },
};

let currentLang: Lang = detectLang();

function detectLang(): Lang {
  try {
    const l = (navigator.language || "en").toLowerCase();
    if (
      l.startsWith("ru") ||
      l.startsWith("uk") ||
      l.startsWith("be") ||
      l.startsWith("kk")
    )
      return "ru";
    return "en";
  } catch (_) {
    return "ru";
  }
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  try {
    translateAll();
  } catch (_) {}
}

export function t(chinese: string): string {
  const e = DICT[chinese];
  if (!e) return chinese;
  return currentLang === "ru" ? e.ru : e.en;
}

export function tAll(chinese: string): { ru: string; en: string } {
  return DICT[chinese] || { ru: chinese, en: chinese };
}

let observer: MutationObserver | null = null;
let installed = false;

function translateTextNode(node: Text): void {
  const text = node.nodeValue;
  if (!text) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  const r = DICT[trimmed];
  if (!r) return;
  const nt = currentLang === "ru" ? r.ru : r.en;
  const lead = text.match(/^\s*/)?.[0] || "";
  const tail = text.match(/\s*$/)?.[0] || "";
  node.nodeValue = lead + nt + tail;
}

function translateAttrs(el: Element): void {
  for (const attr of ["title", "placeholder", "aria-label", "alt"]) {
    const v = el.getAttribute(attr);
    if (!v) continue;
    const trimmed = v.trim();
    const r = DICT[trimmed];
    if (!r) continue;
    el.setAttribute(attr, currentLang === "ru" ? r.ru : r.en);
  }
}

function translateTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (
    root.nodeType !== Node.ELEMENT_NODE &&
    root.nodeType !== Node.DOCUMENT_NODE
  )
    return;
  const el = root as Element;
  if (el.nodeType === Node.ELEMENT_NODE) translateAttrs(el);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (n) => {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const tag = (n as Element).tagName;
          if (tag === "SCRIPT" || tag === "STYLE")
            return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text);
    else if (node.nodeType === Node.ELEMENT_NODE)
      translateAttrs(node as Element);
    node = walker.nextNode();
  }
}

export function translateAll(): void {
  try {
    translateTree(document.body);
  } catch (_) {}
}

export function installAutoTranslate(): void {
  if (installed) return;
  installed = true;
  try {
    translateAll();
  } catch (_) {}
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") {
        for (const n of Array.from(m.addedNodes)) {
          try {
            translateTree(n);
          } catch (_) {}
        }
      } else if (m.type === "characterData") {
        try {
          translateTextNode(m.target as Text);
        } catch (_) {}
      } else if (m.type === "attributes") {
        try {
          translateAttrs(m.target as Element);
        } catch (_) {}
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["title", "placeholder", "aria-label", "alt"],
  });
  setInterval(() => {
    try {
      translateAll();
    } catch (_) {}
  }, 3000);
}
