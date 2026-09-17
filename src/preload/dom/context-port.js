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
const { isAIResponseComplete } = require("./ai-response");
const { estimateTokens } = require("./token-estimator");

// Префикс служебного сообщения, чтобы AI отличал его от пользовательского.
const BT = String.fromCharCode(96);
const FENCE = BT + BT + BT;

// Верхняя граница переносимой истории (по оценке токенов).
const MAX_HISTORY_TOKENS = 12000;

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
 * Финальный промпт-контекст (шаг 4).
 */
function buildContextPrompt(summary) {
  return (
    "【КОНТЕКСТ ИЗ ПРЕДЫДУЩЕГО ЧАТА】\n" +
    "Ниже — конспект ранее проделанной работы. Учти его и продолжай с этого места.\n\n" +
    summary
  );
}

/**
 * Дождаться, пока AI завершит ответ, затем вернуть текст последнего ответа.
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
async function waitForAnswer(timeoutMs) {
  const start = Date.now();
  const limit = timeoutMs || 120000;
  // Сначала ждём начала генерации, потом — завершения.
  let sawGeneration = false;
  while (Date.now() - start < limit) {
    await sleep(1200);
    let complete = false;
    try {
      complete = await isAIResponseComplete();
    } catch (_) {}
    const p = provider();
    const candidates =
      p && typeof p.getMessageCandidates === "function"
        ? p.getMessageCandidates()
        : [];
    if (candidates.length > 0) sawGeneration = true;
    if (sawGeneration && complete) {
      // Небольшая пауза, чтобы DOM успел дозаписаться.
      await sleep(600);
      const last = candidates[candidates.length - 1];
      const mdEl =
        p && typeof p.getMessageMarkdown === "function"
          ? p.getMessageMarkdown(last)
          : last;
      const root = mdEl || last;
      return (root.innerText || root.textContent || "").trim();
    }
  }
  return "";
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
  try {
    await window.electronAPI.contextPortStart(history, "history");
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
  const ok = chatInput.sendMessageToChat(prompt, "context-port:summarize");
  if (!ok) {
    console.warn(
      "[Cookie Code][context-port] не удалось отправить запрос суммаризации",
    );
    return;
  }
  const answer = await waitForAnswer(180000);
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
async function runInjectStage(summary) {
  if (!summary) return;
  const prompt = buildContextPrompt(summary);
  const ok = chatInput.sendMessageToChat(prompt, "context-port:inject");
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
    )
      return;
    const res = await window.electronAPI.contextPortTake();
    if (!res || !res.success || !res.data) return;
    const data = res.data;
    // Ждём появления поля ввода (после reload интерфейс грузится не сразу).
    await waitForInput(30000);
    if (data.stage === "history" && data.history) {
      await runSummarizeStage(data.history);
    } else if (data.stage === "summary" && data.summary) {
      await runInjectStage(data.summary);
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
