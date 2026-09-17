/**
 * Управление фоновым изображением страницы DeepSeek.
 *
 * Картинки читаются из src/ui/backgrounds/ напрямую в preload через fs и
 * кодируются в base64 data-URI. Это единственный надёжный способ: файловая
 * схема file:// заблокирована Chromium со страницы chat.deepseek.com, а
 * кастомная cuckoo-asset:// не проходит через fetch API даже с bypassCSP.
 */
const fs = require("fs");
const path = require("path");

// Директория с фонами (относительно preload): <projectRoot>/src/ui/backgrounds
const BACKGROUNDS_DIR = path.join(__dirname, "..", "..", "ui", "backgrounds");

/**
 * Список встроенных фонов — синхронизирован с src/ui/backgrounds/registry.json.
 * id = имя файла без расширения.
 */
const BUILTIN_BACKGROUNDS = [
  { id: "miku", label: "Мику", file: "miku.webp" },
  { id: "miku-light", label: "Мику (светлая)", file: "miku-light.jpg" },
  { id: "abyssal-dark", label: "Бездна (тёмная)", file: "abyssal-dark.webp" },
  {
    id: "abyssal-light",
    label: "Бездна (светлая)",
    file: "abyssal-light.webp",
  },
  { id: "bee-eater", label: "Синещёкая щурка", file: "bee-eater.jpg" },
  { id: "blue-fantasy", label: "Синяя фантазия", file: "blue-fantasy.jpg" },
  { id: "cyber-night", label: "Кибер-ночь", file: "cyber-night.webp" },
  {
    id: "dragon-heir-dark",
    label: "Наследник дракона (тёмный)",
    file: "dragon-heir-dark.webp",
  },
  {
    id: "dragon-heir-light",
    label: "Наследник дракона (светлый)",
    file: "dragon-heir-light.webp",
  },
  { id: "furina", label: "Фурина", file: "furina.jpg" },
  { id: "harbor", label: "Гавань", file: "harbor.webp" },
  {
    id: "hologram-dark",
    label: "Голограмма (тёмная)",
    file: "hologram-dark.webp",
  },
  {
    id: "hologram-light",
    label: "Голограмма (светлая)",
    file: "hologram-light.webp",
  },
  { id: "maid-day", label: "Горничная — день", file: "maid-day.webp" },
  { id: "maid-night", label: "Горничная — ночь", file: "maid-night.webp" },
  { id: "phoebe-dark", label: "Фиби (тёмная)", file: "phoebe-dark.webp" },
  { id: "phoebe-light", label: "Фиби (светлая)", file: "phoebe-light.webp" },
  {
    id: "starry-dark",
    label: "Звёздная ночь (тёмная)",
    file: "starry-dark.webp",
  },
  {
    id: "starry-light",
    label: "Звёздная ночь (светлая)",
    file: "starry-light.webp",
  },
  {
    id: "stellar-dark",
    label: "Звёздная дива (тёмная)",
    file: "stellar-dark.webp",
  },
  {
    id: "stellar-light",
    label: "Звёздная дива (светлая)",
    file: "stellar-light.webp",
  },
  { id: "summer", label: "Летнее стекло", file: "summer.jpg" },
  { id: "tokyo-night", label: "Токио ночью", file: "tokyo-night.webp" },
  {
    id: "war-thunder-dark",
    label: "War Thunder (тёмный)",
    file: "war-thunder-dark.webp",
  },
  {
    id: "war-thunder-light",
    label: "War Thunder (светлый)",
    file: "war-thunder-light.webp",
  },
  { id: "whale-mom", label: "Мама-кит", file: "whale-mom.jpg" },
  { id: "whale-song", label: "Песнь кита", file: "whale-song.webp" },
];

const DEFAULT_ID = "miku";

// Пользовательские фоны из <userData>/backgrounds (заполняется асинхронно
// через window.electronAPI.listCustomBackgrounds()).
// Каждый элемент: { id: 'custom:<base>', label, file: <абсолютный путь>, custom: true }
let customBackgrounds = [];
// Абсолютный путь к папке с пользовательскими фонами (для UI).
let customBackgroundsDir = "";

// Кэш data-URI: file → data:image/...;base64,...
const dataUriCache = new Map();

