/**
 * Пет (чубрик) на экране.
 *
 * Два режима:
 *   - 'center'  — спавн по центру окна, перетаскивается мышкой (по умолчанию)
 *   - 'docked'  — прилипает к верхней границе поля ввода (F10)
 *
 * Спрайт: <userData>/pets/<id>.{png,gif,webp,jpg,jpeg} (base64 через fs).
 * Если спрайта нет — рисуется жёлтая заглушка с подписью (видно всегда).
 *
 * Горячие клавиши:
 *   F8  — прицел: кликните в точку, куда посадить пета.
 *         Сохраняет позицию в ДОЛЯХ поля ввода (ratioX / ratioY от 0 до 1),
 *         поэтому пет садится в то же место при любом разрешении/размере окна.
 *   F9  — debug-рамка вокруг поля ввода (селектор _._77cefa5)
 *   F10 — переключить режим center ↔ docked
 *   F11 — сбросить размер пета к дефолтному
 *   Esc — отмена режима прицела
 *
 * Размер пета: наведи мышку на пета → появится синий уголок в правом
 * нижнем углу → тяни его мышкой. Размер 24..400px.
 */

const fs = require("fs");
const path = require("path");

const INPUT_SELECTOR = "._77cefa5";
const PET_SIZE_DEFAULT = 64;
const PET_SIZE_MIN = 24;
const PET_SIZE_MAX = 400;
// Значения, к которым сбрасывает кнопка «Сбросить» в настройках.
// Синхронизированы с src/main/settings-store.js (ключи pet*).
const PET_RESET_DEFAULTS = {
  petMode: "docked",
  petRatioX: 0.939,
  petRatioY: 0.016,
  petSize: PET_SIZE_DEFAULT,
  petId: "",
};
// Точка посадки пета — в ДОЛЯХ поля ввода, а не в пикселях.
// Это делает пет устойчивым к разным разрешениям, размерам окна и зуму:
// при ресайзе rect поля меняется, но доли те же → пет на том же месте поля.
let dockOffsetXRatio = 0.939; // подобрано прицелом F8: у правого края поля
let dockOffsetYRatio = 0.016; // чуть ниже верхней границы

// ---- userData ----
let USER_DATA_DIR = "";
try {
  const arg = (process.argv || []).find((a) =>
    a.startsWith("--cuckoo-user-data="),
  );
  if (arg) USER_DATA_DIR = arg.slice("--cuckoo-user-data=".length);
} catch (_) {}
const PETS_DIR = USER_DATA_DIR ? path.join(USER_DATA_DIR, "pets") : "";

// ---- Состояние ----
let started = false;
let petEl = null,
  frameEl = null,
  labelEl = null,
  phEl = null;
let debugOn = false;
let mode = "docked"; // 'center' | 'docked' (старт сразу у поля; F10 — переключить)
let dataUriCache = null;
let currentPetId = "chubrik";
let petSize = PET_SIZE_DEFAULT; // текущий размер пета (px)
let resizing = false;
let resizeStart = null; // { px, py, size }
let resizeHandleEl = null;
// Режим прицела (F8): следующий клик мышкой задаёт точку посадки пета.
let aiming = false;
let aimOverlayEl = null;
// Debug-режим: разрешает горячие клавиши F8/F9/F10/F11.
// Управляется тумблером в настройках Cookie Code.
let debugMode = false;

// Позиция в режиме 'center' (px, от левого верхнего угла окна)
let centerPos = null; // { x, y } — null значит «ещё не задана → центр экрана»
let dragging = false;
let dragOff = { x: 0, y: 0 };

const MIME = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
};

function loadPetDataUri(petId) {
  if (dataUriCache && dataUriCache.id === petId) return dataUriCache.uri;
  if (!PETS_DIR) return "";
  try {
    if (!fs.existsSync(PETS_DIR)) return "";
    const exts = [".png", ".gif", ".webp", ".jpg", ".jpeg"];
    for (const ext of exts) {
      const full = path.join(PETS_DIR, petId + ext);
      if (fs.existsSync(full)) {
        const buf = fs.readFileSync(full);
        const uri =
          "data:" +
          (MIME[ext] || "image/png") +
          ";base64," +
          buf.toString("base64");
        dataUriCache = { id: petId, uri };
        console.log("[Cookie Code] Спрайт пета:", full);
        return uri;
      }
    }

    // Фолбэк: берём первый попавшийся файл-картинку в папке
    const files = fs
      .readdirSync(PETS_DIR)
      .filter((f) => exts.includes(path.extname(f).toLowerCase()))
      .sort();
    if (files.length > 0) {
      const f = files[0];
      const full = path.join(PETS_DIR, f);
      const ext = path.extname(f).toLowerCase();
      const buf = fs.readFileSync(full);
      const uri =
        "data:" +
        (MIME[ext] || "image/png") +
        ";base64," +
        buf.toString("base64");
      dataUriCache = { id: petId, uri };
      console.log("[Cookie Code] Спрайт пета (фолбэк):", full);
      return uri;
    }
  } catch (err) {
    console.error("[Cookie Code] 读取 спрайт пета失败:", petId, err.message);
  }
  return "";
}

