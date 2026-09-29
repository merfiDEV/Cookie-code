/**
 * botsrc/whisper.js
 * Локальное распознавание речи через whisper.cpp (whisper-cli.exe).
 *
 * Возможности:
 *  - ensureBinary(onProgress)  — проверить/скачать whisper-cli.exe (+ DLL)
 *  - ensureModel(size, onProgress) — проверить/скачать GGML-модель
 *  - getStatus()               — что установлено (exe, модели, размеры)
 *  - transcribe(oggPath, opts) — ffmpeg OGG→WAV 16k mono → whisper-cli → текст
 *  - downloadBinary()/downloadModel(size) — принудительная загрузка
 *
 * Хранение: <userData>/whisper/  (exe + dll) и <userData>/whisper/models/.
 * ffmpeg ищется в PATH (можно переопределить в настройках).
 * Без внешних npm-зависимостей — только global fetch (Node 18+/Electron).
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execFile } = require("child_process");

// ==================== Константы ====================

// Ночная сборка whisper.cpp для Windows x64. Внутри zip — whisper-cli.exe + DLL.
const WHISPER_TAG = "b5130";
const WHISPER_ZIP_URL =
  "https://github.com/ggml-org/whisper.cpp/releases/download/" +
  WHISPER_TAG +
  "/whisper-bin-x64.zip";

// GGML-модели whisper.cpp (huggingface ggerganov/whisper.cpp).
const HF_BASE = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";
const MODELS = {
  light: { file: "ggml-base.bin", label: "Light (base, ~148 MB)" },
  medium: { file: "ggml-small.bin", label: "Medium (small, ~488 MB)" },
  heavy: { file: "ggml-medium.bin", label: "Heavy (medium, ~1.5 GB)" },
};

// Имя exe в архиве сборки.
const WHISPER_EXE = "whisper-cli.exe";

let _dirCache = null;

// ==================== Пути ====================

function _baseDir() {
  if (_dirCache) return _dirCache;
  let base;
  try {
    const { app } = require("electron");
    base = path.join(app.getPath("userData"), "whisper");
  } catch (_) {
    base = path.join(os.tmpdir(), "cuckoo-whisper");
  }
  _dirCache = base;
  return base;
}

function _binDir() {
  return path.join(_baseDir(), "bin");
}

function _modelsDir() {
  return path.join(_baseDir(), "models");
}

function _ensureDirs() {
  fs.mkdirSync(_binDir(), { recursive: true });
  fs.mkdirSync(_modelsDir(), { recursive: true });
}

/** Путь к whisper-cli.exe (пользовательский из настроек или авто). */
function exePath(custom) {
  const c = String(custom || "").trim();
  if (c && fs.existsSync(c)) return c;
  return path.join(_binDir(), WHISPER_EXE);
}

/** Путь к файлу модели для размера size. */
function modelPath(size) {
  const m = MODELS[size] || MODELS.light;
  return path.join(_modelsDir(), m.file);
}

// ==================== Проверка ffmpeg ====================

/**
 * Найти ffmpeg: сначала пользовательский путь, затем PATH.
 * @returns {Promise<{ok:boolean, path?:string, error?:string}>}
 */
function findFfmpeg(custom) {
  return new Promise((resolve) => {
    const c = String(custom || "").trim();
    if (c && fs.existsSync(c)) return resolve({ ok: true, path: c });
    const probe = process.platform === "win32" ? "where" : "which";
    execFile(probe, ["ffmpeg"], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        return resolve({ ok: false, error: "ffmpeg не найден в PATH" });
      }
      const first = String(stdout).split(/\r?\n/)[0].trim();
      if (first && fs.existsSync(first))
        return resolve({ ok: true, path: first });
      resolve({ ok: false, error: "ffmpeg не найден в PATH" });
    });
  });
}

// ==================== Статус ====================

/**
 * Текущее состояние: наличие exe, моделей, ffmpeg.
 * @param {{exe?:string, ffmpeg?:string}} [opts]
 */
function getStatus(opts = {}) {
  _ensureDirs();
  const exe = exePath(opts.exe);
  const exeExists = fs.existsSync(exe);
  const models = {};
  for (const key of Object.keys(MODELS)) {
    const p = modelPath(key);
    models[key] = {
      file: MODELS[key].file,
      label: MODELS[key].label,
      path: p,
      installed: fs.existsSync(p),
      size: fs.existsSync(p) ? fs.statSync(p).size : 0,
    };
  }
  return {
    baseDir: _baseDir(),
    exePath: exe,
    exeInstalled: exeExists,
    ffmpegPath: String(opts.ffmpeg || "").trim(),
    models,
  };
}

