/**
 * Кнопка «Экспорт в PDF/DOCX» под каждым ответом AI в чате DeepSeek.
 *
 * DeepSeek вставляет панель кнопок (копировать / обновить / лайк / дизлайк /
 * поделиться) под каждым ответом. Мы добавляем шестую кнопку — свою, с
 * выпадающим меню из двух пунктов: «Скачать PDF» и «Скачать DOCX».
 *
 * Кнопка вставляется один раз на группу кнопок (идемпотентно).
 */
const { ipcRenderer } = require("electron");
const { t } = require("../i18n/i18n");

const BTN_ATTR = "data-cuckoo-export-btn";
const MENU_ATTR = "data-cuckoo-export-menu";

// Стабильные классы DeepSeek: сама группа кнопок в панели ответа.
// Класс ._54866f7 — хешированный, DeepSeek добавляет его не всегда (при React-ререндере
// может исчезать). Опираемся только на стабильный ._965abe9 (есть у всех панелей кнопок).
const ACTION_BAR_GROUP_SELECTOR = ".ds-flex._965abe9";
// Fallback — любой .ds-flex, содержащий кнопки .ds-button--iconLabelTertiary.
const ACTION_BAR_PARENT_SELECTOR = ".ds-flex._0a3d93b";

// SVG-иконка «документ с стрелкой вниз» (в стиле Lucide/Feather, 16×16).
const DOWNLOAD_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M8 2v8m0 0 3-3m-3 3-3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M2.5 11.5v1a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
  "</svg>";

/**
 * Классы, повторяющие структуру родных кнопок DeepSeek.
 * Используем родные классы, чтобы кнопка визуально совпала.
 */
const NATIVE_BUTTON_CLASSES =
  "ds-button ds-button--iconLabelTertiary ds-button--icon ds-button--capsule ds-button--xs ds-button--icon-relative-l";

/**
 * Найти markdown-ответ внутри сообщения, к которому относится панель кнопок.
 * Поднимаемся от панели вверх до .ds-message, потом ищем .ds-markdown.
 */
function findMarkdownForActionBar(actionBar) {
  // Кнопка сидит внутри action-bar, который у DeepSeek может быть как внутри
  // .ds-message (рядом с .ds-markdown), так и его сиблингом. Поэтому идём
  // вверх и на каждом уровне ищем .ds-markdown в этом поддереве, но
  // исключаем поддерево самого action-bar (чтобы не поймать чужой markdown,
  // который React мог положить внутрь). На практике достаточно подняться на
  // 1-2 уровня до общего родителя .ds-markdown и .ds-flex._0a3d93b.
  let cur = actionBar;
  let depth = 0;
  while (cur && cur !== document.body && depth < 6) {
    // Ищем .ds-markdown внутри текущего уровня, исключая сам actionBar.
    const candidates = cur.querySelectorAll
      ? cur.querySelectorAll(".ds-markdown")
      : [];
    for (const md of candidates) {
      if (!actionBar.contains(md)) return md;
    }
    // Fallback: на уровне выше actionBar может быть прямой сиблинг.
    let prev = cur.previousElementSibling;
    while (prev) {
      if (prev.classList && prev.classList.contains("ds-markdown")) return prev;
      if (prev.querySelector) {
        const md = prev.querySelector(".ds-markdown");
        if (md) return md;
      }
      prev = prev.previousElementSibling;
    }
    cur = cur.parentElement;
    depth++;
  }
  return null;
}

/**
 * Построить элемент кнопки.
 */