/**
 * Контейнер пета: <div> с <img> внутри + emoji-заглушка, если нет спрайта.
 * Контейнер — таскаемый (pointer-events: auto), сам img — none.
 */
function ensureElements() {
  if (!petEl) {
    petEl = document.createElement("div");
    petEl.className = "cuckoo-pet";
    petEl.style.cssText =
      "position: fixed; z-index: 2147483000; " +
      "width: " +
      petSize +
      "px; height: " +
      petSize +
      "px; " +
      "cursor: grab; user-select: none; -webkit-user-drag: none; " +
      "transition: left 0.06s linear, top 0.06s linear; " +
      "filter: drop-shadow(0 4px 8px rgba(0,0,0,0.45));" +
      "box-sizing:border-box;";
    petEl.setAttribute("draggable", "false");

    // Спрайт
    const img = document.createElement("img");
    img.className = "cuckoo-pet-img";
    img.draggable = false;
    img.style.cssText =
      "width:100%;height:100%;image-rendering:pixelated;display:none;pointer-events:none;";
    petEl.appendChild(img);

    // Заглушка (когда спрайта нет)
    const ph = document.createElement("div");
    ph.className = "cuckoo-pet-ph";
    ph.style.cssText =
      "width:100%;height:100%;display:none;align-items:center;justify-content:center;" +
      "background:rgba(255,204,0,0.85);border:2px dashed #a76a00;border-radius:10px;" +
      "font:28px/1 sans-serif;color:#000;box-sizing:border-box;pointer-events:none;";
    ph.textContent = "🐦";
    petEl.appendChild(ph);
    phEl = ph;

    // Уголок-ресайз (правый нижний)
    const rh = document.createElement("div");
    rh.className = "cuckoo-pet-resize";
    rh.style.cssText =
      "position:absolute;right:-4px;bottom:-4px;width:14px;height:14px;" +
      "background:#8b93ff;border:2px solid #fff;border-radius:3px;" +
      "cursor:nwse-resize;opacity:0;transition:opacity 0.15s;box-sizing:border-box;" +
      "pointer-events:auto;";
    petEl.appendChild(rh);
    resizeHandleEl = rh;

    petEl.addEventListener("pointerenter", () => {
      // Уголок ресайза показываем только в debug-режиме
      if (debugMode && resizeHandleEl) resizeHandleEl.style.opacity = "1";
    });
    petEl.addEventListener("pointerleave", () => {
      if (resizeHandleEl && !resizing) resizeHandleEl.style.opacity = "0";
    });

    document.body.appendChild(petEl);

    // Перетаскивание
    petEl.addEventListener("pointerdown", onDragStart);
    window.addEventListener("pointermove", onDragMove, true);
    window.addEventListener("pointerup", onDragEnd, true);

    // Ресайз
    rh.addEventListener("pointerdown", onResizeStart);
    window.addEventListener("pointermove", onResizeMove, true);
    window.addEventListener("pointerup", onResizeEnd, true);
  }
  if (!frameEl) {
    frameEl = document.createElement("div");
    frameEl.className = "cuckoo-pet-frame";
    frameEl.style.cssText =
      "position: fixed; z-index: 2147482999; pointer-events: none; " +
      "border: 2px dashed #ff3355; background: rgba(255,51,85,0.06); " +
      "box-sizing: border-box; display: none;";
    document.body.appendChild(frameEl);

    labelEl = document.createElement("div");
    labelEl.style.cssText =
      "position: fixed; z-index: 2147483001; pointer-events: none; " +
      "font: 11px/1.3 Consolas,monospace; color: #fff; " +
      "background: rgba(255,51,85,0.92); padding: 3px 7px; border-radius: 6px; " +
      "white-space: pre; display: none;";
    document.body.appendChild(labelEl);
  }
}

