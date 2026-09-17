/**
 * Context Port (renderer) — перенос контекста из старого чата DeepSeek в новый.
 *
 * Прямого API у DeepSeek нет, поэтому:
 *   1) читаем историю текущего чата из DOM (markdown-сообщения);
 *   2) кладём историю в main (переживает reload) и открываем новый чат;
 *   3) в новом чате просим модель сжать историю в конспект, читаем ответ,
 *      кладём конспект в main и снова открываем новый чат;
 *   4) в новом чате вставляем конспект как контекст и продолжаем работу.
 *
 * Состояние между перезагрузками страницы живёт в main-процессе
 * (см. src/main/context-port.js) — preload после reload сам решает, какой шаг.
 */
const { getProviderByUrl } = require("../../../src/providers");
const chatInput = require("./chat-input");
const state = require("./state");
const { isAIResponseComplete } = require("./ai-response");
const { estimateTokens } = require("./token-estimator");

// Префикс служебного сообщения, чтобы AI отличал его от пользовательского.
const BT = String.fromCharCode(96);
const FENCE = BT + BT + BT;

// Верхняя граница переносимой истории (по оценке токенов).
const MAX_HISTORY_TOKENS = 50000;

// Ключ в sessionStorage: защита от повторного запуска шага после reload.
const FLAG_KEY = "cuckoo-context-port-flag";

/**
 * Текущий провайдер по URL.
 */
function provider() {
  return getProviderByUrl(window.location.href);
}

/**
 * Прочитать историю текущего чата из DOM в виде markdown.
 * Возвращает строку вида:
 *   Пользователь: ...
 *   Ассистент: ...
 * @returns {string}
 */
function exportHistory() {
  try {
    const p = provider();
    const nodes = Array.from(document.querySelectorAll(".ds-message"));
    if (nodes.length === 0) return "";
    const parts = [];
    for (const el of nodes) {
      const isUser =
        p && typeof p.isUserMessage === "function"
          ? p.isUserMessage(el)
          : false;
      const mdEl =
        p && typeof p.getMessageMarkdown === "function"
          ? p.getMessageMarkdown(el)
          : el;
      const root = mdEl || el;
      const text = (root.innerText || root.textContent || "").trim();
      if (!text) continue;
      parts.push((isUser ? "Пользователь: " : "Ассистент: ") + text);
    }
    return parts.join("\n\n");
  } catch (err) {
    console.error(
      "[Cookie Code][context-port] exportHistory error:",
      err.message,
    );
    return "";
  }
}

/**
 * Ужать историю по токенам: если слишком длинная — оставляем хвост.
 * @param {string} history
 * @returns {string}
 */
function clampHistory(history) {
  if (!history) return "";
  if (estimateTokens(history) <= MAX_HISTORY_TOKENS) return history;
  // Берём хвост: последние ~MAX_HISTORY_TOKENS токенов.
  const approxChars = MAX_HISTORY_TOKENS * 2;
  const tail = history.slice(-approxChars);
  const idx = tail.indexOf("\n\n");
  return (
    "[…начало истории опущено…]\n\n" + (idx > 0 ? tail.slice(idx + 2) : tail)
  );
}

/**
 * Промпт для суммаризации истории (шаг 2).
 */
function buildSummarizePrompt(history) {
  return (
    "Ниже — история другого чата. Сожми её в структурный конспект на русском, " +
    "чтобы по нему можно было продолжить работу. Формат:\n" +
    "1. Цель/задача\n2. Что уже сделано (решения)\n3. Изменённые/созданные файлы\n" +
    "4. Открытые вопросы и следующий шаг\n5. Важные детали/ограничения\n" +
    "Без воды. Только конспект.\n\n" +
    "=== ИСТОРИЯ ===\n" +
    history
  );
}

/**
 * Финальный промпт-контекст (шаг 4): промпт инициализации проекта (если есть)
 * + конспект истории, объединённые в одно сообщение.
 * @param {string} summary  конспект истории
 * @param {string} [initPrompt]  промпт инициализации проекта
 */
