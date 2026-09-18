/**
 * Управление шрифтом интерфейса Cookie Code и страницы DeepSeek.
 *
 * Шрифты читаются из src/ui/fonts/ (встроенные) и <userData>/fonts (пользовательские)
 * напрямую в preload через fs и кодируются в base64 data-URI. Это единственный
 * надёжный способ: file:// заблокирован Chromium со страницы chat.deepseek.com,
 * а кастомный cuckoo-asset:// не проходит через fetch API даже с bypassCSP.
 *
 * Инжектится один <style id="cuckoo-font-style"> с @font-face (normal + italic,
 * если есть) и правилами font-family с !important — для элементов Cookie Code
 * и для всей страницы DeepSeek. Иконочные/эмодзи-шрифты исключаются, чтобы
 * не ломать глифы.
 */
const fs = require("fs");
const path = require("path");

// Директория со встроенными шрифтами: <projectRoot>/src/ui/fonts
const FONTS_DIR = path.join(__dirname, "..", "..", "ui", "fonts");

/**
 * Встроенные шрифты. id = "system" (системный) или имя записи.
 * Файлы ищутся в FONTS_DIR.
 */
const BUILTIN_FONTS = [
  { id: "system", label: "Системный", file: "", system: true },
  {
    id: "anthropic-mono",
    label: "Anthropic Mono",
    file: ["Anthropic Mono Web.otf", "Anthropic Mono Web Regular Italic.otf"],
    family: "Anthropic Mono",
  },
  {
    id: "ndot-47",
    label: "Ndot 47",
    file: "ndot-47-inspired-by-nothing.otf",
    family: "Ndot 47",
  },
];

const DEFAULT_ID = "system";

// Жирность по умолчанию (обычное начертание).
const DEFAULT_WEIGHT = 400;

// Текущий выбранный шрифт, жирность и цвет (для повторного применения).
let currentFontId = DEFAULT_ID;
let currentWeight = DEFAULT_WEIGHT;
// Кастомный цвет текста ("#rrggbb"). "" — системный (правило не применяется).
let currentColor = "";

// Стиль инъекции (id <style>).
const STYLE_ID = "cuckoo-font-style";

// Пользовательские шрифты из <userData>/fonts (заполняется асинхронно
// через window.electronAPI.listCustomFonts()).
// Каждый элемент: { id: 'custom:<base>', label, file: <абсолютный путь>, custom: true }
let customFonts = [];
let customFontsDir = "";

// Кэш data-URI: file → data:font/...;base64,...
const dataUriCache = new Map();
// Кэш @font-face CSS: id → css
const fontFaceCache = new Map();

// Шрифты иконок/эмодзи, которые НЕ нужно перекрывать на странице сайта.
const ICON_FONT_KEYWORDS = [
  "iconfont",
  "fontawesome",
  "material icons",
  "material symbols",
  "Segoe MDL2",
  "Segoe Fluent Icons",
  "Apple Color Emoji",
  "Segoe UI Emoji",
  "Noto Color Emoji",
];

/**
 * Полный список шрифтов: встроенные + пользовательские.
 */
function getAllFonts() {
  return BUILTIN_FONTS.concat(customFonts);
}

/**
 * Найти запись шрифта по id.
 */
function findFont(id) {
  return getAllFonts().find((f) => f.id === id) || null;
}

/**
 * Загрузить список пользовательских шрифтов из main-процесса.
 */
async function loadCustomFonts() {
  try {
    const res = await window.electronAPI.listCustomFonts();
    if (res && res.success) {
      customFonts = res.fonts || [];
      customFontsDir = res.dir || "";
    } else {
      customFonts = [];
    }
  } catch (err) {
    console.error(
      "[Cookie Code] Не удалось загрузить пользовательские шрифты:",
      err.message,
    );
    customFonts = [];
  }
  return customFonts;
}

/**
 * Прочитать файл шрифта и вернуть data-URI (с кэшированием).
 * file — имя файла во встроенной папке или абсолютный путь (кастомный).
 */