// ---- Drag ----
function onDragStart(e) {
  if (mode !== "center") return;
  if (!centerPos) return;
  dragging = true;
  dragOff = { x: e.clientX - centerPos.x, y: e.clientY - centerPos.y };
  petEl.style.cursor = "grabbing";
  try {
    petEl.setPointerCapture(e.pointerId);
  } catch (_) {}
  e.preventDefault();
}
function onDragMove(e) {
  if (!dragging) return;
  centerPos = { x: e.clientX - dragOff.x, y: e.clientY - dragOff.y };
  reposition();
}
function onDragEnd() {
  if (!dragging) return;
  dragging = false;
  if (petEl) petEl.style.cursor = "grab";
}

// ---- Resize ----
function onResizeStart(e) {
  // Ресайз доступен только в debug-режиме
  if (!debugMode) return;
  resizing = true;
  resizeStart = { px: e.clientX, py: e.clientY, size: petSize };
  if (resizeHandleEl) resizeHandleEl.style.opacity = "1";
  try {
    e.target.setPointerCapture(e.pointerId);
  } catch (_) {}
  e.preventDefault();
  e.stopPropagation();
}
function onResizeMove(e) {
  if (!resizing || !resizeStart) return;
  const dx = e.clientX - resizeStart.px;
  const dy = e.clientY - resizeStart.py;
  // Угол тянется — берём максимальную дельту (чтобы тянуть и по X, и по Y)
  const delta = Math.max(dx, dy);
  let next = resizeStart.size + delta;
  next = Math.max(PET_SIZE_MIN, Math.min(PET_SIZE_MAX, Math.round(next)));
  petSize = next;
  applySize();
  reposition();
}
function onResizeEnd() {
  if (!resizing) return;
  resizing = false;
  if (resizeHandleEl) resizeHandleEl.style.opacity = "0";
  savePetSettings({ petSize: petSize });
  console.log("[Cookie Code] Размер пета:", petSize + "px");
}

function applySize() {
  if (!petEl) return;
  petEl.style.width = petSize + "px";
  petEl.style.height = petSize + "px";
}

function resetSize() {
  petSize = PET_SIZE_DEFAULT;
  applySize();
  reposition();
  savePetSettings({ petSize: petSize });
  console.log("[Cookie Code] Размер пета сброшен:", petSize + "px");
}

// ---- Сохранение/загрузка настроек пета ----

/**
 * Сохранить один или несколько ключей настроек пета в settings.json.
 * Не блокирует UI, ошибки глушим в консоль.
 * @param {object} patch  например { petRatioX: 0.42, petSize: 96 }
 */
function savePetSettings(patch) {
  try {
    const api = window.electronAPI;
    if (!api || typeof api.setCuckooSetting !== "function") return;
    for (const [k, v] of Object.entries(patch)) {
      Promise.resolve(api.setCuckooSetting(k, v)).catch(() => {});
    }
  } catch (_) {}
}

/**
 * Загрузить настройки пета из settings.json и применить.
 * Вызывается один раз при старте, до первого reposition().
 */
async function loadPetSettings() {
  try {
    const api = window.electronAPI;
    if (!api || typeof api.getCuckooSettings !== "function") return;
    const s = await api.getCuckooSettings();
    if (!s) return;
    if (s.petMode === "center" || s.petMode === "docked") mode = s.petMode;
    if (typeof s.petRatioX === "number") dockOffsetXRatio = s.petRatioX;
    if (typeof s.petRatioY === "number") dockOffsetYRatio = s.petRatioY;
    if (typeof s.petSize === "number")
      petSize = Math.max(PET_SIZE_MIN, Math.min(PET_SIZE_MAX, s.petSize));
    if (typeof s.petId === "string") currentPetId = s.petId;
    debugMode = s.petDebugMode === true;
    console.log(
      "[Cookie Code] Настройки пета: mode=" +
        mode +
        " ratioX=" +
        dockOffsetXRatio +
        " ratioY=" +
        dockOffsetYRatio +
        " size=" +
        petSize +
        " id=" +
        (currentPetId || "(auto)"),
    );
  } catch (err) {
    console.error(
      "[Cookie Code] Не удалось загрузить настройки пета:",
      err.message,
    );
  }
}

// ---- F8: прицел (выбор точки посадки в долях поля) ----

