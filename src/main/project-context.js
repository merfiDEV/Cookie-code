/**
 * 项目初始化：目录选择、目录树、系统提示词组合与发送
 * 由原 main.js 拆分而来，逻辑保持不变。
 */
const { dialog } = require("electron");
const fs = require("fs");
const path = require("path");

const windowState = require("./window");
const { toolRegistry } = require("./tool-registry");
const mcpClient = require("./mcp-client");
const { getSkillManager } = require("../main/skill-manager");

// 提示词模板目录
const PROMPT_DIR = path.join(__dirname, "..", "prompt");

/**
 * 递归获取目录树结构字符串
 * @param {string} dir 目录路径
 * @param {number} depth 当前深度
 * @returns {string} 目录树字符串
 */
// 需要忽略的目录（依赖、构建产物、版本控制等）
const IGNORED_DIRS = new Set([
  "node_modules",
  "target",
  "build",
  "dist",
  "out",
  ".git",
  ".svn",
  ".hg",
  "__pycache__",
  ".pytest_cache",
  ".coverage",
  "vendor",
  "bower_components",
  "jspm_packages",
  ".idea",
  ".vscode",
  ".vs",
  "logs",
  "tmp",
  "temp",
  "bin",
  "obj",
]);

/**
 * 递归获取目录树结构字符串（类似 Windows tree 命令风格）
 * @param {string} dir 目录路径
 * @param {string} prefix 当前行前缀（用于绘制树形结构）
 * @returns {string} 目录树字符串
 */
function getDirectoryTree(dir, prefix = "") {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // 过滤：跳过隐藏文件和忽略的目录
    const visibleEntries = entries
      .filter((e) => !e.name.startsWith("."))
      .filter((e) => !e.isDirectory() || !IGNORED_DIRS.has(e.name))
      .sort((a, b) => {
        // 目录优先，然后按名称排序
        if (a.isDirectory() !== b.isDirectory())
          return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    let tree = "";

    visibleEntries.forEach((entry, index) => {
      const isLast = index === visibleEntries.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = prefix + (isLast ? "    " : "│   ");

      tree += `${prefix}${connector}${entry.name}${entry.isDirectory() ? "/" : ""}\n`;

      if (entry.isDirectory()) {
        tree += getDirectoryTree(path.join(dir, entry.name), childPrefix);
      }
    });

    return tree;
  } catch (err) {
    console.error("[Cookie Code] 读取目录失败:", err.message);
    return `${prefix}└── [无法读取目录: ${dir}]\n`;
  }
}

/**
 * 初始化项目：选择目录并发送目录树 + systemPrompt
 * 供 IPC 调用（用户点击初始化按钮时触发）
 * @param {boolean} skipPrompt - 如果为true，只更新目录映射，不发送初始提示（用于修改目录）
 */
async function initProject(skipPrompt = false, windowContext = null) {
  const ctx = windowContext || windowState.getMainContext();
  const mainWindow = ctx ? ctx.win : windowState.getMainWindow();
  const sessionStore = ctx ? ctx.sessionStore : null;
  // providerId 来自窗口上下文（可能为空，表示未确定平台）
  const providerId = (ctx && ctx.providerId) || "";

  // 先让用户选择目录
  const result = dialog.showOpenDialogSync(mainWindow, {
    properties: ["openDirectory"],
    buttonLabel: "选择目录",
    title: "请选择要分析的项目目录",
  });

  // 无论用户是否选择目录，对话框关闭后都恢复主窗口焦点（避免输入框失效）
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    mainWindow.webContents.focus();
  }

  if (!result || result.length === 0) {
    console.log("[Cookie Code] 用户取消了目录选择");
    return { success: false, message: "用户取消了目录选择" };
  }

  const selectedDir = result[0];
  console.log("[Cookie Code] 用户选择目录:", selectedDir);

  // 保存选中的项目目录（若该窗口有独立的 sessionStore）
  if (sessionStore) {
    sessionStore.state.selectedProjectDir = selectedDir;

    // ========== 持久化存储会话-目录映射 ==========
    // 如果当前有会话ID，保存映射
    if (sessionStore.state.currentSessionId) {
      sessionStore.saveSessionDirMapping(
        sessionStore.state.currentSessionId,
        selectedDir,
      );
      console.log(
        `[Cookie Code] 已保存会话 ${sessionStore.state.currentSessionId} -> ${selectedDir}`,
      );
    } else {
      // 如果未能获取会话ID，尝试从当前URL提取
      let sessionId = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        const url = mainWindow.webContents.getURL();
        sessionId = sessionStore.extractSessionIdFromUrl(url);
      }
      if (sessionId) {
        sessionStore.state.currentSessionId = sessionId;
        sessionStore.saveSessionDirMapping(sessionId, selectedDir);
        console.log(
          `[Cookie Code] 从URL提取会话ID并保存: ${sessionId} -> ${selectedDir}`,
        );
      } else {
        // 无法获取会话ID，暂存项目目录，等待URL变化后绑定
        sessionStore.state.pendingProjectDir = selectedDir;
        console.log(
          `[Cookie Code] 暂存项目目录 ${selectedDir}，等待会话ID出现后绑定`,
        );
      }
    }
  }

  // 发送目录更新事件到渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("project-dir-updated", selectedDir);
  }

  // 如果只是修改目录，跳过发送初始提示
  if (skipPrompt) {
    return { success: true, message: "项目目录已更新" };
  }

  // Собираем промпт (та же логика используется при переносе контекста).
  // MCP: убеждаемся, что включённые серверы подключены (8с таймаут).
  try {
    await Promise.race([
      mcpClient.connectEnabledServers(),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
  } catch (err) {
    console.error("[MCP] 初始化时连接失败:", err.message);
  }

  const combined = await buildInitPrompt(selectedDir, providerId);

  console.log(
    "[Cookie Code] 准备发送初始提示（不含目录树），长度:",
    combined.length,
  );
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("initial-prompt", combined);
  }

  return {
    success: true,
    message: "初始化完成，已发送系统提示词、工具规则和工具库",
  };
}