/**
 * Полный список фонов: встроенные + пользовательские.
 * id пользовательских — 'custom:<имя-файла-без-расширения>'.
 */
function getAllBackgrounds() {
  return BUILTIN_BACKGROUNDS.concat(customBackgrounds);
}

/**
 * Найти запись фона по id во всём списке (встроенные + пользовательские).
 */
function findBackground(id) {
  return getAllBackgrounds().find((b) => b.id === id) || null;
}

/**
 * Загрузить список пользовательских фонов из main-процесса.
 * Вызывается при старте и при открытии вкладки настроек.
 */
async function loadCustomBackgrounds() {
  try {
    const res = await window.electronAPI.listCustomBackgrounds();
    if (res && res.success) {
      customBackgrounds = res.backgrounds || [];
      customBackgroundsDir = res.dir || "";
    } else {
      customBackgrounds = [];
    }
  } catch (err) {
    console.error(
      "[Cookie Code] Не удалось загрузить пользовательские фоны:",
      err.message,
    );
    customBackgrounds = [];
  }
  return customBackgrounds;
}

/**
 * Прочитать файл фона и вернуть data-URI (с кэшированием).
 * file — либо имя файла во встроенной папке, либо абсолютный путь (кастомный фон).
 */
function getDataUri(file) {
  if (dataUriCache.has(file)) return dataUriCache.get(file);
  try {
    const fullPath = path.isAbsolute(file)
      ? file
      : path.join(BACKGROUNDS_DIR, file);
    const buf = fs.readFileSync(fullPath);
    const ext = path.extname(file).toLowerCase();
    const mime =
      {
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
      }[ext] || "application/octet-stream";
    const uri = "data:" + mime + ";base64," + buf.toString("base64");
    dataUriCache.set(file, uri);
    return uri;
  } catch (err) {
    console.error("[Cookie Code] Не удалось прочитать фон:", file, err.message);
    return "";
  }
}

/**
 * Применить фон по id (ключ из BACKGROUNDS).
 * Пустая строка / 'none' / null → очистить (только базовый цвет).
 */
function apply(id) {
  const entry = findBackground(id);
  const uri = entry ? getDataUri(entry.file) : "";
  const value = uri ? 'url("' + uri + '")' : "none";
  try {
    document.documentElement.style.setProperty(
      "background-image",
      value,
      "important",
    );
    document.body.style.setProperty("background-image", value, "important");
    // Дублируем URL в переменную — её читает reasoning-glass.js и CSS-шаблон.
    document.documentElement.style.setProperty(
      "--cuckoo-bg-image",
      uri ? value : "none",
      "important",
    );
    console.log(
      "[Cookie Code] Фон применён:",
      id,
      "(" + (uri ? Math.round(uri.length / 1024) + " КБ" : "нет") + ")",
    );
  } catch (err) {
    console.error("[Cookie Code] Не удалось применить фон:", err.message);
  }
}

function hexToRgb(hex, defaultVal = { r: 17, g: 19, b: 34 }) {
  if (!hex || typeof hex !== "string") return defaultVal;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6) return defaultVal;
  const num = parseInt(h, 16);
  if (isNaN(num)) return defaultVal;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Применить настройки размытия, прозрачности и темы панели.
 * Числовые значения — px, прозрачность — % (0–100).
 */