/**
 * Включить/выключить режим прицела. При включении — оверлей на весь экран,
 * перехватывающий клик. Следующий клик вычисляет доли от поля ввода,
 * запоминает их, переключает в docked-режим и мгновенно пересаживает пета.
 */
function toggleAim() {
  aiming = !aiming;
  if (aiming) {
    ensureAimOverlay();
    aimOverlayEl.style.display = "";
    aimOverlayEl.style.cursor = "crosshair";
    console.log(
      "[Cookie Code] Прицел: кликните в точку, куда посадить пета (Esc — отмена)",
    );
  } else {
    if (aimOverlayEl) aimOverlayEl.style.display = "none";
  }
  return aiming;
}

function ensureAimOverlay() {
  if (aimOverlayEl) return;
  aimOverlayEl = document.createElement("div");
  aimOverlayEl.style.cssText =
    "position:fixed;inset:0;z-index:2147483600;" +
    "background:rgba(0,0,0,0.06);" +
    "cursor:crosshair;display:none;";
  aimOverlayEl.addEventListener("click", onAimClick, true);
  document.body.appendChild(aimOverlayEl);
}

function onAimClick(e) {
  if (!aiming) return;
  e.preventDefault();
  e.stopPropagation();

  // Ищем поле ввода и считаем доли от его левого верхнего угла
  const input = document.querySelector(INPUT_SELECTOR);
  if (!input) {
    console.warn(
      "[Cookie Code] Прицел: поле ввода не найдено (" + INPUT_SELECTOR + ")",
    );
    return;
  }
  const r = input.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) {
    console.warn("[Cookie Code] Прицел: поле ввода нулевого размера");
    return;
  }

  // Точка клика — центр пета. Пет садится телом ВЫШЕ точки (y - petSize).
  // Значит точка посадки пета = (клик.x, клик.y + petSize). Переводим в доли.
  const anchorX = e.clientX;
  const anchorY = e.clientY + petSize;
  const ratioX = (anchorX - r.left) / r.width;
  const ratioY = (anchorY - r.top) / r.height;

  dockOffsetXRatio = ratioX;
  dockOffsetYRatio = ratioY;
  mode = "docked";

  savePetSettings({
    petRatioX: ratioX,
    petRatioY: ratioY,
    petMode: "docked",
  });

  toggleAim(); // выключаем прицел
  schedule();

  const msg =
    "Точка посадки: ratioX=" +
    ratioX.toFixed(3) +
    " ratioY=" +
    ratioY.toFixed(3) +
    "  (px поля: left=" +
    Math.round(r.left) +
    " top=" +
    Math.round(r.top) +
    " w=" +
    Math.round(r.width) +
    " h=" +
    Math.round(r.height) +
    ")";
  console.log("[Cookie Code] " + msg);
  // Дублируем в подпись, если debug включён
  if (debugOn && labelEl) {
    labelEl.style.display = "";
    labelEl.textContent =
      "ПРИЦЕЛ ВЫСТАВЛЕН" +
      String.fromCharCode(10) +
      msg +
      String.fromCharCode(10) +
      "F9 — показать рамку";
    labelEl.style.left = Math.round(r.left) + "px";
    labelEl.style.top = Math.round(r.top - 72) + "px";
  }
}

/**
 * Позиция пета.
 */
function computePos() {
  const r = petEl.getBoundingClientRect();
  // клиентская область вьюпорта
  const vw = window.innerWidth,
    vh = window.innerHeight;

  if (mode === "center") {
    if (!centerPos) {
      centerPos = {
        x: Math.round((vw - petSize) / 2),
        y: Math.round((vh - petSize) / 2),
      };
    }
    return { x: centerPos.x, y: centerPos.y, docked: false };
  }

  // docked
  const input = document.querySelector(INPUT_SELECTOR);
  if (!input)
    return {
      x: centerPos ? centerPos.x : (vw - petSize) / 2,
      y: centerPos ? centerPos.y : (vh - petSize) / 2,
      docked: false,
    };
  const ir = input.getBoundingClientRect();
  if (ir.width === 0 || ir.height === 0) {
    return {
      x: centerPos ? centerPos.x : (vw - petSize) / 2,
      y: centerPos ? centerPos.y : (vh - petSize) / 2,
      docked: false,
    };
  }
  // Точка посадки в пикселях — из долей и текущих размеров поля.
  // X — доля ширины. Y — доля высоты (0 = верх поля).
  const anchorX = ir.left + ir.width * dockOffsetXRatio;
  const anchorY = ir.top + ir.height * dockOffsetYRatio;
  // Пет «сидит» телом над точкой посадки, по центру горизонтально.
  let x = anchorX - petSize / 2;
  let y = anchorY - petSize;
  // Защита: пет не должен вылезать за горизонтальные границы поля.
  // Если поле сузилось и пет не влезает — прижимаем к ближнему краю.
  const minX = ir.left;
  const maxX = ir.left + ir.width - petSize;
  if (x < minX) x = minX;
  if (x > maxX) x = maxX;
  // Та же защита по вертикали: не улетать за верх окна.
  if (y < 0) y = 0;
  return { x, y, docked: true, rect: ir, anchorX, anchorY };
}

