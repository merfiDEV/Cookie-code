/**
 * Наблюдатель за ответами AI в окне-субагенте.
 *
 * Активируется только если окно открыто с аргументом --cuckoo-subagent=...
 * (main передал конфиг агента). Задачу и полный системный промпт main-процесс
 * шлёт через initial-prompt; здесь мы только ждём финальный ответ субагента
 * (без tool-блоков) и передаём его текст в main.
 */
const { ipcRenderer } = require("electron");
const { getProviderByUrl } = require("../../../src/providers");
const { getJsCodeBlocksFromMarkdown } = require("./js-detector");
const { isAIResponseComplete } = require("./ai-response");

const STABLE_MS = 1200; // тишина, после которой считаем ответ финальным
const POLL_MS = 700;
const MAX_WAIT_MS = 10 * 60 * 1000; // абсолютный лимит

/** Разбор --cuckoo-subagent=<encoded JSON> из process.argv */
function readConfig() {
  try {
    const argv = (typeof process !== "undefined" && process.argv) || [];
    const arg = argv.find(
      (a) => typeof a === "string" && a.startsWith("--cuckoo-subagent="),
    );
    if (!arg) return null;
    const json = decodeURIComponent(arg.slice("--cuckoo-subagent=".length));
    const cfg = JSON.parse(json);
    if (!cfg || !cfg.agentName || !cfg.task) return null;
    return cfg;
  } catch (_) {
    return null;
  }
}

/** Текст последнего AI-сообщения (markdown-контейнер) */
function getLastAiText() {
  try {
    const provider = getProviderByUrl(window.location.href);
    if (!provider || typeof provider.getMessageCandidates !== "function")
      return null;
    const msgs = provider.getMessageCandidates();
    if (!msgs || msgs.length === 0) return null;
    const last = msgs[msgs.length - 1];
    const md = provider.getMessageMarkdown
      ? provider.getMessageMarkdown(last)
      : last.querySelector(".ds-markdown");
    if (!md) return null;
    const text = (md.textContent || md.innerText || "").trim();
    return { text, md };
  } catch (_) {
    return null;
  }
}

/**
 * Если окно — субагент, запустить цикл наблюдения за финальным ответом.
 * Задача и системный промпт уже отправлены main-процессом через initial-prompt.
 */
function initSubagentWatch() {
  const cfg = readConfig();
  if (!cfg) return null;

  console.log("[Cookie Code][Subagent] активирован: " + cfg.agentName);

  // Показываем рабочую папку в overlay — тот же блок, что у родительского окна.
  // Папка пришла в cfg.projectDir (main-процесс кладёт её в subagentConfig).
  if (cfg.projectDir) {
    try {
      const projectDirPanel = require("../overlay/project-dir");
      // Двойная попытка: overlay может инициализироваться с задержкой,
      // а initProjectDirSection() сбрасывает папку в null — обновляем дважды.
      const showDir = () => {
        try {
          projectDirPanel.updateProjectDirDisplay(cfg.projectDir);
          console.log(
            "[Cookie Code][Subagent] рабочая папка показана: " + cfg.projectDir,
          );
        } catch (_) {}
      };
      setTimeout(showDir, 800);
      setTimeout(showDir, 2500);
    } catch (err) {
      console.error(
        "[Cookie Code][Subagent] не удалось показать папку:",
        err && err.message,
      );
    }
  }

  const maxTurns = cfg.maxTurns || null;
  let turnCount = 0;
  let lastSentText = "";
  let lastSnapshot = "";
  let lastChangeAt = Date.now();
  let sent = false;
  const startedAt = Date.now();

  const timer = setInterval(async () => {
    if (sent) return;
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      sent = true;
      clearInterval(timer);
      ipcRenderer
        .invoke("subagent-response", { text: "__SUBAGENT_TIMEOUT__" })
        .catch(() => {});
      return;
    }
    try {
      const got = getLastAiText();
      if (!got || !got.text) return;
      const snapshot = got.text;
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot;
        lastChangeAt = Date.now();
        return;
      }
      if (Date.now() - lastChangeAt < STABLE_MS) return;

      const done = await isAIResponseComplete();
      if (!done) return;

      const blocks = (() => {
        try {
          return getJsCodeBlocksFromMarkdown(got.md) || [];
        } catch (_) {
          return [];
        }
      })();

      if (blocks.length === 0) {
        if (snapshot === lastSentText) return;
        lastSentText = snapshot;
        sent = true;
        clearInterval(timer);
        console.log(
          "[Cookie Code][Subagent] финальный ответ (" +
            snapshot.length +
            " символов)",
        );
        ipcRenderer
          .invoke("subagent-response", { text: snapshot, done: true })
          .catch(() => {});
        return;
      }

      turnCount++;
      if (maxTurns && turnCount >= maxTurns) {
        sent = true;
        clearInterval(timer);
        console.log("[Cookie Code][Subagent] достигнут maxTurns=" + maxTurns);
        ipcRenderer
          .invoke("subagent-response", {
            text: snapshot,
            partial: true,
            turns: turnCount,
          })
          .catch(() => {});
      } else {
        console.log(
          "[Cookie Code][Subagent] шаг " +
            turnCount +
            " (tool-блоков: " +
            blocks.length +
            "), ждём продолжения",
        );
        lastSnapshot = "";
      }
    } catch (err) {
      console.error(
        "[Cookie Code][Subagent] ошибка цикла:",
        err && err.message,
      );
    }
  }, POLL_MS);

  return cfg;
}

module.exports = { initSubagentWatch, readConfig };