function buildExportButton() {
  const btn = document.createElement("div");
  btn.setAttribute("role", "button");
  btn.setAttribute("tabindex", "0");
  btn.setAttribute("title", t("export.btn.title"));
  btn.setAttribute(BTN_ATTR, "1");
  btn.className = NATIVE_BUTTON_CLASSES;

  // Внутренняя разметка, максимально похожая на родную.
  btn.innerHTML =
    '<div class="ds-button__background"></div>' +
    '<div class="ds-button__icon ds-button__icon--last-child">' +
    '  <div class="ds-icon" style="font-size: inherit;">' +
    DOWNLOAD_ICON_SVG +
    "</div>" +
    "</div>";

  // Меню (скрыто по умолчанию).
  const menu = document.createElement("div");
  menu.setAttribute(MENU_ATTR, "1");
  menu.style.cssText =
    "position:absolute; z-index:99999; min-width:160px; " +
    "background:#1e1e2e; color:#dde1ff; border:1px solid rgba(139,147,255,0.35); " +
    "border-radius:8px; padding:4px; box-shadow:0 6px 20px rgba(0,0,0,0.45); " +
    "font-size:13px; display:none; user-select:none;";
  menu.innerHTML =
    '<div data-action="pdf" style="padding:8px 12px;border-radius:6px;cursor:pointer;">' +
    t("export.menu.pdf") +
    "</div>" +
    '<div data-action="docx" style="padding:8px 12px;border-radius:6px;cursor:pointer;">' +
    t("export.menu.docx") +
    "</div>";

  // Hover-подсветка пунктов.
  menu.addEventListener("mouseover", (e) => {
    const target = e.target.closest && e.target.closest("[data-action]");
    if (target) target.style.background = "rgba(139,147,255,0.18)";
  });
  menu.addEventListener("mouseout", (e) => {
    const target = e.target.closest && e.target.closest("[data-action]");
    if (target) target.style.background = "";
  });

  // Обёртка, чтобы позиционировать кнопку; меню живёт в document.body,
  // чтобы родительские контейнеры DeepSeek с overflow:hidden не обрезали выпадашку.
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:relative; display:inline-flex;";
  wrap.appendChild(btn);

  // Ссылка на меню — чтобы decorateActionBar мог удалить его при пересоздании wrap.
  wrap._cuckooMenu = menu;
  btn._cuckooMenu = menu;

  // Открытие/закрытие меню по клику.
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = menu.style.display === "block";
    if (isOpen) {
      menu.style.display = "none";
      return;
    }
    // Позиционируем fixed относительно viewport, над кнопкой.
    const rect = btn.getBoundingClientRect();
    menu.style.display = "block";
    menu.style.position = "fixed";
    menu.style.left = "auto";
    menu.style.right = window.innerWidth - rect.right + "px";
    menu.style.bottom = window.innerHeight - rect.top + 6 + "px";
    menu.style.top = "auto";
    menu.style.marginBottom = "0";
  });

  // Обработчик пунктов меню.
  menu.addEventListener("click", async (e) => {
    try {
      console.log(
        "[Cookie Code] export menu click, target=",
        e.target && e.target.tagName,
        e.target && e.target.className,
      );
      // e.target может быть текстовой нодой (нет .closest) — берём родителя.
      let tNode = e.target;
      if (tNode && tNode.nodeType === 3) tNode = tNode.parentElement; // TEXT_NODE → Element
      const action = tNode && tNode.closest && tNode.closest("[data-action]");
      if (!action) {
        console.warn(
          "[Cookie Code] export: клик по меню, но data-action не найден",
        );
        return;
      }
      e.stopPropagation();
      const format = action.getAttribute("data-action");
      console.log("[Cookie Code] export action:", format);
      menu.style.display = "none";

      console.log("[Cookie Code] export: ищу markdown элемент...");
      const markdown =
        wrap._cuckooMarkdown ||
        btn._cuckooMarkdown ||
        findMarkdownForActionBar(btn);
      if (!markdown) {
        console.warn("[Cookie Code] export: не найден .ds-markdown для ответа");
        return;
      }
      console.log("[Cookie Code] export: найден markdown, клонирую...");
      // Клонируем и вычищаем служебные элементы (toolbar/banner/скрипты).
      const clone = markdown.cloneNode(true);
      // 1. Служебные теги.
      clone
        .querySelectorAll("script, style, link, noscript, iframe")
        .forEach((el) => el.remove());
      // 2. Скрытые элементы (DeepSeek прячет так баннеры code-блоков, обёртки тулов).
      clone
        .querySelectorAll(
          '[style*="display: none"], [style*="display:none"], [hidden], [aria-hidden="true"]',
        )
        .forEach((el) => el.remove());
      // 3. Иконки: все SVG — это UI-графика (копирование, скачивание, тулы),
      //    в документе они дают мусор и «svg внутри».
      clone.querySelectorAll("svg").forEach((el) => el.remove());
      // 4. Кнопки/тулбары/баннеры, включая родные <div role="button"> DeepSeek
      //    и обёртки code-блоков (классы хешированные, поэтому ловим по подстрокам).
      clone
        .querySelectorAll(
          'button, [role="button"], [class*="button"], [class*="toolbar"], [class*="copy"], ' +
            '[class*="download"], [class*="banner"], [class*="code-block"], [class*="codeBlock"]',
        )
        .forEach((el) => el.remove());
      // 5. Служебные элементы плагина Cookie Code (иконки/панели тулов).
      clone
        .querySelectorAll(
          '[class*="cuckoo-tool"], [class*="cuckoo-response-meta"]',
        )
        .forEach((el) => el.remove());
      const html = clone.innerHTML;
      console.log(
        "[Cookie Code] export: HTML подготовлен, длина =",
        html.length,
      );

      // Показываем фидбек в самом пункте меню.
      const originalText = action.textContent;
      try {
        action.textContent = t("export.status.working");
      } catch (_) {}

      console.log(
        "[Cookie Code] export: вызываю cuckoo-chat-export IPC напрямую, format =",
        format,
        ", html.length =",
        html.length,
      );
      const res = await ipcRenderer.invoke("cuckoo-chat-export", {
        format,
        html,
        defaultName: "CookieCode",
      });
      console.log("[Cookie Code] export: IPC ответ =", JSON.stringify(res));

      if (res && res.success) {
        action.textContent = t("export.status.ok");
      } else if (res && res.canceled) {
        action.textContent = originalText;
      } else {
        action.textContent = t("export.status.err");
      }
      setTimeout(() => {
        action.textContent = originalText;
      }, 1500);
    } catch (fatalErr) {
      console.error(
        "[Cookie Code] export FATAL error:",
        fatalErr.message,
        fatalErr.stack,
      );
    }
  });

  // Не даём клику по кнопке всплыть выше и закрыть себя.
  btn.addEventListener("mousedown", (e) => e.stopPropagation());

  // Меню выносим в document.body ПОСЛЕ навешивания всех обработчиков —
  // так клик по пункту меню гарантированно попадает в menu.addEventListener('click').
  document.body.appendChild(menu);

  return wrap;
}