function reposition() {
  ensureElements();
  const pos = computePos();

  // Спрайт или заглушка
  const uri = loadPetDataUri(currentPetId);
  const img = petEl.querySelector(".cuckoo-pet-img");
  if (uri) {
    if (img.src !== uri) img.src = uri;
    img.style.display = "";
    phEl.style.display = "none";
  } else {
    img.style.display = "none";
    phEl.style.display = "flex";
  }

  petEl.style.left = Math.round(pos.x) + "px";
  petEl.style.top = Math.round(pos.y) + "px";

  // Debug-рамка
  if (debugOn) {
    const input = document.querySelector(INPUT_SELECTOR);
    if (input) {
      const r = input.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        frameEl.style.display = "";
        frameEl.style.left = r.left + "px";
        frameEl.style.top = r.top + "px";
        frameEl.style.width = r.width + "px";
        frameEl.style.height = r.height + "px";

        const markX = r.left + r.width * dockOffsetXRatio;
        const markY = r.top + r.height * dockOffsetYRatio;
        labelEl.style.display = "";
        labelEl.textContent =
          "mode=" +
          mode +
          "  F8=aim  F9=frame  F10=mode  F11=reset" +
          String.fromCharCode(10) +
          "sel=" +
          INPUT_SELECTOR +
          String.fromCharCode(10) +
          "left=" +
          Math.round(r.left) +
          " top=" +
          Math.round(r.top) +
          "  w=" +
          Math.round(r.width) +
          " h=" +
          Math.round(r.height) +
          String.fromCharCode(10) +
          "ratioX=" +
          dockOffsetXRatio.toFixed(3) +
          "  ratioY=" +
          dockOffsetYRatio.toFixed(3) +
          String.fromCharCode(10) +
          "anchor=(" +
          Math.round(markX) +
          "," +
          Math.round(markY) +
          ")";
        labelEl.style.left = Math.round(r.left) + "px";
        labelEl.style.top = Math.round(r.top - 72) + "px";
      } else {
        frameEl.style.display = "none";
        labelEl.style.display = "none";
      }
    } else {
      frameEl.style.display = "none";
      labelEl.style.display = "none";
    }
  } else {
    frameEl.style.display = "none";
    labelEl.style.display = "none";
  }
}

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    try {
      reposition();
    } catch (err) {
      console.error("[Cookie Code] pet reposition err:", err.message);
    }
  });
}

function toggleDebug() {
  debugOn = !debugOn;
  console.log("[Cookie Code] pet debug:", debugOn ? "ON" : "OFF");
  schedule();
  return debugOn;
}

function toggleMode() {
  mode = mode === "center" ? "docked" : "center";
  console.log("[Cookie Code] pet mode:", mode);
  savePetSettings({ petMode: mode });
  schedule();
  return mode;
}

function setPetId(id) {
  currentPetId = String(id || "");
  dataUriCache = null;
  savePetSettings({ petId: currentPetId });
  schedule();
}

/**
 * Включить/выключить debug-режим (разблокирует F8/F9/F10/F11).
 * Вызывается из вкладки настроек Cookie Code.
 */
function setDebugMode(on) {
  debugMode = !!on;
  // Прячем/показываем уголок ресайза в зависимости от режима.
  // При включении — не показываем сразу, только при наведении на пета.
  if (resizeHandleEl && !debugMode) resizeHandleEl.style.opacity = "0";
  if (!debugMode) {
    // Выключаем прицел и debug-рамку при выходе из debug-режима
    if (aiming) toggleAim();
    if (debugOn) {
      debugOn = false;
      schedule();
    }
  }
  console.log("[Cookie Code] Pet debug mode:", debugMode ? "ON" : "OFF");
  return debugMode;
}

