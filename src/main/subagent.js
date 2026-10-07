/**
 * Раннер субагентов (оркестрация на стороне main-процесса).
 *
 * Алгоритм:
 *   1) создать дочернее окно с тем же partition (общая сессия DeepSeek)
 *   2) проставить в его sessionStore projectDir + pendingLineage
 *   3) передать конфиг через additionalArguments (--cuckoo-subagent=...)
 *   4) ждать IPC subagent-response (или таймаут)
 *   5) закрыть окно, вернуть текст родителю
 *
 * Зависимости (createWindow) инжектируются из index.js — чтобы избежать
 * циклического require main → subagent → main.
 */
const windowState = require("./window");
const { buildInitPrompt } = require("./project-context");

let _createWindow = null;
let _profileManager = null;

/** Инжектировать зависимости из index.js */
function injectSubagentDeps(deps) {
  _createWindow = deps.createWindow;
  _profileManager = deps.profileManager;
}

/** Ожидающие окна: windowId -> resolve(text) */
const pending = new Map();

/** Счётчик работающих субагентов на profileId (для блокировки уведомлений и т.п.) */
const runningByProfile = new Map();

function hasRunningSubagent(profileId) {
  return !!profileId && (runningByProfile.get(profileId) || 0) > 0;
}

function incRunning(profileId) {
  if (!profileId) return;
  runningByProfile.set(profileId, (runningByProfile.get(profileId) || 0) + 1);
}

function decRunning(profileId) {
  if (!profileId) return;
  const n = (runningByProfile.get(profileId) || 0) - 1;
  if (n <= 0) runningByProfile.delete(profileId);
  else runningByProfile.set(profileId, n);
}

/** Вызывается из IPC при получении subagent-response */
function onSubagentResponse(windowId, text) {
  const resolve = pending.get(windowId);
  if (resolve) {
    pending.delete(windowId);
    resolve(String(text || ""));
  }
}

/**
 * Подготовить финальный промпт субагента:
 *   полный системный промпт Cookie Code (инструменты, формат cuckoo)
 *   + секция агента (systemPrompt + task).
 * Отправляется в дочернее окно через initial-prompt (прелоад слушает канал).
 */
function buildAgentPrompt(agentSystemPrompt, task) {
  const parts = [];
  if (agentSystemPrompt) parts.push(String(agentSystemPrompt).trim());
  parts.push("");
  parts.push("---");
  parts.push("Задача: " + task);
  parts.push("");
  parts.push("Используй 1-2 инструмент за раз а не целую кучу.");
  parts.push("");
  parts.push(
    "Когда закончишь, дай сразу финальный результат (не вызывай больше инструментов).",
  );
  return parts.join("\n");
}

/**
 * Дождаться готовности дочернего окна и отправить в него initial-prompt
 * (system prompt Cookie Code + промпт агента + task).
 */
function sendInitPromptWhenReady(win, projectDir, extraPrompt, timeoutMs) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) return resolve(false);
    let sent = false;
    const send = async () => {
      if (sent) return;
      if (!win || win.isDestroyed()) return;
      try {
        const base = await buildInitPrompt(
          projectDir || process.cwd(),
          "deepseek",
        );
        const combined = base + "\n\n" + extraPrompt;
        win.webContents.send("initial-prompt", combined);
        sent = true;
        console.log(
          "[Subagent] initial-prompt отправлен в окно (len=" +
            combined.length +
            ")",
        );
        resolve(true);
      } catch (err) {
        console.error(
          "[Subagent] не удалось собрать initial-prompt:",
          err && err.message,
        );
        resolve(false);
      }
    };
    win.webContents.once("did-finish-load", () => setTimeout(send, 1200));
    // На случай, если страница уже загрузилась до подписки
    setTimeout(send, 3000);
    // Абсолютный таймаут
    setTimeout(
      () => {
        if (!sent) resolve(false);
      },
      Math.min(timeoutMs, 60000),
    );
  });
}

/** Ожидание завершения субагента с таймаутом */
function waitForDone(windowId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      pending.delete(windowId);
      resolve("__SUBAGENT_TIMEOUT__");
    }, timeoutMs);
    pending.set(windowId, (text) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(text);
    });
  });
}

/**
 * Запустить субагента.
 * @param {Object} opts
 * @param {string} opts.parentProfileId  — profileId родителя (общий partition)
 * @param {number} opts.parentWindowId   — windowId родителя
 * @param {string} opts.agentName
 * @param {string} opts.task
 * @param {string} opts.systemPrompt
 * @param {string[]|undefined} opts.tools
 * @param {number|undefined} opts.maxTurns
 * @param {string} [opts.projectDir]     — рабочая папка (приоритетно из RunAgentTool)
 * @param {number} [opts.timeoutMs=600000]
 * @returns {Promise<string>}
 */
