const { Tool, ToolResult } = require("./ToolRegistry");
const { exec } = require("child_process");
const path = require("path");
const { decodeOutput, normalizeCommand } = require("./decodeOutput");
const { DEFAULT_DANGEROUS_PATTERNS } = require("../src/main/settings-store");

// Кэш скомпилированных RegExp (пересобирается при изменении списка)
let cachedPatternsRaw = null;
let cachedRegexps = null;

function buildRegexps(patterns) {
  const out = [];
  for (const p of patterns) {
    if (typeof p !== "string" || !p.trim()) continue;
    try {
      out.push(new RegExp(p, "i"));
    } catch (err) {
      console.warn(
        "[Cookie Code] Невалидный regex опасной команды:",
        p,
        "—",
        err.message,
      );
    }
  }
  return out;
}

/**
 * Скомпилированный список дефолтных RegExp-паттернов опасных команд.
 * Публичный (для тестов и внешнего использования); не зависит от настроек.
 */
const DANGEROUS_CMDS = buildRegexps(DEFAULT_DANGEROUS_PATTERNS);

/**
 * Актуальный список RegExp опасных команд из настроек.
 */
function getDangerousCmds() {
  try {
    const settingsStore = require("../src/main/settings-store");
    const settings = settingsStore.readSettings();
    const custom = settings.dangerousPatterns;
    const raw =
      Array.isArray(custom) && custom.length > 0
        ? custom
        : DEFAULT_DANGEROUS_PATTERNS;
    const signature = raw.join("||");
    if (signature !== cachedPatternsRaw) {
      cachedPatternsRaw = signature;
      cachedRegexps = buildRegexps(raw);
    }
    return cachedRegexps;
  } catch (err) {
    console.error(
      "[Cookie Code] BashTool: не удалось прочитать опасные команды:",
      err.message,
    );
    return buildRegexps(DEFAULT_DANGEROUS_PATTERNS);
  }
}


/**
 * Bash 执行工具 - 最小移植 dsh 风格。
 * 非零退出正常返回，附 [exit code] 标记；输出纯文本。
 */
class BashTool extends Tool {
  constructor() {
    super(
      "bash",
      "执行 bash 命令。非零退出以 [exit code] 标记返回，不视为错误。",
      {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "要执行的 shell 命令",
          },
          description: {
            type: "string",
            description: "命令用途说明",
          },
          workdir: {
            type: "string",
            description: "工作目录（相对路径基于项目根目录），默认项目根目录",
          },
          timeoutMs: {
            type: "number",
            description: "超时毫秒数，默认 30000",
            default: 30000,
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
      "bash(command, options?)",
    );
  }

  getPromptSection() {
    return {
      name: "tool:bash",
      order: 105,
      text: "执行 bash 命令并返回 stdout/stderr。每次调用在全新 shell 中运行：状态（cwd、变量、函数）不会跨调用保留——请用 workdir 参数而非 cd。非零退出以 [exit code: N] 标记报告。长输出会截断为尾部。",
    };
  }

  async execute(params) {
    const { command, description, workdir, timeoutMs, projectDir } = params;

    try {
      if (!command || typeof command !== "string") {
        return ToolResult.error("invalid command: expected a non-empty string");
      }

      const trimmed = normalizeCommand(command.trim());
      if (!trimmed) {
        return ToolResult.error("invalid command: expected a non-empty string");
      }

      // Проверка опасных команд (список берётся из настроек)
      const dangerous = getDangerousCmds();
      if (dangerous.some((p) => p.test(trimmed))) {
        return ToolResult.error("命令被安全策略拒绝（危险命令）: " + trimmed);
      }

      // 确定工作目录
      let workDir;
      if (workdir) {
        const normalized = workdir.replace(/\//g, path.sep);
        workDir = path.isAbsolute(normalized)
          ? normalized
          : projectDir
            ? path.join(projectDir, normalized)
            : path.resolve(normalized);
      } else if (projectDir) {
        workDir = projectDir;
      } else {
        workDir = process.cwd();
      }

      const timeout =
        typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 30000;

      return await new Promise((resolve) => {
        let processManager = null;
        try {
          processManager =
            require("../src/main/process-manager").processManager;
        } catch (_) {}

        const child = exec(
          trimmed,
          {
            cwd: workDir,
            timeout,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
            encoding: "buffer",
          },
          (error, stdout, stderr) => {
            const wasKilledByUser =
              processManager && child && processManager.wasKilled(child.pid);
            if (processManager && child) processManager.untrack(child);
            const out = decodeOutput(stdout);
            const err = decodeOutput(stderr);
            const parts = [];
            if (out) parts.push(out);
            if (err) parts.push("[stderr]\n" + err);
            if (error) {
              if (wasKilledByUser) {
                parts.push("[terminated by user]");
              } else if (error.killed) {
                parts.push("[timed out]");
              }
              const code = typeof error.code === "number" ? error.code : 1;
              parts.push("[exit code: " + code + "]");
            } else {
              parts.push("[exit code: 0]");
            }
            resolve(ToolResult.success(parts.join("\n")));
          },
        );

        if (processManager && child) {
          processManager.track(child, trimmed);
        }
      });
    } catch (err) {
      return ToolResult.error("命令执行异常: " + err.message);
    }
  }
}

module.exports = { BashTool, getDangerousCmds, DANGEROUS_CMDS };