function buildContextPrompt(summary, initPrompt) {
  const parts = [];
  if (initPrompt) {
    parts.push(initPrompt);
  }
  parts.push(
    "【КОНТЕКСТ ИЗ ПРЕДЫДУЩЕГО ЧАТА】\n" +
      "Ниже — конспект ранее проделанной работы. Учти его и продолжай с этого места.\n\n" +
      summary,
  );
  return parts.join("\n\n---\n\n");
}

/**
 * Дождаться ответа AI после отправки сообщения.
 *
 * Надёжная логика (не полагается только на isResponseComplete, который
 * требует stop-кнопку и может «пропустить» короткий ответ):
 *   1) ждём появления НОВОГО сообщения (число .ds-message выросло);
 *   2) ждём, пока текст перестанет меняться N опросов подряд (стабилизация);
 *   3) возвращаем текст последнего AI-сообщения.
 *
 * @param {number} baselineCount  сколько .ds-message было ДО отправки
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
async function waitForAnswer(baselineCount, timeoutMs) {
  const start = Date.now();
  const limit = timeoutMs || 180000;
  const base = typeof baselineCount === "number" ? baselineCount : 0;
  let sawNew = false;
  let lastText = "";
  let stableCount = 0;
  const STABLE_NEEDED = 4; // ~4.8 c без изменений — считаем ответ завершённым

  while (Date.now() - start < limit) {
    await sleep(1200);
    const p = provider();
    const candidates =
      p && typeof p.getMessageCandidates === "function"
        ? p.getMessageCandidates()
        : [];
    if (candidates.length <= base && !sawNew) {
      // Ответ ещё не начал появляться.
      continue;
    }
    sawNew = true;
    const last = candidates[candidates.length - 1];
    if (!last) continue;
    const mdEl =
      p && typeof p.getMessageMarkdown === "function"
        ? p.getMessageMarkdown(last)
        : last;
    const root = mdEl || last;
    const text = (root.innerText || root.textContent || "").trim();

    if (text && text === lastText) {
      stableCount++;
    } else {
      stableCount = 0;
      lastText = text;
    }
    // Дополнительно: если платформа сообщает «готово» — доверяем ей.
    let complete = false;
    try {
      complete = await isAIResponseComplete();
    } catch (_) {}

    if (text && (stableCount >= STABLE_NEEDED || complete)) {
      return text;
    }
  }
  return lastText;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Запустить перенос: экспорт истории → main → новый чат.
 * Вызывается из старого чата (шаг 1).
 */
async function startTransfer() {
  const history = clampHistory(exportHistory());
  if (!history) {
    console.warn(
      "[Cookie Code][context-port] история пуста — нечего переносить",
    );
    return { success: false, error: "empty-history" };
  }
  // Промпт инициализации проекта (если проект инициализирован) —
  // переносим вместе с контекстом, чтобы новый чат «знал» проект.
  // Берём его из main (пересобирается из projectDir), т.к. состояние
  // renderer теряется при reload и не всегда содержит промпт.
  let initPrompt = "";
  try {
    if (typeof window.electronAPI.contextPortGetInitPrompt === "function") {
      const r = await window.electronAPI.contextPortGetInitPrompt();
      if (r && r.success && r.prompt) initPrompt = r.prompt;
    }
  } catch (err) {
    console.warn(
      "[Cookie Code][context-port] не удалось получить промпт инициализации:",
      err.message,
    );
  }
  // Фолбэк: если main не дал промпт, но он есть в памяти preload — используем.
  if (!initPrompt && state.initialPromptContent) {
    initPrompt = state.initialPromptContent;
  }
  console.log(
    "[Cookie Code][context-port] startTransfer: history =",
    history.length,
    "initPrompt =",
    initPrompt.length,
  );
  try {
    await window.electronAPI.contextPortStart(history, "history", initPrompt);
    // После reload preload сам выполнит шаг 2 (суммаризация).
    await window.electronAPI.newChat();
    return { success: true };
  } catch (err) {
    console.error(
      "[Cookie Code][context-port] startTransfer error:",
      err.message,
    );
    return { success: false, error: err.message };
  }
}

/**
 * Шаг 2: в новом чате получаем историю, просим модель сжать, читаем конспект.
 */
