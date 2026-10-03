const { ipcRenderer } = require("electron");

const STYLE_ID = "cuckoo-ask-user-question-style";
const DIALOG_ID = "cuckoo-ask-user-question";
const POSITION_KEY = "cuckoo-ask-user-question-pos";

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value || "");
  return div.innerHTML;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${DIALOG_ID} { position:fixed; inset:0; z-index:2147483647; display:flex; align-items:center; justify-content:center; background:rgba(5,8,18,.62); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    #${DIALOG_ID} .cuckoo-question-card { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(620px,calc(100vw - 32px)); max-height:calc(100vh - 32px); overflow:auto; padding:22px; color:#eef1ff; background:#171b2c; border:1px solid rgba(145,158,255,.42); border-radius:12px; box-shadow:0 20px 70px rgba(0,0,0,.55); }
    #${DIALOG_ID} .cuckoo-question-drag { margin:-22px -22px 18px; padding:16px 22px 0; cursor:move; user-select:none; }
    #${DIALOG_ID} h2 { margin:0; font-size:18px; }
    #${DIALOG_ID} .cuckoo-question-close { position:absolute; top:12px; right:12px; width:30px; height:30px; padding:0; display:flex; align-items:center; justify-content:center; font-size:18px; line-height:1; color:#aeb5cd; background:transparent; border:1px solid rgba(255,255,255,.14); border-radius:8px; cursor:pointer; }
    #${DIALOG_ID} .cuckoo-question-close:hover { color:#fff; background:rgba(255,255,255,.08); }
    #${DIALOG_ID} .cuckoo-question { margin:0 0 18px; padding:14px; border:1px solid rgba(255,255,255,.12); border-radius:8px; }
    #${DIALOG_ID} .cuckoo-question-title { margin:0 0 10px; font-weight:600; line-height:1.45; }
    #${DIALOG_ID} label { display:block; margin:7px 0; padding:9px 11px; border:1px solid rgba(255,255,255,.14); border-radius:7px; cursor:pointer; }
    #${DIALOG_ID} label:has(input:checked) { border-color:#8d9bff; background:rgba(111,126,255,.18); }
    #${DIALOG_ID} input[type=radio] { margin-right:8px; accent-color:#8d9bff; }
    #${DIALOG_ID} .cuckoo-recommended { color:#aab5ff; font-size:11px; margin-left:8px; }
    #${DIALOG_ID} .cuckoo-option-description { display:block; margin:4px 0 0 23px; color:#aeb5cd; font-size:12px; }
    #${DIALOG_ID} input[type=text] { box-sizing:border-box; width:100%; margin-top:7px; padding:8px 10px; color:#eef1ff; background:#0f1322; border:1px solid rgba(255,255,255,.18); border-radius:6px; }
    #${DIALOG_ID} .cuckoo-question-footer { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
    #${DIALOG_ID} button { padding:9px 16px; border:0; border-radius:7px; color:#fff; background:#6574ee; cursor:pointer; font-weight:600; }
  `;
  document.head.appendChild(style);
}

function askUserQuestion(questions, requestId) {
  ensureStyles();
  const old = document.getElementById(DIALOG_ID);
  if (old) old.remove();

  return new Promise((resolve, reject) => {
    const dialog = document.createElement("div");
    dialog.id = DIALOG_ID;
    dialog.innerHTML =
      '<div class="cuckoo-question-card" role="dialog" aria-modal="true"><div class="cuckoo-question-drag"><h2>Вопрос от ИИ</h2></div><button type="button" class="cuckoo-question-close" title="Закрыть">×</button><form></form></div>';
    const form = dialog.querySelector("form");
    questions.forEach((item, questionIndex) => {
      const section = document.createElement("section");
      section.className = "cuckoo-question";
      section.innerHTML =
        '<p class="cuckoo-question-title">' +
        (questionIndex + 1) +
        ". " +
        escapeHtml(item.question) +
        "</p>";
      item.options.forEach((option, optionIndex) => {
        const label = document.createElement("label");
        label.innerHTML =
          '<input type="radio" name="question-' +
          questionIndex +
          '" value="option-' +
          optionIndex +
          '">' +
          escapeHtml(option.label) +
          (option.recommended
            ? '<span class="cuckoo-recommended">Рекомендуемый</span>'
            : "") +
          (option.description
            ? '<span class="cuckoo-option-description">' +
              escapeHtml(option.description) +
              "</span>"
            : "");
        section.appendChild(label);
      });
      const custom = document.createElement("input");
      custom.type = "text";
      custom.name = "custom-" + questionIndex;
      custom.placeholder = "Свой ответ";
      section.appendChild(custom);
      form.appendChild(section);
    });
    const footer = document.createElement("div");
    footer.className = "cuckoo-question-footer";
    footer.innerHTML =
      '<button type="submit">Отправить ответы (Enter)</button>';
    form.appendChild(footer);
    document.body.appendChild(dialog);

    const card = dialog.querySelector(".cuckoo-question-card");
    const dragHandle = dialog.querySelector(".cuckoo-question-drag");
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
      if (
        saved &&
        typeof saved.left === "number" &&
        typeof saved.top === "number"
      ) {
        card.style.left = saved.left + "px";
        card.style.top = saved.top + "px";
        card.style.transform = "none";
      }
    } catch (_) {}

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const onMove = (event) => {
      if (!dragging) return;
      const rect = card.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - rect.height);
      const left = Math.max(
        0,
        Math.min(maxLeft, startLeft + event.clientX - startX),
      );
      const top = Math.max(
        0,
        Math.min(maxTop, startTop + event.clientY - startY),
      );
      card.style.left = left + "px";
      card.style.top = top + "px";
      card.style.transform = "none";
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      try {
        const rect = card.getBoundingClientRect();
        localStorage.setItem(
          POSITION_KEY,
          JSON.stringify({ left: rect.left, top: rect.top }),
        );
      } catch (_) {}
    };
    dragHandle.addEventListener("mousedown", (event) => {
      dragging = true;
      const rect = card.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      startX = event.clientX;
      startY = event.clientY;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      event.preventDefault();
    });

    const finish = () => {
      const answers = questions.map((item, questionIndex) => {
        const custom = form
          .querySelector('[name="custom-' + questionIndex + '"]')
          .value.trim();
        const selected = form.querySelector(
          '[name="question-' + questionIndex + '"]:checked',
        );
        const optionIndex = selected
          ? Number(selected.value.replace("option-", ""))
          : -1;
        return {
          question: item.question,
          answer:
            custom || (optionIndex >= 0 ? item.options[optionIndex].label : ""),
        };
      });
      if (answers.some((answer) => !answer.answer)) return;
      onUp();
      dialog.remove();
      resolve(answers);
    };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      finish();
    });
    form.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
        event.preventDefault();
        finish();
      }
    });

    // Закрытие/отмена: кнопка ×, Esc, клик по затемнению вокруг карточки.
    const cancel = () => {
      onUp();
      document.removeEventListener("keydown", onKeyDown, true);
      dialog.remove();
      reject(new Error("canceled"));
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    const closeBtn = dialog.querySelector(".cuckoo-question-close");
    if (closeBtn) closeBtn.addEventListener("click", cancel);
    dialog.addEventListener("mousedown", (event) => {
      if (event.target === dialog) cancel();
    });
    document.addEventListener("keydown", onKeyDown, true);

    form.querySelector("input").focus();
  });
}

function registerAskUserQuestionListener() {
  ipcRenderer.on("ask-user-question", (_event, payload) => {
    askUserQuestion(payload.questions || [], payload.requestId).then(
      (answers) => {
        ipcRenderer.send("ask-user-question-response", {
          requestId: payload.requestId,
          answers,
        });
      },
      (err) => {
        // Пользователь закрыл диалог (×/Esc/клик по фону) — сообщаем об отмене.
        if (err && err.message === "canceled") {
          ipcRenderer.send("ask-user-question-response", {
            requestId: payload.requestId,
            canceled: true,
          });
        }
      },
    );
  });
  // Вопрос был отвечен в Telegram — просто закрываем диалог в окне.
  ipcRenderer.on("ask-user-question-resolved", () => {
    const dialog = document.getElementById(DIALOG_ID);
    if (dialog) dialog.remove();
  });
}

module.exports = { askUserQuestion, registerAskUserQuestionListener };