async function runAgent(opts) {
  if (!_createWindow || !_profileManager)
    throw new Error("Зависимости субагента не инжектированы");
  const timeoutMs = opts.timeoutMs || 600000; // 10 минут

  const parentCtx = windowState.getWindowContext(opts.parentWindowId);
  if (!parentCtx) throw new Error("Контекст родительского окна не найден");
  const parentStore = parentCtx.sessionStore;

  // Рабочая папка: приоритет — явно переданная из RunAgentTool,
  // fallback — из sessionStore родителя.
  const projectDir =
    opts.projectDir ||
    (parentStore &&
      parentStore.state &&
      parentStore.state.selectedProjectDir) ||
    null;

  if (!projectDir) {
    throw new Error(
      "Не задана рабочая папка проекта. Инициализируй проект в родительском окне (кнопка «Инициализировать проект») и повтори.",
    );
  }
  // Проверяем, что папка существует и это каталог — иначе субагент не сможет читать.
  try {
    const fs = require("fs");
    const st = fs.statSync(projectDir);
    if (!st.isDirectory()) throw new Error("не каталог");
  } catch (err) {
    throw new Error(
      "Рабочая папка недоступна: " +
        projectDir +
        " (" +
        (err && err.message) +
        ")",
    );
  }

  const parentSessionId =
    (parentStore && parentStore.state && parentStore.state.currentSessionId) ||
    null;

  const parent = _profileManager.getProfileById(opts.parentProfileId);
  if (!parent)
    throw new Error("Родительский profile не найден: " + opts.parentProfileId);

  // Дочерний profile — копия родителя (тот же id/partition → общая сессия),
  // но с флагом isSubagent. НЕ сохраняем в profile-list.json.
  const subProfile = {
    id: parent.id,
    providerId: parent.providerId,
    name: "子代理: " + (opts.agentName || "agent"),
    partition: parent.partition,
    isSubagent: true,
    // ВАЖНО: subagentConfig уходит в additionalArguments (argv) дочернего окна.
    // Windows-лимит командной строки ~32 КБ, поэтому тяжёлые поля
    // (systemPrompt, tools) здесь НЕ передаём — их доставим отдельно:
    // systemPrompt — через initial-prompt, tools — через toolsWhitelist
    // в контексте окна (см. ниже). Здесь только лёгкие идентификаторы.
    subagentConfig: {
      agentName: opts.agentName,
      task: opts.task,
      maxTurns: opts.maxTurns || null,
      projectDir: projectDir || null,
    },
    createdAt: new Date().toISOString(),
  };

  console.log(
    "[Subagent] Запуск " +
      opts.agentName +
      " (parent=" +
      opts.parentWindowId +
      ", projectDir=" +
      (projectDir || "нет") +
      ")",
  );
  incRunning(opts.parentProfileId);

  const windowId = _createWindow(subProfile);

  // Прокидываем projectDir + lineage + whitelist в контекст дочернего окна.
  // ВАЖНО: ставим pendingProjectDir — иначе handleUrlChange при загрузке
  // homeUrl DeepSeek (sessionId ещё нет) сбросит selectedProjectDir в null.
  // pendingProjectDir привязывается к сессии автоматически, когда она появится.
  try {
    const subCtx = windowState.getWindowContext(windowId);
    if (subCtx && subCtx.sessionStore) {
      if (projectDir) {
        subCtx.sessionStore.state.selectedProjectDir = projectDir;
        subCtx.sessionStore.state.pendingProjectDir = projectDir;
      }
      if (parentSessionId) {
        subCtx.sessionStore.state.pendingLineage = {
          parentId: parentSessionId,
          kind: "subagent",
          agentName: opts.agentName,
        };
      }
    }
    // Жёсткое ограничение инструментов: если в frontmatter агента
    // указан список tools — только они разрешены в дочернем окне.
    if (subCtx) {
      if (Array.isArray(opts.tools) && opts.tools.length > 0) {
        subCtx.toolsWhitelist = opts.tools.slice();
        console.log(
          "[Subagent] whitelist для " +
            opts.agentName +
            ": " +
            opts.tools.join(", "),
        );
      } else {
        subCtx.toolsWhitelist = null; // без ограничений
      }
    }
  } catch (_) {}

  try {
    // Отправляем в дочернее окно полный системный промпт Cookie Code
    // (инструменты + формат cuckoo) вместе с промптом агента и задачей.
    const subWinCtx = windowState.getWindowContext(windowId);
    const subWin = subWinCtx ? subWinCtx.win : null;
    const extra = buildAgentPrompt(opts.systemPrompt, opts.task);
    await sendInitPromptWhenReady(subWin, projectDir, extra, timeoutMs);

    const text = await waitForDone(windowId, timeoutMs);
    if (text === "__SUBAGENT_TIMEOUT__")
      throw new Error("Субагент не ответил за отведённое время");
    return text;
  } finally {
    decRunning(opts.parentProfileId);
    try {
      const ctx = windowState.getWindowContext(windowId);
      if (ctx && ctx.win && !ctx.win.isDestroyed()) ctx.win.close();
    } catch (_) {}
  }
}

module.exports = {
  injectSubagentDeps,
  runAgent,
  onSubagentResponse,
  hasRunningSubagent,
};