async function runSummarizeStage(history) {
  const prompt = buildSummarizePrompt(history);
  console.log(
    "[Cookie Code][context-port] summarize: длина промпта =",
    prompt.length,
  );
  // Считаем, сколько AI-сообщений уже есть (на новом чате их 0).
  const p = provider();
  const baseline =
    p && typeof p.getMessageCandidates === "function"
      ? p.getMessageCandidates().length
      : 0;
  // Поле ввода может ещё не быть готово — несколько попыток отправки.
  let ok = false;
  for (let i = 0; i < 10 && !ok; i++) {
    ok = chatInput.sendMessageToChat(prompt, "context-port:summarize");
    if (!ok) {
      console.warn(
        "[Cookie Code][context-port] summarize: input не найден, попытка",
        i + 1,
      );
      await sleep(1500);
    }
  }
  if (!ok) {
    console.warn(
      "[Cookie Code][context-port] не удалось отправить запрос суммаризации",
    );
    return;
  }
  console.log("[Cookie Code][context-port] summarize: отправлено, ждём ответ");
  const answer = await waitForAnswer(baseline, 180000);
  console.log(
    "[Cookie Code][context-port] summarize: ответ получен, длина =",
    (answer || "").length,
  );
  if (!answer) {
    console.warn("[Cookie Code][context-port] пустой конспект — прерываю");
    await window.electronAPI.contextPortClear();
    return;
  }
  try {
    await window.electronAPI.contextPortSummary(answer);
    await window.electronAPI.newChat();
  } catch (err) {
    console.error(
      "[Cookie Code][context-port] summarize stage error:",
      err.message,
    );
  }
}

/**
 * Шаг 4: в новом чате вставляем конспект как контекст.
 */
async function runInjectStage(summary, initPrompt) {
  if (!summary) return;
  const prompt = buildContextPrompt(summary, initPrompt);
  console.log(
    "[Cookie Code][context-port] inject: длина промпта =",
    prompt.length,
    "(initPrompt:",
    (initPrompt || "").length + ")",
  );
  let ok = false;
  for (let i = 0; i < 10 && !ok; i++) {
    ok = chatInput.sendMessageToChat(prompt, "context-port:inject");
    if (!ok) {
      console.warn(
        "[Cookie Code][context-port] inject: input не найден, попытка",
        i + 1,
      );
      await sleep(1500);
    }
  }
  if (ok) {
    console.log("[Cookie Code][context-port] контекст перенесён в новый чат");
  }
  await window.electronAPI.contextPortClear();
}

/**
 * Точка входа после загрузки страницы: определить текущий этап переноса
 * и выполнить нужный шаг. Вызывается из init() preload.
 */
async function resume() {
  try {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.contextPortTake !== "function"
    ) {
      console.log("[Cookie Code][context-port] resume: API недоступен");
      return;
    }
    const res = await window.electronAPI.contextPortTake();
    console.log(
      "[Cookie Code][context-port] resume: take =",
      JSON.stringify({
        success: res && res.success,
        stage: res && res.data && res.data.stage,
        hasHistory: !!(res && res.data && res.data.history),
        hasSummary: !!(res && res.data && res.data.summary),
        hasInitPrompt: !!(res && res.data && res.data.initPrompt),
      }),
    );
    if (!res || !res.success || !res.data) return;
    const data = res.data;
    // Ждём появления поля ввода (после reload интерфейс грузится не сразу).
    const ready = await waitForInput(60000);
    console.log("[Cookie Code][context-port] resume: input ready =", ready);
    if (!ready) {
      console.warn(
        "[Cookie Code][context-port] resume: поле ввода не появилось за 60с",
      );
      return;
    }
    // Небольшая пауза, чтобы React-интерфейс окончательно инициализировался.
    await sleep(1500);
    if (data.stage === "history" && data.history) {
      await runSummarizeStage(data.history);
    } else if (data.stage === "summary" && data.summary) {
      await runInjectStage(data.summary, data.initPrompt);
    }
  } catch (err) {
    console.error("[Cookie Code][context-port] resume error:", err.message);
  }
}

/**
 * Ждать появления поля ввода.
 */
async function waitForInput(timeoutMs) {
  const start = Date.now();
  const limit = timeoutMs || 30000;
  while (Date.now() - start < limit) {
    if (chatInput.findInputArea()) return true;
    await sleep(500);
  }
  return false;
}

module.exports = {
  startTransfer,
  resume,
  exportHistory,
};
