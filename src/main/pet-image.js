/**
 * Нормализация спрайтов пета: ресайз до PET_MAX_W × PET_MAX_H (вписывание
 * пропорционально) и пересохранение PNG. Используется встроенный nativeImage
 * из Electron — никаких внешних зависимостей.
 *
 * Вызывается:
 *   1) при старте приложения — для всех файлов в <userData>/pets;
 *   2) при импорте файла через диалог в настройках.
 */
const fs = require("fs");
const path = require("path");
const { nativeImage } = require("electron");

const PET_MAX_W = 600;
const PET_MAX_H = 600;

/**
 * Вписать (width, height) в рамку maxW × maxH пропорционально.
 * Если обе стороны уже в лимите — вернёт те же значения.
 * @returns {{ w: number, h: number, changed: boolean }}
 */
function fitWithin(width, height, maxW, maxH) {
  if (width <= maxW && height <= maxH) {
    return { w: width, h: height, changed: false };
  }
  const ratio = Math.min(maxW / width, maxH / height);
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  return { w, h, changed: true };
}

/**
 * Сжать файл-картинку до лимитов и перезаписать на месте (PNG).
 * Если файл уже в лимите — не трогаем.
 *
 * @param {string} filePath  абсолютный путь к PNG/GIF/WebP/JPG
 * @returns {{ success: boolean, changed: boolean, before?: {w:number,h:number,size:number}, after?: {w:number,h:number,size:number}, error?: string }}
 */
function normalizePetFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: "Файл не найден: " + filePath };
    }
    const ext = path.extname(filePath).toLowerCase();

    // GIF не трогаем — у него анимация, nativeImage её не сохранит.
    if (ext === ".gif") {
      return { success: true, changed: false };
    }

    const beforeStat = fs.statSync(filePath);
    const img = nativeImage.createFromPath(filePath);
    if (img.isEmpty()) {
      return { success: false, error: "Не удалось прочитать картинку" };
    }
    const size = img.getSize(); // { width, height }
    const fit = fitWithin(size.width, size.height, PET_MAX_W, PET_MAX_H);
    if (!fit.changed) {
      return {
        success: true,
        changed: false,
        before: { w: size.width, h: size.height, size: beforeStat.size },
      };
    }

    const resized = img.resize({
      width: fit.w,
      height: fit.h,
      quality: "good",
    });
    const buf = resized.toPNG();
    fs.writeFileSync(filePath, buf);

    const afterStat = fs.statSync(filePath);
    console.log(
      "[Cookie Code] Pet сжат:",
      path.basename(filePath),
      size.width + "x" + size.height + " → " + fit.w + "x" + fit.h,
      "(" +
        Math.round(beforeStat.size / 1024) +
        "КБ → " +
        Math.round(afterStat.size / 1024) +
        "КБ)",
    );
    return {
      success: true,
      changed: true,
      before: { w: size.width, h: size.height, size: beforeStat.size },
      after: { w: fit.w, h: fit.h, size: afterStat.size },
    };
  } catch (err) {
    console.error("[Cookie Code] normalizePetFile error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Пройтись по папке и нормализовать все картинки-спрайты.
 * @param {string} petsDir  абсолютный путь к <userData>/pets
 * @returns {{ total: number, changed: number, errors: number }}
 */
function normalizePetsDir(petsDir) {
  const result = { total: 0, changed: 0, errors: 0 };
  try {
    if (!fs.existsSync(petsDir)) return result;
    const EXTS = [".png", ".webp", ".jpg", ".jpeg", ".gif"];
    const files = fs
      .readdirSync(petsDir)
      .filter((f) => EXTS.includes(path.extname(f).toLowerCase()));
    for (const f of files) {
      result.total++;
      const r = normalizePetFile(path.join(petsDir, f));
      if (!r.success) result.errors++;
      else if (r.changed) result.changed++;
    }
    if (result.changed > 0 || result.errors > 0) {
      console.log(
        "[Cookie Code] Pets нормализованы: всего=" + result.total,
        "сжато=" + result.changed,
        "ошибок=" + result.errors,
      );
    }
  } catch (err) {
    console.error("[Cookie Code] normalizePetsDir error:", err.message);
  }
  return result;
}

module.exports = {
  PET_MAX_W,
  PET_MAX_H,
  normalizePetFile,
  normalizePetsDir,
  fitWithin,
};
