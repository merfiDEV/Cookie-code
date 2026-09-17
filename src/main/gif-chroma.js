/**
 * GIF chroma-key: делаем выбранный цвет прозрачным во ВСЕХ кадрах анимации.
 *
 * Использует:
 *   - gifuct-js (parseGIF/decompressFrames) — разбор GIF на кадры (RGBA)
 *   - самописный энкодер GIF89a — сборка обратно (без нативных зависимостей)
 *
 * Алгоритм:
 *   1. Разбираем GIF на кадры RGBA (все одного размера — canvas W×H).
 *   2. Для каждого кадра: пиксели, совпадающие с targetColor → alpha=0.
 *   3. Квантуем RGBA в палитру 256 цветов (median cut — упрощённый).
 *   4. Резервируем индекс 0 под прозрачность.
 *   5. Кодируем каждый кадр LZW и собираем GIF89a.
 *
 * Важно: результат — статичная или анимированная GIF с одним прозрачным цветом.
 * Полупрозрачность GIF не поддерживает (только 1-битная маска alpha).
 */
const fs = require("fs");

/**
 * Проверить, совпадает ли пиксель (r,g,b) с целевым цветом.
 * @param {number} r 0..255
 * @param {number} g 0..255
 * @param {number} b 0..255
 * @param {{r:number,g:number,b:number}} target
 * @param {number} tolerance 0..255 (0 = точное совпадение)
 */
function matches(r, g, b, target, tolerance) {
  const dr = Math.abs(r - target.r);
  const dg = Math.abs(g - target.g);
  const db = Math.abs(b - target.b);
  // Евклидово расстояние в RGB (быстро и достаточно)
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  return dist <= tolerance;
}

/**
 * Простой квантователь: строим палитру из уникальных цветов кадров.
 * Для пета (маленькая картинка) обычно < 256 уникальных цветов, поэтому
 * просто собираем их в map и если больше — жёстко квантуем по 5-битным уровням.
 *
 * Возвращает { palette: Uint8Array(768), colorMap: Map<number, number> }.
 * Индекс 0 всегда резервируется под прозрачность (RGBA 0,0,0,0).
 */
function buildPalette(frames) {
  const colorToIndex = new Map();
  const palette = new Uint8Array(768); // 256*3
  // Индекс 0 — прозрачный (0,0,0)
  palette[0] = 0;
  palette[1] = 0;
  palette[2] = 0;
  let next = 1; // начнём с 1, 0 уже занят прозрачным

  const keyOf = (r, g, b) => (r << 16) | (g << 8) | b;

  for (const frame of frames) {
    const d = frame.pixels;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 128) continue; // прозрачные пропускаем — они пойдут в индекс 0
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const key = keyOf(r, g, b);
      if (colorToIndex.has(key)) continue;
      if (next >= 256) {
        // Палитра переполнена — квантуем к 5-битным уровням
        const rq = r & 0xf8;
        const gq = g & 0xf8;
        const bq = b & 0xf8;
        const qkey = keyOf(rq, gq, bq);
        if (!colorToIndex.has(qkey)) {
          if (next >= 256) continue; // и так забито — используем ближайший? упрощённо пропускаем
          colorToIndex.set(qkey, next);
          palette[next * 3] = rq;
          palette[next * 3 + 1] = gq;
          palette[next * 3 + 2] = bq;
          next++;
        }
        colorToIndex.set(key, colorToIndex.get(qkey));
        continue;
      }
      colorToIndex.set(key, next);
      palette[next * 3] = r;
      palette[next * 3 + 1] = g;
      palette[next * 3 + 2] = b;
      next++;
    }
  }
  return { palette, colorToIndex };
}

/**
 * Найти ближайший индекс в палитре для цвета (fallback при переполнении).
 */
function nearestIndex(palette, count, r, g, b) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const pr = palette[i * 3];
    const pg = palette[i * 3 + 1];
    const pb = palette[i * 3 + 2];
    const dr = pr - r;
    const dg = pg - g;
    const db = pb - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Закодировать последовательность индексов в LZW (GIF-вариант).
 * @param {Uint8Array} indices
 * @param {number} minCodeSize  обычно 8 (256 цветов)
 * @returns {Uint8Array} упакованные байты с sub-block-разбивкой
 */
function lzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;

  const dict = new Map();
  const resetDict = () => {
    dict.clear();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  const out = [];
  let bitBuf = 0;
  let bitCount = 0;
  const emit = (code) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuf & 0xff);
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  resetDict();
  emit(clearCode);

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    if (dict.has(key)) {
      prefix = dict.get(key);
    } else {
      emit(prefix);
      if (nextCode < 4096) {
        dict.set(key, nextCode++);
        if (nextCode - 1 === 1 << codeSize && codeSize < 12) {
          codeSize++;
        }
      } else {
        emit(clearCode);
        resetDict();
      }
      prefix = k;
    }
  }
  emit(prefix);
  emit(eoiCode);
  if (bitCount > 0) out.push(bitBuf & 0xff);

  // Разбиваем на sub-blocks по 255 байт
  const blocks = [];
  for (let i = 0; i < out.length; i += 255) {
    const chunk = out.slice(i, i + 255);
    blocks.push(chunk.length);
    blocks.push(...chunk);
  }
  blocks.push(0);
  return Uint8Array.from(blocks);
}

/**
 * Собрать GIF89a из кадров.
 * @param {Array<{indices: Uint8Array}>} frames
 * @param {Uint8Array} palette 768 байт
 * @param {number} width
 * @param {number} height
 * @param {number} delayMs задержка между кадрами (0 = без анимации)
 * @returns {Buffer}
 */
