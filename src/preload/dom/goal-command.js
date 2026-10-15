/**
 * Перехват команды /goal в веб-чате.
 *
 * Пользователь вводит "/goal <текст>" и жмёт Enter (или кнопку отправки).
 * Мы перехватываем отправку ДО того, как текст уйдёт в AI:
 *   - "/goal <текст>"        → старт цели (startGoal), текст в AI не уходит
 *   - "/goal"                → показать статус текущей цели
 *   - "/goal stop"           → остановить цель
 *   - "/goal pause"          → пауза
 *   - "/goal resume"         → возобновить
 *
 * Перехват: capture-фаза keydown (Enter) + клик по кнопке отправки.
 * Если перехватили — preventDefault + stopPropagation + очищаем поле.
 */
const chatInput = require("./chat-input");
const goalEngine = require("./goal-engine");

const CMD_RE = /^\/goal(\s|$)/i;

let installed = false;

/** Прочитать текущий текст поля ввода. */
function readField() {
  const field = chatInput.findInputArea();
  if (!field) return { field: null, text: "" };
  const text =
    field.tagName === "TEXTAREA" || field.tagName === "INPUT"
      ? field.value || ""
      : field.textContent || "";
  return { field, text: String(text) };
}

/** Очистить поле ввода. */
function clearField(field) {
  try {
    chatInput.setInputContent(field, "");
  } catch (_) {}
}

/**
 * Обработать команду /goal. Возвращает true, если команда распознана
 * (значит, отправку в AI надо отменить).
 * @param {string} raw
 * @returns {boolean}
 */
function handleGoalCommand(raw) {
  const text = String(raw || "").trim();
  if (!CMD_RE.test(text)) return false;

  const arg = text.replace(/^\/goal\s*/i, "").trim();
  const lower = arg.toLowerCase();

  if (!arg) {
    // Показать статус.
    const st = goalEngine.getState();
    if (!st.active && !st.done) {
      logToChat("Цель не задана. Используй: /goal <описание цели>");
    } else {
      logToChat(
        "Текущая цель: " +
          st.text +
          " — " +
          (st.done ? "завершена" : st.paused ? "на паузе" : "выполняется") +
          " (итерация " +
          st.round +
          (st.maxIterations ? "/" + st.maxIterations : "") +
          ", " +
          fmtElapsed(st.elapsedMs) +
          ")",
      );
    }
    return true;
  }

  if (lower === "stop" || lower === "exit") {
    goalEngine.stopGoal("цель остановлена пользователем");
    logToChat("Цель остановлена.");
    return true;
  }
  if (lower === "pause") {
    const r = goalEngine.pauseGoal();
    logToChat(r.success ? "Цель поставлена на паузу." : "Нет активной цели.");
    return true;
  }
  if (lower === "resume") {
    const r = goalEngine.resumeGoal();
    logToChat(r.success ? "Цель возобновлена." : "Нет цели для возобновления.");
    return true;
  }

  // Иначе — новая цель: arg это описание.
  const r = goalEngine.startGoal(arg);
  if (!r.success) {
    logToChat("Не удалось задать цель: " + (r.error || "неизвестная ошибка"));
    return true;
  }
  logToChat(
    "Цель задана (авто-итерации, макс. " +
      r.goal.maxIterations +
      "; AI завершит сам).",
  );
  // Отправляем в AI инструкцию цели.
  const sendText = goalEngine.buildGoalSendText(arg);
  setTimeout(() => {
    try {
      chatInput.sendToChat(sendText, "goal-start", 200);
    } catch (_) {}
  }, 50);
  return true;
}

/** Служебное сообщение в чат (через отправку себе не пойдёт — просто лог + тост). */
function logToChat(msg) {
  console.log("[Goal] " + msg);
  try {
    if (
      window.electronAPI &&
      typeof window.electronAPI.showToast === "function"
    ) {
      window.electronAPI.showToast(msg);
    }
  } catch (_) {}
}

function fmtElapsed(ms) {
  const s = Math.floor((ms || 0) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? m + "м " + sec + "с" : sec + "с";
}

/** Перехват Enter в поле ввода (capture-фаза). */
function onKeyDown(e) {
  if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
  const { field, text } = readField();
  const trimmed = String(text || "").trim();
  // Отладка: показываем каждое нажатие Enter, если в поле что-то есть.
  if (trimmed.indexOf("/goal") === 0) {
    console.log(
      "[Goal] onKeyDown Enter: field=" +
        !!field +
        " text=" +
        JSON.stringify(trimmed),
    );
  }
  if (!field) return;
  if (!CMD_RE.test(trimmed)) return;
  // Перехватываем: команда обрабатывается локально, в AI не уходит.
  e.preventDefault();
  e.stopPropagation();
  if (typeof e.stopImmediatePropagation === "function")
    e.stopImmediatePropagation();
  clearField(field);
  handleGoalCommand(text);
}

/** Перехват клика по кнопке отправки. */
function onSendClick(e) {
  const { text } = readField();
  if (!CMD_RE.test(String(text || "").trim())) return;
  // Только если это кнопка отправки рядом с полем.
  const target =
    e.target && e.target.closest ? e.target.closest("button") : null;
  if (!target) return;
  const aria = (target.getAttribute("aria-label") || "").toLowerCase();
  const isSend =
    target.type === "submit" ||
    aria.indexOf("send") !== -1 ||
    aria.indexOf("отправ") !== -1;
  if (!isSend) return;
  e.preventDefault();
  e.stopPropagation();
  const { field } = readField();
  if (field) clearField(field);
  handleGoalCommand(text);
}

/** Установить перехватчики (capture-фаза на document). */
function install() {
  if (installed) return;
  installed = true;
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("click", onSendClick, true);
  console.log("[Goal] перехват команды /goal установлен");
}

module.exports = { install, handleGoalCommand, CMD_RE };
