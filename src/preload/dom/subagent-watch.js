/**
 * Наблюдатель за ответами AI в окне-субагенте.
 *
 * Активируется только если окно открыто с аргументом --cuckoo-subagent=...
 * (main передал конфиг агента). Задачу и полный системный промпт main-процесс
 * шлёт через initial-prompt; здесь мы только ждём финальный ответ субагента
 * (без tool-блоков) и передаём его текст в main.
 *
 * Детект финала: НЕ полагаемся на isAIResponseComplete() (в deepseek.js
 * он инвертирован), а используем только стабильность текста:
 *   - последнее AI-сообщение не менялось STABLE_MS миллисекунд
 *   - в нём нет cuckoo-блоков (значит, агент не вызывает инструменты)
 */
const { ipcRenderer } = require("electron");
const { getProviderByUrl } = require("../../../src/providers");
const { getJsCodeBlocksFromMarkdown } = require("./js-detector");

const STABLE_MS = 2500; // тишина, после которой считаем ответ финальным
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

/** Текст последнего AI-сообщения (markdown-контейнер) + сам DOM */
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
 * Показать рабочую папку в overlay дочернего окна (двойная попытка —
 * initProjectDirSection сбрасывает панель в null при инициализации).
 */
function showProjectDir(cfg) {
  if (!cfg.projectDir) return;
  try {
    const projectDirPanel = require("../overlay/project-dir");
    const show = () => {
      try {
        projectDirPanel.updateProjectDirDisplay(cfg.projectDir);
        console.log(
          "[Cookie Code][Subagent] рабочая папка показана: " + cfg.projectDir,
        );
      } catch (_) {}
    };
    setTimeout(show, 800);
    setTimeout(show, 2500);
  } catch (err) {
    console.error(
      "[Cookie Code][Subagent] не удалось показать папку:",
      err && err.message,
    );
  }
}

/**
 * Если окно — субагент, запустить цикл наблюдения за финальным ответом.
 */
function initSubagentWatch() {
  const cfg = readConfig();
  if (!cfg) return null;

  console.log("[Cookie Code][Subagent] активирован: " + cfg.agentName);
  showProjectDir(cfg);

  const maxTurns = cfg.maxTurns || null;
  let turnCount = 0;
  let lastSentText = "";
  let lastSnapshot = "";
  let lastChangeAt = Date.now();
  let everSawText = false; // начал ли субагент вообще отвечать
  let sent = false;
  const startedAt = Date.now();

  const finish = (text, partial) => {
    sent = true;
    clearInterval(timer);
    console.log(
      "[Cookie Code][Subagent] " +
        (partial ? "частичный ответ" : "финальный ответ") +
        " (" +
        String(text || "").length +
        " символов)",
    );
    ipcRenderer
      .invoke("subagent-response", {
        text: String(text || ""),
        done: !partial,
        partial: !!partial,
        turns: turnCount,
      })
      .catch(() => {});
  };

  const timer = setInterval(() => {
    if (sent) return;
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      finish("__SUBAGENT_TIMEOUT__", false);
      return;
    }
    try {
      const got = getLastAiText();
      if (!got || !got.text) return;

      const snapshot = got.text;
      if (snapshot !== lastSnapshot) {
        // Текст изменился — ждём стабилизации.
        lastSnapshot = snapshot;
        lastChangeAt = Date.now();
        everSawText = true;
        return;
      }
      // Текст не менялся — проверяем, устоялся ли.
      if (Date.now() - lastChangeAt < STABLE_MS) return;

      // Устоявшийся текст. Проверяем, есть ли в нём cuckoo-блоки.
      const blocks = (() => {
        try {
          return getJsCodeBlocksFromMarkdown(got.md) || [];
        } catch (_) {
          return [];
        }
      })();

      if (blocks.length === 0) {
        // Финальный текстовый ответ (либо без блоков вообще, либо уже не
        // дописывает новые). Отправляем и выходим.
        if (snapshot === lastSentText) return;
        lastSentText = snapshot;
        finish(snapshot, false);
        return;
      }

      // Есть tool-блоки = промежуточный шаг. Учитываем лимит шагов.
      turnCount++;
      if (maxTurns && turnCount >= maxTurns) {
        finish(snapshot, true);
      } else {
        console.log(
          "[Cookie Code][Subagent] шаг " +
            turnCount +
            " (tool-блоков: " +
            blocks.length +
            "), ждём продолжения",
        );
        // Сброс, чтобы следующая правка текста засчиталась как новое изменение.
        lastSnapshot = "";
      }
    } catch (err) {
      console.error(
        "[Cookie Code][Subagent] ошибка цикла:",
        err && err.message,
      );
    }
  }, POLL_MS);

  // Страховка: если субагент не начал отвечать за 3 минуты — сообщаем
  // родителю, что, похоже, отправка промпта не сработала.
  setTimeout(
    () => {
      if (!sent && !everSawText) {
        console.warn(
          "[Cookie Code][Subagent] ответ не начался за 3 минуты — возможно, " +
            "initial-prompt не отправился",
        );
      }
    },
    3 * 60 * 1000,
  );

  return cfg;
}

module.exports = { initSubagentWatch, readConfig };