function getFontDataUri(file) {
  if (dataUriCache.has(file)) return dataUriCache.get(file);
  try {
    const fullPath = path.isAbsolute(file) ? file : path.join(FONTS_DIR, file);
    const buf = fs.readFileSync(fullPath);
    const ext = path.extname(file).toLowerCase();
    const mime =
      {
        ".ttf": "font/ttf",
        ".otf": "font/otf",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
      }[ext] || "font/ttf";
    const fmt =
      {
        ".ttf": "truetype",
        ".otf": "opentype",
        ".woff": "woff",
        ".woff2": "woff2",
      }[ext] || "truetype";
    const uri = "data:" + mime + ";base64," + buf.toString("base64");
    const entry = { uri, fmt };
    dataUriCache.set(file, entry);
    return entry;
  } catch (err) {
    console.error(
      "[Cookie Code] Не удалось прочитать шрифт:",
      file,
      err.message,
    );
    return null;
  }
}

/**
 * Построить @font-face CSS для записи шрифта.
 * У записи может быть один файл (строка) или несколько (массив: normal, italic).
 */
function buildFontFaceCss(entry) {
  if (fontFaceCache.has(entry.id)) return fontFaceCache.get(entry.id);
  if (entry.system || !entry.file) {
    fontFaceCache.set(entry.id, "");
    return "";
  }
  const files = Array.isArray(entry.file) ? entry.file : [entry.file];
  const styles = files.length > 1 ? ["normal", "italic"] : ["normal"];
  const family = entry.family || entry.label || entry.id;
  const faces = [];
  files.forEach((file, i) => {
    const data = getFontDataUri(file);
    if (!data) return;
    faces.push(
      "@font-face {\n" +
        '  font-family: "' +
        family +
        '";\n' +
        '  src: url("' +
        data.uri +
        '") format("' +
        data.fmt +
        '");\n' +
        "  font-weight: 100 900;\n" +
        "  font-style: " +
        (styles[i] || "normal") +
        ";\n" +
        "  font-display: swap;\n" +
        "}",
    );
  });
  const css = faces.join("\n");
  fontFaceCache.set(entry.id, css);
  return css;
}

/**
 * Селекторы элементов Cookie Code.
 */
function cookieSelectors() {
  return [
    "#cuckoo-root",
    "#cuckoo-root *",
    "[class*='cuckoo-']",
    "[class*='cuckoo-'] *",
    "[id*='cuckoo-']",
    "[id*='cuckoo-'] *",
    "#cuckoo-overlay",
    "#cuckoo-overlay *",
    "#cuckoo-toast",
    "#cuckoo-confirm-dialog",
    "#cuckoo-confirm-dialog *",
    "#cuckoo-custom-banner-dialog",
    "#cuckoo-custom-banner-dialog *",
    ".cuckoo-todo-panel",
    ".cuckoo-todo-panel *",
    ".cuckoo-diff-panel",
    ".cuckoo-diff-panel *",
    ".cuckoo-file-chip",
  ];
}

/**
 * Нормализовать жирность шрифта (100–900, кратно 100).
 */
function normalizeWeight(w) {
  const n = Number(w);
  if (!n || isNaN(n)) return DEFAULT_WEIGHT;
  return Math.max(100, Math.min(900, Math.round(n / 100) * 100));
}

/**
 * Нормализовать HEX-цвет. Возвращает "#rrggbb" или "" (системный).
 * Принимает "#rgb", "#rrggbb" (регистр любой).
 */
function normalizeColor(c) {
  if (c == null) return "";
  const s = String(c).trim();
  if (!s) return "";
  let hex = s.startsWith("#") ? s.slice(1) : s;
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "";
  return "#" + hex.toLowerCase();
}

/**
 * Полный селектор правила для страницы DeepSeek (с исключением иконок).
 */