// ==================== Загрузка ====================

/**
 * Скачать URL в файл с отчётом о прогрессе.
 * @param {string} url
 * @param {string} dest
 * @param {(p:{loaded:number,total:number,percent:number})=>void} [onProgress]
 */
async function _download(url, dest, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " для " + url);
  const total = Number(res.headers.get("content-length")) || 0;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".part";
  const fileStream = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  let loaded = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.length;
      fileStream.write(Buffer.from(value));
      if (typeof onProgress === "function") {
        try {
          onProgress({
            loaded,
            total,
            percent: total ? Math.round((loaded / total) * 100) : 0,
          });
        } catch (_) {}
      }
    }
  } finally {
    await new Promise((r) => fileStream.end(r));
  }
  fs.renameSync(tmp, dest);
  return { path: dest, size: loaded };
}

/**
 * Распаковать zip (Windows: PowerShell Expand-Archive; иначе unzip).
 */
function _unzip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    if (process.platform === "win32") {
      const cmd =
        "Expand-Archive -LiteralPath '" +
        zipPath.replace(/'/g, "''") +
        "' -DestinationPath '" +
        destDir.replace(/'/g, "''") +
        "' -Force";
      execFile(
        "powershell",
        ["-NoProfile", "-Command", cmd],
        { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        (err, _o, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          resolve();
        },
      );
    } else {
      execFile("unzip", ["-o", zipPath, "-d", destDir], (err, _o, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve();
      });
    }
  });
}

/** Рекурсивно найти файл по имени в каталоге. */
function _findFile(dir, name) {
  let out = null;
  const walk = (d) => {
    if (out) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.toLowerCase() === name.toLowerCase()) {
        out = p;
        return;
      }
    }
  };
  walk(dir);
  return out;
}

// Защита от параллельных загрузок.
const _busy = new Map();

/**
 * Скачать и распаковать whisper-cli.exe (+ DLL) в <userData>/whisper/bin.
 * @param {(p:object)=>void} [onProgress]
 */
async function downloadBinary(onProgress) {
  if (_busy.has("bin")) return _busy.get("bin");
  const job = (async () => {
    _ensureDirs();
    const zip = path.join(_baseDir(), "whisper-bin-x64.zip");
    await _download(WHISPER_ZIP_URL, zip, onProgress);
    const tmpDir = path.join(_baseDir(), "_unzip");
    await _unzip(zip, tmpDir);
    const found = _findFile(tmpDir, WHISPER_EXE);
    if (!found) throw new Error(WHISPER_EXE + " не найден в архиве");
    // Копируем exe и все DLL рядом.
    const srcDir = path.dirname(found);
    const binDir = _binDir();
    for (const f of fs.readdirSync(srcDir)) {
      if (/\.(exe|dll)$/i.test(f)) {
        fs.copyFileSync(path.join(srcDir, f), path.join(binDir, f));
      }
    }
    // Уборка временных файлов.
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
    try {
      fs.unlinkSync(zip);
    } catch (_) {}
    return { success: true, exePath: exePath() };
  })();
  _busy.set("bin", job);
  try {
    return await job;
  } finally {
    _busy.delete("bin");
  }
}

/**
 * Скачать GGML-модель нужного размера.
 * @param {string} size — light | medium | heavy
 * @param {(p:object)=>void} [onProgress]
 */
async function downloadModel(size, onProgress) {
  const key = MODELS[size] ? size : "light";
  if (_busy.has("model:" + key)) return _busy.get("model:" + key);
  const job = (async () => {
    _ensureDirs();
    const m = MODELS[key];
    const dest = modelPath(key);
    await _download(HF_BASE + m.file, dest, onProgress);
    return { success: true, model: key, path: dest };
  })();
  _busy.set("model:" + key, job);
  try {
    return await job;
  } finally {
    _busy.delete("model:" + key);
  }
}

// ==================== Распознавание ====================

/** ffmpeg: сконвертировать любой аудиофайл в WAV 16kHz mono PCM s16le. */
function _toWav(ffmpegPath, inPath, outPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      inPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      outPath,
    ];
    execFile(ffmpegPath, args, { windowsHide: true }, (err, _o, stderr) => {
      if (err) return reject(new Error("ffmpeg: " + (stderr || err.message)));
      resolve(outPath);
    });
  });
}

/**
 * Запустить whisper-cli.exe и вернуть распознанный текст.
 * @param {string} exe
 * @param {string} wavPath
 * @param {{model:string, lang?:string}} opts
 * @returns {Promise<string>}
 */