function encodeGif(frames, palette, width, height, delayMs) {
  const chunks = [];
  const push = (...bytes) => chunks.push(...bytes);
  const pushShort = (v) => push(v & 0xff, (v >> 8) & 0xff);

  // Header
  for (const ch of "GIF89a") push(ch.charCodeAt(0));

  // Logical Screen Descriptor
  pushShort(width);
  pushShort(height);
  // Global Color Table Flag = 1, Color Resolution = 7 (8 бит/канал), Sort = 0,
  // Size = 7 (256 цветов)
  push(0xf7);
  push(0); // background color index
  push(0); // pixel aspect ratio
  // Global Color Table (768 байт)
  for (let i = 0; i < 768; i++) push(palette[i]);

  // Netscape Application Extension (для цикла анимации)
  if (frames.length > 1) {
    push(0x21, 0xff, 0x0b);
    for (const ch of "NETSCAPE2.0") push(ch.charCodeAt(0));
    push(0x03, 0x01, 0x00, 0x00, 0x00);
  }

  const delayCs = Math.max(0, Math.round(delayMs / 10));

  for (const frame of frames) {
    // Graphic Control Extension (прозрачность + задержка)
    push(0x21, 0xf9, 0x04);
    // Disposal = 2 (restore to background), transparent flag = 1
    push(0x09); // 0b000_01_0_01 → disposal=2, userInput=0, transparent=1
    pushShort(delayCs);
    push(0x00); // transparent color index = 0
    push(0x00); // block terminator

    // Image Descriptor
    push(0x2c);
    pushShort(0);
    pushShort(0);
    pushShort(width);
    pushShort(height);
    push(0x00); // no local color table, not interlaced

    // LZW min code size = 8
    push(0x08);
    const lzw = lzwEncode(frame.indices, 8);
    for (const b of lzw) push(b);
  }

  // Trailer
  push(0x3b);
  return Buffer.from(chunks);
}

/**
 * Основная функция: сделать targetColor прозрачным во всех кадрах GIF.
 * @param {string} inputPath  путь к GIF
 * @param {{r:number,g:number,b:number}} targetColor  0..255
 * @param {number} [tolerance=16]  0..255
 * @returns {{ success: boolean, error?: string, outputPath?: string }}
 */
function chromaKeyGif(inputPath, targetColor, tolerance = 16) {
  try {
    const gifuct = require("gifuct-js");
    const buf = fs.readFileSync(inputPath);
    const gif = gifuct.parseGIF(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
    const frames = gifuct.decompressFrames(gif, true);

    if (!frames.length) {
      return { success: false, error: "GIF не содержит кадров" };
    }

    const width = gif.lsd.width;
    const height = gif.lsd.height;

    // Применяем chroma-key и собираем общий список кадров.
    // Для каждого кадра создаём полноразмерный RGBA-буфер и накладываем patch.
    const canvasFrames = [];
    const fullCanvas = new Uint8ClampedArray(width * height * 4);
    for (const frame of frames) {
      // frame.patch — RGBA размером dims.width × dims.height
      const dims = frame.dims;
      const patch = frame.patch;
      // Накладываем patch на полный canvas по координатам dims.left/top
      for (let y = 0; y < dims.height; y++) {
        for (let x = 0; x < dims.width; x++) {
          const srcIdx = (y * dims.width + x) * 4;
          const dstIdx = ((dims.top + y) * width + (dims.left + x)) * 4;
          fullCanvas[dstIdx] = patch[srcIdx];
          fullCanvas[dstIdx + 1] = patch[srcIdx + 1];
          fullCanvas[dstIdx + 2] = patch[srcIdx + 2];
          fullCanvas[dstIdx + 3] = patch[srcIdx + 3];
        }
      }
      // Копия кадра + chroma-key
      const copy = new Uint8ClampedArray(fullCanvas);
      for (let i = 0; i < copy.length; i += 4) {
        if (copy[i + 3] === 0) continue;
        const r = copy[i];
        const g = copy[i + 1];
        const b = copy[i + 2];
        if (matches(r, g, b, targetColor, tolerance)) {
          copy[i + 3] = 0; // прозрачный
        }
      }
      canvasFrames.push({ pixels: copy, delay: frame.delay || 100 });
    }

    // Собираем палитру
    const { palette, colorToIndex } = buildPalette(canvasFrames);
    let paletteCount = 1;
    for (let i = 1; i < 256; i++) {
      if (palette[i * 3] || palette[i * 3 + 1] || palette[i * 3 + 2])
        paletteCount = i + 1;
    }

    // Кодируем каждый кадр в индексы палитры
    const indexedFrames = [];
    for (const f of canvasFrames) {
      const d = f.pixels;
      const indices = new Uint8Array(width * height);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const a = d[i + 3];
        if (a < 128) {
          indices[p] = 0; // прозрачный
          continue;
        }
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const key = (r << 16) | (g << 8) | b;
        let idx = colorToIndex.get(key);
        if (idx == null) {
          idx = nearestIndex(palette, paletteCount, r, g, b);
        }
        indices[p] = idx;
      }
      indexedFrames.push({ indices });
    }

    // Кодируем GIF и перезаписываем файл
    const isAnimated = indexedFrames.length > 1;
    const firstDelay = canvasFrames[0].delay || 100;
    const outBuf = encodeGif(
      indexedFrames,
      palette,
      width,
      height,
      isAnimated ? firstDelay : 0,
    );
    fs.writeFileSync(inputPath, outBuf);
    return { success: true, outputPath: inputPath };
  } catch (err) {
    console.error("[Cookie Code] chromaKeyGif error:", err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { chromaKeyGif };