function pageSelector() {
  const nots = ICON_FONT_KEYWORDS.map(
    (k) => ":not([class*='" + k + "' i])",
  ).join("");
  return (
    "html, body, body *" +
    nots +
    ", [class*='ds-markdown'], [class*='ds-markdown'] *" +
    nots
  );
}

/**
 * Селекторы элементов Cookie Code для правила цвета.
 * Панель оверлея (#cuckoo-overlay) и её содержимое исключены —
 * у оверлея собственная цветовая схема (overlayBgColor/overlayPrimaryColor).
 */
function cookieColorSelectors() {
  const ex = ":not(#cuckoo-overlay):not(#cuckoo-overlay *)";
  return [
    "#cuckoo-root" + ex,
    "#cuckoo-root *" + ex,
    "[class*='cuckoo-']" + ex,
    "[class*='cuckoo-'] *" + ex,
    "[id*='cuckoo-']" + ex,
    "[id*='cuckoo-'] *" + ex,
    "#cuckoo-toast" + ex,
    "#cuckoo-confirm-dialog" + ex,
    "#cuckoo-confirm-dialog *" + ex,
    "#cuckoo-custom-banner-dialog" + ex,
    "#cuckoo-custom-banner-dialog *" + ex,
    ".cuckoo-todo-panel" + ex,
    ".cuckoo-todo-panel *" + ex,
    ".cuckoo-diff-panel" + ex,
    ".cuckoo-diff-panel *" + ex,
    ".cuckoo-file-chip" + ex,
  ];
}

/**
 * Селектор страницы DeepSeek для правила цвета.
 * Исключает все элементы Cookie Code (в т.ч. панель оверлея).
 */
function pageColorSelector() {
  const notIcons = ICON_FONT_KEYWORDS.map(
    (k) => ":not([class*='" + k + "' i])",
  ).join("");
  const notCuckoo =
    ":not(#cuckoo-root):not(#cuckoo-root *):not([id*='cuckoo-'])" +
    ":not([class*='cuckoo-']):not(#cuckoo-overlay):not(#cuckoo-overlay *)";
  const n = notIcons + notCuckoo;
  return (
    "html" +
    notIcons +
    ", body" +
    notIcons +
    ", body *" +
    n +
    ", [class*='ds-markdown']" +
    n +
    ", [class*='ds-markdown'] *" +
    n
  );
}

/**
 * Собрать полный CSS: @font-face (если кастомный) + правила font-family
 * и font-weight с !important — для элементов Cookie Code и всей страницы.
 * Жирность применяется ВСЕГДА, в том числе для системного шрифта.
 */
function buildFontCss(entry, weight, color) {
  const w = normalizeWeight(weight);
  const c = normalizeColor(color);
  const parts = [];

  // @font-face + font-family — только для кастомного шрифта.
  if (entry && !entry.system) {
    const face = buildFontFaceCss(entry);
    if (face) {
      const family = entry.family || entry.label || entry.id;
      const uiFamily = '"' + family + '", "Consolas", monospace';
      const pageFamily =
        '"' + family + '", ui-monospace, "Consolas", monospace';
      parts.push(face);
      parts.push(
        "/* Cookie Code UI */\n" +
          cookieSelectors().join(",\n") +
          " { font-family: " +
          uiFamily +
          " !important; }",
      );
      parts.push(
        "/* DeepSeek page */\n" +
          pageSelector() +
          " { font-family: " +
          pageFamily +
          " !important; }",
      );
    }
  }

  // Жирность — всегда, независимо от шрифта.
  parts.push(
    "/* Cookie Code UI weight */\n" +
      cookieSelectors().join(",\n") +
      " { font-weight: " +
      w +
      " !important; }",
  );
  parts.push(
    "/* DeepSeek page weight */\n" +
      pageSelector() +
      " { font-weight: " +
      w +
      " !important; }",
  );

  // Кастомный цвет текста — только если задан.
  // Панель оверлея (#cuckoo-overlay) исключена из правил цвета.
  if (c) {
    parts.push(
      "/* Cookie Code UI color */\n" +
        cookieColorSelectors().join(",\n") +
        " { color: " +
        c +
        " !important; }",
    );
    parts.push(
      "/* DeepSeek page color */\n" +
        pageColorSelector() +
        " { color: " +
        c +
        " !important; }",
    );
  }

  return parts.join("\n\n");
}

