/**
 * Модельная скорость вывода (tokens per second).
 *
 * Две дорожки:
 *  1) Точная: DeepSeek в каждом кадре шлёт accumulated_token_usage (= накопленный
 *     контекст). Токены этого раунда = текущее значение − значение на старте раунда.
 *     TpsMeter предпочитает это. НЕ включает входные токены.
 *  2) Fallback-оценка: если серверный токен-учёт недоступен — оцениваем по длине
 *     текста (CJK ≈ 0.7/символ, латиница ≈ 0.28/символ и т.д.).
 *
 * Детект нового раунда: длина текста уменьшилась (текст раунда сбрасывается в 0)
 * → считаем, что начался новый раунд. Так даже если предыдущий раунд прерван
 * (без finished), токены не суммируются.
 */

/** Оценить токены текста (приблизительно; только fallback). */
function estimateTokens(text) {
  if (!text) return 0;
  const cjk = (
    text.match(
      /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/g,
    ) || []
  ).length;
  const emoji = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [])
    .length;
  const digits = (text.match(/\d/g) || []).length;
  const spaces = (text.match(/\s/g) || []).length;
  const rest = Math.max(0, text.length - cjk - emoji - digits - spaces);
  return Math.round(
    cjk * 0.7 + emoji * 2.5 + digits * 0.35 + spaces * 0.25 + rest * 0.28,
  );
}

/** Минимальное окно (сек): слишком короткое даёт завышенный TPS. */
const MIN_WINDOW = 0.3;

/**
 * Счётчик скорости: фиксирует время первого токена и число выведенных токенов,
 * в реальном времени считает средний TPS.
 */
function createTpsMeter() {
  let startAt = 0;
  let baseAcc = 0;
  let lastAcc = 0;
  let hasAcc = false;
  let running = false;
  let value = 0;
  let tokens = 0;
  let lastTextLen = 0;

  function startNewRound() {
    startAt = 0;
    baseAcc = 0;
    lastAcc = 0;
    hasAcc = false;
    running = false;
    tokens = 0;
    lastTextLen = 0;
  }

  return {
    update(text, finished, acc, now) {
      if (now === undefined) now = Date.now();
      if (finished) {
        running = false;
        return value;
      }

      const textLen = (text || "").length;
      if (
        (!running && startAt !== 0) ||
        (startAt !== 0 && textLen < lastTextLen)
      ) {
        startNewRound();
      }
      running = true;
      lastTextLen = textLen;

      let outTokens = -1;
      if (typeof acc === "number" && acc >= 0) {
        if (!hasAcc) {
          baseAcc = acc;
          hasAcc = true;
          startAt = now;
        }
        lastAcc = acc;
        const accTokens = lastAcc - baseAcc;
        if (accTokens > 0) outTokens = accTokens;
      }

      if (outTokens <= 0) {
        outTokens = estimateTokens(text);
        if (outTokens <= 0) return value;
        if (startAt === 0) startAt = now;
      }

      tokens = outTokens;
      const elapsed = (now - startAt) / 1000;
      if (elapsed >= MIN_WINDOW) value = tokens / elapsed;
      return value;
    },
    reset() {
      startNewRound();
      value = 0;
    },
    get value() {
      return value;
    },
    get tokens() {
      return tokens;
    },
    get active() {
      return running;
    },
  };
}

/** Отформатировать TPS для отображения (пустая строка, если нет данных). */
function formatTps(value) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return value >= 100 ? String(Math.round(value)) : value.toFixed(1);
}

module.exports = { estimateTokens, createTpsMeter, formatTps };