function applyBlur(settings) {
  const root = document.documentElement;
  const bg = Number(settings && settings.backgroundBlur) || 0;
  const hd = Number(settings && settings.headerBlur);
  const sb = Number(settings && settings.sidebarBlur);
  const hdOp = Number(settings && settings.headerOpacity);
  const sbOp = Number(settings && settings.sidebarOpacity);

  const hdVal = isNaN(hd) ? 12 : hd;
  const sbVal = isNaN(sb) ? 12 : sb;
  const hdOpVal = isNaN(hdOp) ? 45 : hdOp;
  const sbOpVal = isNaN(sbOp) ? 45 : sbOp;
  const tbBlur = Number(settings && settings.toolBlockBlur);
  const tbOp = Number(settings && settings.toolBlockOpacity);
  const tbBlurVal = isNaN(tbBlur) ? 0 : tbBlur;
  const tbOpVal = isNaN(tbOp) ? 55 : tbOp;

  root.style.setProperty("--cuckoo-bg-blur", bg + "px");
  root.style.setProperty("--cuckoo-header-blur", hdVal + "px");
  root.style.setProperty("--cuckoo-sidebar-blur", sbVal + "px");
  root.style.setProperty("--cuckoo-header-opacity", hdOpVal + "%");
  root.style.setProperty("--cuckoo-sidebar-opacity", sbOpVal + "%");
  root.style.setProperty("--cuckoo-toolblock-opacity", tbOpVal + "%");
  root.style.setProperty("--cuckoo-toolblock-blur", tbBlurVal + "px");
  // ===== Стеклянное поле ввода сообщения =====
  const inBlur = Number(settings && settings.inputGlassBlur);
  const inBlurVal = isNaN(inBlur) ? 12 : inBlur;
  const inOp = Number(settings && settings.inputGlassOpacity);
  const inOpVal = isNaN(inOp) ? 55 : inOp;
  root.style.setProperty("--cuckoo-input-glass-blur", inBlurVal + "px");
  root.style.setProperty("--cuckoo-input-glass-opacity", inOpVal + "%");

  // Плашка «Размышление» использует свой blur (дефолт 12px, если настройка toolBlockBlur = 0).
  root.style.setProperty(
    "--cuckoo-reasoning-blur",
    (tbBlurVal > 0 ? tbBlurVal : 12) + "px",
  );
  // И свою (более лёгкую) плотность плёнки — тонкая плашка не должна выглядеть чёрной.
  root.style.setProperty(
    "--cuckoo-reasoning-opacity",
    Math.max(15, tbOpVal - 20) + "%",
  );

  // ===== Кастомизация панели Cookie Code =====
  const ovOpacity = Number(settings && settings.overlayOpacity);
  const ovOpacityVal = isNaN(ovOpacity) ? 72 : ovOpacity;
  const ovBlur = Number(settings && settings.overlayBlur);
  const ovBlurVal = isNaN(ovBlur) ? 12 : ovBlur;
  const ovWidth = Number(settings && settings.overlayWidth);
  const ovWidthVal = isNaN(ovWidth) ? 300 : ovWidth;
  const ovBgColor = (settings && settings.overlayBgColor) || "#111322";
  const ovRgb = hexToRgb(ovBgColor, { r: 17, g: 19, b: 34 });
  const ovAlpha = (ovOpacityVal / 100).toFixed(2);

  root.style.setProperty("--cuckoo-overlay-width", ovWidthVal + "px");
  root.style.setProperty("--cuckoo-overlay-blur", ovBlurVal + "px");
  root.style.setProperty(
    "--cuckoo-overlay-bg",
    `rgba(${ovRgb.r}, ${ovRgb.g}, ${ovRgb.b}, ${ovAlpha})`,
  );

  // Кнопки оверлея
  const ovPrimary = (settings && settings.overlayPrimaryColor) || "#8b93ff";
  const pRgb = hexToRgb(ovPrimary, { r: 139, g: 147, b: 255 });
  // Темнее оттенок для градиента
  const pDarkR = Math.max(0, Math.floor(pRgb.r * 0.8));
  const pDarkG = Math.max(0, Math.floor(pRgb.g * 0.8));
  const pDarkB = Math.max(0, Math.floor(pRgb.b * 0.8));
  const ovRadius = Number(settings && settings.overlayBtnRadius);
  const ovRadiusVal = isNaN(ovRadius) ? 10 : ovRadius;

  root.style.setProperty("--cuckoo-overlay-btn-radius", ovRadiusVal + "px");
  root.style.setProperty(
    "--cuckoo-overlay-primary-bg",
    `linear-gradient(135deg, rgb(${pRgb.r}, ${pRgb.g}, ${pRgb.b}), rgb(${pDarkR}, ${pDarkG}, ${pDarkB}))`,
  );
  root.style.setProperty(
    "--cuckoo-overlay-primary-shadow",
    `rgba(${pDarkR}, ${pDarkG}, ${pDarkB}, 0.25)`,
  );
  root.style.setProperty(
    "--cuckoo-overlay-primary-shadow-hover",
    `rgba(${pDarkR}, ${pDarkG}, ${pDarkB}, 0.45)`,
  );
  root.style.setProperty(
    "--cuckoo-overlay-secondary-bg",
    `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.12)`,
  );
  root.style.setProperty(
    "--cuckoo-overlay-secondary-text",
    `rgb(${Math.min(255, pRgb.r + 30)}, ${Math.min(255, pRgb.g + 30)}, 255)`,
  );
  root.style.setProperty(
    "--cuckoo-overlay-secondary-border",
    `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.5)`,
  );
  root.style.setProperty(
    "--cuckoo-overlay-secondary-hover-bg",
    `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.28)`,
  );
  root.style.setProperty(
    "--cuckoo-overlay-secondary-hover-border",
    `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.75)`,
  );

  console.log(
    "[Cookie Code] Стили: фон=" +
      bg +
      "px, шапка=" +
      hdVal +
      "px/" +
      hdOpVal +
      "%, сайдбар=" +
      sbVal +
      "px/" +
      sbOpVal +
      "%, tool=" +
      tbBlurVal +
      "px/" +
      tbOpVal +
      "%, оверлей=" +
      ovBlurVal +
      "px/" +
      ovOpacityVal +
      "%/" +
      ovWidthVal +
      "px",
  );
}