/**
 * Удалить инъекцию шрифта (вернуть системный вид).
 */
function clearFontStyle() {
  try {
    const el = document.getElementById(STYLE_ID);
    if (el) el.remove();
  } catch (_) {}
}

/**
 * Применить шрифт по id и жирность.
 * 'system' / '' / null → системный шрифт (только жирность, если задана).
 * @param {string} id
 * @param {number} [weight]  если не задан — используется текущая жирность
 */
function apply(id, weight, color) {
  try {
    const fontId = id || DEFAULT_ID;
    if (weight !== undefined) currentWeight = normalizeWeight(weight);
    if (color !== undefined) currentColor = normalizeColor(color);
    currentFontId = fontId;
    const entry = findFont(fontId);
    const css = buildFontCss(entry, currentWeight, currentColor);
    clearFontStyle();
    if (!css) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    console.log(
      "[Cookie Code] Шрифт применён:",
      entry && !entry.system ? fontId : "системный",
      "жирность:",
      currentWeight,
      "цвет:",
      currentColor || "системный",
    );
  } catch (err) {
    console.error("[Cookie Code] Не удалось применить шрифт:", err.message);
  }
}

/**
 * Применить только жирность (без смены шрифта).
 * @param {number} weight
 */
function applyWeight(weight) {
  apply(currentFontId, weight);
}

/**
 * Применить только цвет текста (без смены шрифта/жирности).
 * Пустое/невалидное значение → системный цвет.
 * @param {string} color  "#rrggbb" или ""
 */
function applyColor(color) {
  apply(currentFontId, currentWeight, color);
}

/**
 * Загрузить настройки и применить шрифт.
 */
async function loadAndApply() {
  try {
    await loadCustomFonts();
    const settings = await window.electronAPI.getCuckooSettings();
    const fontId = (settings && settings.font) || DEFAULT_ID;
    const weight =
      settings && settings.fontWeight != null
        ? settings.fontWeight
        : DEFAULT_WEIGHT;
    const color = (settings && settings.fontColor) || "";
    apply(fontId, weight, color);
  } catch (err) {
    console.error("[Cookie Code] Не удалось загрузить шрифт:", err.message);
    apply(DEFAULT_ID, DEFAULT_WEIGHT);
  }
}

/**
 * Подписка на изменение настроек (из TG-бота / других окон).
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
        if (
          patch &&
          !Object.prototype.hasOwnProperty.call(patch, "font") &&
          !Object.prototype.hasOwnProperty.call(patch, "fontWeight") &&
          !Object.prototype.hasOwnProperty.call(patch, "fontColor")
        )
          return;
        loadAndApply().catch((err) => {
          console.error(
            "[Cookie Code] fonts: применение из события не удалось:",
            err.message,
          );
        });
      } catch (err) {
        console.error(
          "[Cookie Code] onSettingsChanged(fonts) error:",
          err.message,
        );
      }
    });
  } catch (_) {}
}

/**
 * Получить data-URI для превью шрифта в настройках (не используется для картинок).
 */
function invalidatePreviewCache(file) {
  try {
    if (file) {
      dataUriCache.delete(file);
      fontFaceCache.clear();
    } else {
      dataUriCache.clear();
      fontFaceCache.clear();
    }
  } catch (_) {}
}

module.exports = {
  apply,
  applyWeight,
  applyColor,
  normalizeColor,
  loadAndApply,
  installSettingsListener,
  getAllFonts,
  findFont,
  loadCustomFonts,
  getCustomFontsDir: () => customFontsDir,
  invalidatePreviewCache,
  BUILTIN_FONTS,
  DEFAULT_ID,
  DEFAULT_WEIGHT,
  FONTS_DIR,
};