/**
 * Перечитать настройки пета из settings.json (для вызова из настроек после
 * изменения petId / petDebugMode / petSize и т.д.).
 */
async function reloadSettings() {
  await loadPetSettings();
  dataUriCache = null;
  applySize();
  schedule();
}

/**
 * Сбросить все настройки пета (кроме petDebugMode) к дефолтам
 * и записать их в settings.json. После — пересадить пета.
 * Вызывается кнопкой «Сбросить» в настройках Cookie Code.
 */
async function resetAllPetSettings() {
  const patch = { ...PET_RESET_DEFAULTS };
  // Записываем в settings.json
  try {
    const api = window.electronAPI;
    if (api && typeof api.setCuckooSetting === "function") {
      for (const [k, v] of Object.entries(patch)) {
        try {
          await api.setCuckooSetting(k, v);
        } catch (_) {}
      }
    }
  } catch (_) {}

  // Применяем локально
  mode = patch.petMode;
  dockOffsetXRatio = patch.petRatioX;
  dockOffsetYRatio = patch.petRatioY;
  petSize = patch.petSize;
  currentPetId = patch.petId;
  dataUriCache = null;
  centerPos = null; // сбросить и «центр», если был в ручном режиме

  applySize();
  schedule();

  console.log(
    "[Cookie Code] Настройки пета сброшены к дефолтам:",
    JSON.stringify(patch),
  );
  return patch;
}

function start() {
  if (started) return;
  started = true;

  // Сначала подтягиваем сохранённые настройки (mode / ratioX / ratioY / size / id),
  // потом показываем пета — чтобы он сразу оказался на своём месте.
  loadPetSettings().finally(() => {
    const tryInit = () => {
      if (!document.body) {
        setTimeout(tryInit, 200);
        return;
      }
      ensureElements();
      applySize();
      // Спавн по центру как fallback, если поле ввода недоступно
      if (!centerPos) {
        centerPos = {
          x: Math.round((window.innerWidth - petSize) / 2),
          y: Math.round((window.innerHeight - petSize) / 2),
        };
      }
      reposition();
    };
    tryInit();
  });

  window.addEventListener("scroll", schedule, { passive: true, capture: true });
  window.addEventListener(
    "resize",
    () => {
      // при ресайзе — если позиция не задана вручную, пересчитаем «центр»
      if (mode === "center" && !dragging && centerPos) {
        // не двигаем — пусть пользователь сам решит; но если вышли за границы — вернём
        const vw = window.innerWidth,
          vh = window.innerHeight;
        if (
          centerPos.x > vw - 20 ||
          centerPos.y > vh - 20 ||
          centerPos.x < -petSize + 20 ||
          centerPos.y < -petSize + 20
        ) {
          centerPos = {
            x: Math.round((vw - petSize) / 2),
            y: Math.round((vh - petSize) / 2),
          };
        }
      }
      schedule();
    },
    { passive: true },
  );

  const mo = new MutationObserver(schedule);
  try {
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
  setInterval(schedule, 300);

  window.addEventListener(
    "keydown",
    (e) => {
      // Escape всегда работает — выйти из прицела можно даже с выключенным debug
      if (e.key === "Escape" && aiming) {
        e.preventDefault();
        toggleAim();
        return;
      }
      // Остальные клавиши — только в debug-режиме
      if (!debugMode) return;
      if (e.key === "F8") {
        e.preventDefault();
        toggleAim();
      } else if (e.key === "F9") {
        e.preventDefault();
        toggleDebug();
      } else if (e.key === "F10") {
        e.preventDefault();
        toggleMode();
      } else if (e.key === "F11") {
        e.preventDefault();
        resetSize();
      }
    },
    true,
  );

  // ВАЖНО: чтобы точно увидеть пета даже если body ещё перезаписывается
  console.log(
    "[Cookie Code] Pet started. pets dir =",
    PETS_DIR || "(unknown)",
    "| F8=aim, F9=debug frame, F10=mode, F11=reset size, drag=move",
  );
}

module.exports = {
  start,
  schedule,
  toggleDebug,
  toggleMode,
  toggleAim,
  setPetId,
  resetSize,
  resetAllPetSettings,
  setDebugMode,
  reloadSettings,
  loadPetSettings,
  savePetSettings,
  PET_RESET_DEFAULTS,
};