/**
 * Вставить кнопку экспорта в группу кнопок, если её там ещё нет.
 */
function decorateActionBar(actionBarGroup) {
  if (actionBarGroup.querySelector("[" + BTN_ATTR + "]")) return; // уже есть
  try {
    // Находим .ds-markdown, к которому относится эта панель, СРАЗУ —
    // и запоминаем ссылку. Иначе после React-перерендера кнопка может
    // оказаться в копии группы, отвязанной от исходного .ds-message.
    const markdown = findMarkdownForActionBar(actionBarGroup);
    const wrap = buildExportButton();
    // Если нашли markdown — сохраняем прямую ссылку, минуя поиск по DOM.
    if (markdown) wrap._cuckooMarkdown = markdown;
    // Чистим «осиротевшие» меню от предыдущих пересозданий wrap.
    try {
      document.querySelectorAll("[" + MENU_ATTR + "]").forEach((m) => {
        const owner = m.__cuckooOwner || null;
        if (owner && !owner.isConnected) m.remove();
      });
    } catch (_) {}
    if (wrap._cuckooMenu) wrap._cuckooMenu.__cuckooOwner = wrap;
    actionBarGroup.appendChild(wrap);
  } catch (err) {
    console.error("[Cookie Code] export decorateActionBar error:", err.message);
  }
}

/**
 * Просканировать документ и добавить кнопку во все панели кнопок под ответами.
 */
function scanAll() {
  let groups = document.querySelectorAll(ACTION_BAR_GROUP_SELECTOR);
  if (groups.length === 0) {
    // Fallback: ищем .ds-flex._0a3d93b, внутри которых есть .ds-button--iconLabelTertiary.
    const parents = document.querySelectorAll(ACTION_BAR_PARENT_SELECTOR);
    groups = [];
    parents.forEach((p) => {
      const firstGroup = p.querySelector(
        '.ds-flex > [role="button"].ds-button--iconLabelTertiary',
      );
      if (firstGroup && firstGroup.parentElement)
        groups.push(firstGroup.parentElement);
    });
  }
  groups.forEach(decorateActionBar);
}

/**
 * Закрыть все открытые меню при клике вне.
 */
function closeAllMenus() {
  document.querySelectorAll("[" + MENU_ATTR + "]").forEach((m) => {
    m.style.display = "none";
  });
}

let started = false;
function startWatch() {
  if (started) return;
  started = true;
  window.__cuckooExportWatchStarted = true;

  // Первый прогон по уже отрисованным ответам.
  scanAll();

  // Debounced-обход по мутациям DOM (DeepSeek перерисовывает ответы React'ом).
  let timer = null;
  const runDebounced = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      scanAll();
    }, 600);
  };

  if (document.body) {
    const mo = new MutationObserver(runDebounced);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // Закрываем меню при клике в любое место документа (кроме самого меню).
  // Bubble-фаза (без true), чтобы не перехватывать клик раньше, чем его
  // обработает сам пункт меню.
  document.addEventListener("click", (e) => {
    if (e.target && e.target.closest && e.target.closest("[" + MENU_ATTR + "]"))
      return;
    closeAllMenus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus();
  });

  console.log("[Cookie Code] chat-export watch started");
}

module.exports = { startWatch, scanAll };