/**
 * Загрузить настройки из settings.json и применить фон + размытие.
 */
async function loadAndApply() {
  try {
    // Сначала подтягиваем пользовательские фоны, чтобы выбранный кастомный фон
    // нашёлся по id при применении.
    await loadCustomBackgrounds();
    const settings = await window.electronAPI.getCuckooSettings();
    const bgId = (settings && settings.background) || DEFAULT_ID;
    apply(bgId);
    applyBlur(settings);
    applyRgbUsername(settings ? settings.rgbUsername : true);
    applyInputGlassEnabled(
      Boolean(settings && settings.inputGlassEnabled === true),
    );
  } catch (err) {
    console.error("[Cookie Code] Не удалось загрузить настройки:", err.message);
    apply(DEFAULT_ID);
    applyBlur(null);
    applyRgbUsername(true);
    applyInputGlassEnabled(false);
  }
}

/**
 * Значения по умолчанию (синхронизированы с src/main/settings-store.js).
 */
const RESET_DEFAULTS = {
  background: DEFAULT_ID,
  backgroundBlur: 0,
  headerBlur: 12,
  sidebarBlur: 12,
  headerOpacity: 45,
  sidebarOpacity: 45,
  toolBlockOpacity: 55,
  toolBlockBlur: 0,
  rgbUsername: true,
  inputGlassEnabled: false,
  overlayOpacity: 72,
  overlayBlur: 12,
  overlayWidth: 300,
  overlayBgColor: "#111322",
  overlayPrimaryColor: "#8b93ff",
  overlayBtnRadius: 10,
  inputGlassBlur: 12,
  inputGlassOpacity: 55,
};

/**
 * Сбросить фон и все блюры к дефолтам (с сохранением в settings.json).
 */
async function resetAll() {
  apply(RESET_DEFAULTS.background);
  applyBlur(RESET_DEFAULTS);
  applyRgbUsername(RESET_DEFAULTS.rgbUsername);
  applyInputGlassEnabled(RESET_DEFAULTS.inputGlassEnabled);
  try {
    for (const key of Object.keys(RESET_DEFAULTS)) {
      await window.electronAPI.setCuckooSetting(key, RESET_DEFAULTS[key]);
    }
    console.log("[Cookie Code] Настройки сброшены к дефолтам");
  } catch (err) {
    console.error("[Cookie Code] Не удалось сохранить дефолты:", err.message);
  }
}

/**
 * Применить состояние кастомизации.
 * Если enabled=false — на <html> вешается класс cuckoo-customization-off,
 * который снимает базовый цвет фона и ::before-слой (см. template.js).
 */
function applyCustomizationEnabled(enabled) {
  try {
    if (enabled === false) {
      document.documentElement.classList.add("cuckoo-customization-off");
    } else {
      document.documentElement.classList.remove("cuckoo-customization-off");
    }
  } catch (err) {
    console.error(
      "[Cookie Code] Не удалось применить состояние кастомизации:",
      err.message,
    );
  }
}