function _runWhisper(exe, wavPath, opts) {
  return new Promise((resolve, reject) => {
    const model = modelPath(opts.model);
    if (!fs.existsSync(model))
      return reject(new Error("модель не найдена: " + model));
    const args = [
      "-m",
      model,
      "-f",
      wavPath,
      "-l",
      String(opts.lang || "auto"),
      "-nt", // без таймстампов
      "-otxt", // (на случай если пишет txt рядом — не мешает)
    ];
    const child = spawn(exe, args, {
      windowsHide: true,
      cwd: path.dirname(exe),
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString("utf-8")));
    child.stderr.on("data", (d) => (err += d.toString("utf-8")));
    child.on("error", (e) => reject(new Error("whisper-cli: " + e.message)));
    child.on("close", (code) => {
      if (code !== 0 && !out.trim()) {
        return reject(
          new Error("whisper-cli exit " + code + ": " + err.slice(-500)),
        );
      }
      resolve(out);
    });
  });
}

/** Очистить вывод whisper-cli от служебных строк, оставить текст. */
function _cleanOutput(raw) {
  const lines = String(raw || "").split(/\r?\n/);
  const text = [];
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    // Пропускаем служебные строки whisper.cpp:
    // "[00:00:00.000 --> ...]", "whisper_", "system_info:", "main:", и т.п.
    if (/^\[/.test(s)) {
      // Строка с таймстампом — берём часть после "]".
      const idx = s.indexOf("]");
      if (idx >= 0) {
        const t = s.slice(idx + 1).trim();
        if (t) text.push(t);
      }
      continue;
    }
    if (
      /^(whisper_|ggml_|system_info|main:|load_|encode|decode|output)/i.test(s)
    )
      continue;
    text.push(s);
  }
  return text.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Полный пайплайн: OGG/OPUS → WAV → whisper-cli → текст.
 * @param {string} audioPath — путь к аудиофайлу (oga/ogg/mp3/...)
 * @param {{model?:string, lang?:string, exe?:string, ffmpeg?:string}} [opts]
 * @returns {Promise<{success:boolean, text?:string, error?:string}>}
 */
async function transcribe(audioPath, opts = {}) {
  try {
    if (!audioPath || !fs.existsSync(audioPath))
      return { success: false, error: "аудиофайл не найден" };
    const exe = exePath(opts.exe);
    if (!fs.existsSync(exe)) return { success: false, error: "needExe" };
    const key = MODELS[opts.model] ? opts.model : "light";
    if (!fs.existsSync(modelPath(key)))
      return { success: false, error: "needModel" };

    const ff = await findFfmpeg(opts.ffmpeg);
    if (!ff.ok) return { success: false, error: "needFfmpeg" };

    const wav = audioPath.replace(/\.[^.]+$/, "") + ".16k.wav";
    try {
      await _toWav(ff.path, audioPath, wav);
      const raw = await _runWhisper(exe, wav, {
        model: key,
        lang: opts.lang,
      });
      const text = _cleanOutput(raw);
      return { success: true, text };
    } finally {
      try {
        fs.unlinkSync(wav);
      } catch (_) {}
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ==================== Удаление ====================

/**
 * Удалить установленный whisper-cli.exe и все DLL рядом.
 * @returns {{success:boolean, removed?:string[], error?:string}}
 */
function removeBinary() {
  try {
    const binDir = _binDir();
    if (!fs.existsSync(binDir)) return { success: true, removed: [] };
    const removed = [];
    for (const f of fs.readdirSync(binDir)) {
      if (/\.(exe|dll)$/i.test(f)) {
        try {
          fs.unlinkSync(path.join(binDir, f));
          removed.push(f);
        } catch (_) {}
      }
    }
    return { success: true, removed };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Удалить GGML-модель указанного размера.
 * @param {string} size — light | medium | heavy
 */
function removeModel(size) {
  const key = MODELS[size] ? size : "light";
  try {
    const p = modelPath(key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    // На случай оставшихся .part-файлов.
    try {
      fs.unlinkSync(p + ".part");
    } catch (_) {}
    return { success: true, model: key };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Удалить всё: бинарник и все модели.
 */
function removeAll() {
  const res = { success: true, bin: removeBinary(), models: {} };
  for (const key of Object.keys(MODELS)) res.models[key] = removeModel(key);
  return res;
}

module.exports = {
  MODELS,
  WHISPER_TAG,
  getStatus,
  downloadBinary,
  downloadModel,
  removeBinary,
  removeModel,
  removeAll,
  transcribe,
  findFfmpeg,
  exePath,
  modelPath,
};