/**
 * Собрать текст промпта инициализации проекта (без диалога и без отправки).
 * Используется и в initProject(), и при переносе контекста в новый чат.
 * @param {string} selectedDir  каталог проекта
 * @param {string} providerId   id провайдера (может быть пустым)
 * @returns {Promise<string>}   готовый промпт (пустая строка при ошибке)
 */
async function buildInitPrompt(selectedDir, providerId) {
  // Выбор шаблона: provider.getPromptTemplate() → src/prompt/<id>.md → default.md
  const provider = require("../providers").getProvider(providerId);
  let templateContent = "";
  let templatePath = "";

  if (provider && typeof provider.getPromptTemplate === "function") {
    try {
      const fromMethod = provider.getPromptTemplate();
      if (fromMethod && typeof fromMethod === "string" && fromMethod.trim()) {
        templateContent = fromMethod;
        templatePath = "(provider.getPromptTemplate)";
      }
    } catch (err) {
      console.warn(
        "[Cookie Code] 调用 provider.getPromptTemplate 失败:",
        err.message,
      );
    }
  }

  if (!templateContent && providerId) {
    const candidate = path.join(PROMPT_DIR, providerId + ".md");
    if (fs.existsSync(candidate)) {
      templatePath = candidate;
    }
  }

  if (!templateContent && templatePath) {
    try {
      templateContent = fs.readFileSync(templatePath, "utf-8");
    } catch (err) {
      console.error("[Cookie Code] 读取提示词模板失败:", err.message);
      return "";
    }
  }

  if (!templateContent) {
    templatePath = path.join(PROMPT_DIR, "default.md");
    try {
      templateContent = fs.readFileSync(templatePath, "utf-8");
      console.warn("[Cookie Code] 未找到平台模板，使用默认模板:", templatePath);
    } catch (err) {
      console.error("[Cookie Code] 读取默认模板失败:", err.message);
      return "";
    }
  }

  console.log("[Cookie Code] 已读取提示词模板:", templatePath);

  // Тип-дефиниции инструментов
  let toolApiTypes = "";
  try {
    toolApiTypes = fs.readFileSync(
      path.join(__dirname, "..", "..", "tools", "cuckoo-tools.d.ts"),
      "utf-8",
    );
  } catch (err) {
    console.error("[Cookie Code] 读取 cuckoo-tools.d.ts 失败:", err.message);
  }

  const toolsDescription = toolRegistry.getFormattedJsApiForPrompt();
  const promptSections = toolRegistry.getFormattedPromptSections();

  // MCP — только подключение (без блокирующего ожидания при повторной сборке)
  const mcpSection = [
    "## MCP 能力",
    "",
    "本应用支持 MCP（Model Context Protocol）外部工具扩展。",
    "",
    "使用 MCP 前，请先查询可用能力：",
    "1. 调用 mcpListServers() 查看当前已配置的 MCP server 列表（含启用/连接状态）",
    "2. 调用 mcpGetTools(serverName) 查看指定 server 提供的工具和参数",
    "3. 确认后通过 mcpCall(server, tool, args) 调用具体工具",
    "",
    "注意：MCP server 可能未连接或未启用，以 mcpListServers() 的实时返回为准。",
  ].join("\n");

  // Платформенная информация
  const platform = process.platform;
  const arch = process.arch;
  let platformInfo = "";
  if (platform === "win32") {
    platformInfo =
      "- 操作系统：Windows（" +
      arch +
      "）\n  - bash 使用 cmd.exe（Windows 命令：cd / dir / echo %cd% / type / findstr）\n  - pwsh 使用 PowerShell（Get-Location / $env:VAR / Get-ChildItem）\n  - 路径分隔符为反斜杠 \\，传给工具的相对路径统一用正斜杠 /";
  } else if (platform === "darwin") {
    platformInfo =
      "- 操作系统：macOS（" +
      arch +
      "）\n  - bash 使用 zsh/bash（Unix 命令：pwd / ls / cat / grep）\n  - 路径分隔符为正斜杠 /";
  } else {
    platformInfo =
      "- 操作系统：Linux（" +
      arch +
      "）\n  - bash 使用 bash（Unix 命令：pwd / ls / cat / grep）\n  - 路径分隔符为正斜杠 /";
  }

  // CUCKOO.md — введение проекта
  let projectIntro = "";
  const cuckooMdPath = path.join(selectedDir, ".cuckooCode", "CUCKOO.md");
  if (fs.existsSync(cuckooMdPath)) {
    try {
      projectIntro = fs.readFileSync(cuckooMdPath, "utf-8");
      console.log("[Cookie Code] 已读取 CUCKOO.md 内容");
    } catch (err) {
      console.error("[Cookie Code] 读取 CUCKOO.md 失败:", err.message);
    }
  }
  const projectIntroSection = projectIntro
    ? "---\n## 项目介绍\n" + projectIntro
    : "";

  // Skill — только подсказка о наличии
  const skillManager = getSkillManager();
  skillManager.unloadAll();
  const skillSection = [
    "---",
    "## 自定义 Skill",
    "",
    "本项目支持自定义 Skill，可按需加载执行。",
    "",
    "- 调用 skillList() 查看当前项目可用的 Skill 列表",
    "- 调用 skillLoad(name) 加载需要的 Skill（读取 SKILL.md 指令和 tool.js 函数）",
    "- 调用 skillExecute(skill, function, args) 执行已加载 Skill 的函数",
    "",
    "Skill 位于 <projectDir>/.cuckoo/skills/<skill-name>/，其中 SKILL.md 为指令文件，tool.js 可选导出可执行函数。",
  ].join("\n");

  const placeholders = {
    "{{TOOL_API_TYPES}}": toolApiTypes,
    "{{TOOLS_LIST}}": toolsDescription,
    "{{TOOL_SECTIONS}}": promptSections,
    "{{PLATFORM_INFO}}": platformInfo,
    "{{PROJECT_DIR}}": selectedDir,
    "{{PROJECT_INTRO_SECTION}}": projectIntroSection,
    "{{SKILL_SECTION}}": skillSection,
    "{{MCP_SECTION}}": mcpSection,
  };
  let combined = templateContent;
  for (const [key, value] of Object.entries(placeholders)) {
    combined = combined.split(key).join(value);
  }
  return combined;
}

module.exports = {
  PROMPT_DIR,
  IGNORED_DIRS,
  getDirectoryTree,
  initProject,
  buildInitPrompt,
};