/**
 * Применить состояние стекла поля ввода.
 * Если enabled=false — на <html> вешается класс cuckoo-input-glass-off,
 * который снимает CSS-стекло (см. template.js).
 */
function applyInputGlassEnabled(enabled) {
  try {
    if (enabled === false) {
      document.documentElement.classList.add("cuckoo-input-glass-off");
    } else {
      document.documentElement.classList.remove("cuckoo-input-glass-off");
    }
  } catch (err) {
    console.error(
      "[Cookie Code] Не удалось применить состояние стекла поля ввода:",
      err.message,
    );
  }
}

/**
 * Применить настройку RGB-переливания ника.
 * Если enabled=false — на <body> вешается класс cuckoo-rgb-off.
 */
function applyRgbUsername(enabled) {
  try {
    if (enabled === false || enabled === "false" || enabled === 0) {
      document.body.classList.add("cuckoo-rgb-off");
    } else {
      document.body.classList.remove("cuckoo-rgb-off");
    }
    console.log("[Cookie Code] RGB-ник:", enabled === false ? "выкл" : "вкл");
  } catch (err) {
    console.error("[Cookie Code] Не удалось применить RGB-ник:", err.message);
  }
}

/**
 * Получить data-URI для указанного файла (для рендера превью в настройках).
 */
function getPreviewUri(file) {
  return getDataUri(file);
}

/**
 * Очистить localStorage-хранилища Cookie Code:
 * - cuckoo-response-meta (мета ответов: время + токены)
 * - cuckoo-errors (сохранённые ошибки tool-блоков)
 */
function clearLocalStorage() {
  try {
    localStorage.removeItem("cuckoo-response-meta");
    localStorage.removeItem("cuckoo-errors");
    console.log("[Cookie Code] LocalStorage очищен (мета + ошибки)");
  } catch (err) {
    console.error("[Cookie Code] Ошибка очистки localStorage:", err.message);
  }
}

/**
 * Подписка на событие "настройки изменились" (из TG-бота или другого окна).
 * При изменении — перечитываем настройки и мгновенно применяем фон/блюр/эффекты.
 */
function installSettingsListener() {
  try {
    if (
      !window.electronAPI ||
      typeof window.electronAPI.onSettingsChanged !== "function"
    ) {
      return;
    }
    window.electronAPI.onSettingsChanged((patch) => {
      try {
        // Список ключей, влияющих на визуал. Если patch не передан — применяем всё.
        const VISUAL_KEYS = [
          "customizationEnabled",
          "background",
          "backgroundBlur",
          "headerBlur",
          "sidebarBlur",
          "headerOpacity",
          "sidebarOpacity",
          "toolBlockOpacity",
          "toolBlockBlur",
          "inputGlassEnabled",
          "inputGlassBlur",
          "inputGlassOpacity",
          "rgbUsername",
          "overlayOpacity",
          "overlayBlur",
          "overlayWidth",
          "overlayBgColor",
          "overlayPrimaryColor",
          "overlayBtnRadius",
        ];
        const relevant =
          !patch || Object.keys(patch).some((k) => VISUAL_KEYS.includes(k));
        if (!relevant) return;
        // Мгновенно применяем: loadAndApply читает settings.json целиком.
        loadAndApply().catch((err) => {
          console.error(
            "[Cookie Code] background: применениe из события не удалось:",
            err.message,
          );
        });
      } catch (err) {
        console.error(
          "[Cookie Code] onSettingsChanged(bg) error:",
          err.message,
        );
      }
    });
  } catch (_) {}
}

module.exports = {
  installSettingsListener,
  apply,
  applyBlur,
  applyRgbUsername,
  applyInputGlassEnabled,
  applyCustomizationEnabled,
  loadAndApply,
  getPreviewUri,
  resetAll,
  clearLocalStorage,
  RESET_DEFAULTS,
  // Список фонов: встроенные + пользовательские (динамически).
  getAllBackgrounds,
  findBackground,
  loadCustomBackgrounds,
  getCustomBackgroundsDir: () => customBackgroundsDir,
  BUILTIN_BACKGROUNDS,
  DEFAULT_ID,
  BACKGROUNDS_DIR,
};
