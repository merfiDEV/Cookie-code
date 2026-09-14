/**
 * Реестр форматтеров (порт opencode packages/opencode/src/format/formatter.ts).
 *
 * Идея: после каждой записи файла (write/edit) проходим по списку форматтеров,
 * первый подходящий (совпал extension + enabled() вернул команду) — запускаем.
 *
 * Каждый форматтер:
 *   name        — имя (для логов и ошибок)
 *   extensions  — список расширений (с точкой, нижний регистр)
 *   enabled(ctx) -> string[] | null
 *                 ctx = { directory, worktree, filePath }
 *                 Возвращает argv команды; '$FILE' заменится на путь файла.
 *                 null / false → форматтер не применим.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ========== Утилиты ==========

/**
 * Найти файл вверх по дереву от startDir до stopDir (не включая stopDir за пределами).
 * Возвращает абсолютный путь или null.
 */
function findUp(filename, startDir, stopDir) {
  let dir = startDir;
  const stop = stopDir ? path.resolve(stopDir) : null;
  while (true) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    if (stop && path.resolve(parent) === stop && !fs.existsSync(path.join(stop, filename))) return null;
    if (stop && path.resolve(dir) === stop) return null;
    dir = parent;
  }
}

/**
 * Найти исполняемый файл в PATH (аналог which).
 * На Windows проверяет расширения .cmd, .exe, .bat, .ps1.
 */
function which(cmd) {
  const isWin = process.platform === 'win32';
  const exts = isWin ? ['.cmd', '.exe', '.bat', ''] : [''];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      try {
        if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
      } catch (_) {}
    }
  }
  return null;
}

/**
 * Найти локальный бинарь в node_modules/.bin вверх по дереву.
 * На Windows сначала пробуем .cmd (npm-шимы), потом без расширения.
 */
function localBin(binName, startDir, stopDir) {
  const isWin = process.platform === 'win32';
  const dirsToCheck = isWin ? [binName + '.cmd', binName + '.ps1', binName] : [binName];
  let dir = startDir;
  const stop = stopDir ? path.resolve(stopDir) : null;
  while (true) {
    for (const d of dirsToCheck) {
      const candidate = path.join(dir, 'node_modules', '.bin', d);
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch (_) {}
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    if (stop && path.resolve(dir) === stop) return null;
    dir = parent;
  }
}

/**
 * Прочитать package.json рядом с найденным up-файлом и проверить наличие зависимости.
 */
function hasNpmDep(pkgJsonPath, depName) {
  try {
    const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
    const json = JSON.parse(raw);
    return Boolean(
      (json.dependencies && json.dependencies[depName]) ||
      (json.devDependencies && json.devDependencies[depName])
    );
  } catch (_) { return false; }
}

// ========== Форматтеры ==========
// Порт 1:1 из opencode. Порядок в массиве = приоритет (первый совпавший выигрывает).

const gofmt = {
  name: 'gofmt',
  extensions: ['.go'],
  async enabled() {
    const bin = which('gofmt');
    if (!bin) return null;
    return [bin, '-w', '$FILE'];
  },
};

const prettier = {
  name: 'prettier',
  extensions: [
    '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
    '.html', '.htm', '.css', '.scss', '.sass', '.less',
    '.vue', '.svelte',
    '.json', '.jsonc', '.yaml', '.yml', '.toml', '.xml',
    '.md', '.mdx', '.graphql', '.gql',
  ],
  async enabled(ctx) {
    const pkgPath = findUp('package.json', ctx.directory, ctx.worktree);
    if (!pkgPath) return null;
    if (!hasNpmDep(pkgPath, 'prettier')) return null;
    const bin = localBin('prettier', ctx.directory, ctx.worktree) || which('prettier');
    if (!bin) return null;
    return [bin, '--write', '$FILE'];
  },
};

const biome = {
  name: 'biome',
  extensions: [
    '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
    '.html', '.htm', '.css', '.scss', '.sass', '.less',
    '.vue', '.svelte',
    '.json', '.jsonc', '.yaml', '.yml', '.toml', '.xml',
    '.md', '.mdx', '.graphql', '.gql',
  ],
  async enabled(ctx) {
    const cfg = findUp('biome.json', ctx.directory, ctx.worktree) ||
                findUp('biome.jsonc', ctx.directory, ctx.worktree);
    if (!cfg) return null;
    const bin = localBin('biome', ctx.directory, ctx.worktree) || which('biome');
    if (!bin) return null;
    return [bin, 'format', '--write', '$FILE'];
  },
};

const ruff = {
  name: 'ruff',
  extensions: ['.py', '.pyi'],
  async enabled(ctx) {
    const bin = which('ruff');
    if (!bin) return null;
    const pyproject = findUp('pyproject.toml', ctx.directory, ctx.worktree);
    const ruffToml = findUp('ruff.toml', ctx.directory, ctx.worktree);
    const dotRuffToml = findUp('.ruff.toml', ctx.directory, ctx.worktree);
    if (!pyproject && !ruffToml && !dotRuffToml) return null;
    if (pyproject) {
      try {
        const text = fs.readFileSync(pyproject, 'utf-8');
        if (!/\[tool\.ruff\]/.test(text)) return null;
      } catch (_) {}
    }
    return [bin, 'format', '$FILE'];
  },
};

const rustfmt = {
  name: 'rustfmt',
  extensions: ['.rs'],
  async enabled() {
    const bin = which('rustfmt');
    if (!bin) return null;
    return [bin, '--edition', '2021', '$FILE'];
  },
};

const shfmt = {
  name: 'shfmt',
  extensions: ['.sh', '.bash'],
  async enabled() {
    const bin = which('shfmt');
    if (!bin) return null;
    return [bin, '-w', '$FILE'];
  },
};

const clangFormat = {
  name: 'clang-format',
  extensions: ['.c', '.cc', '.cpp', '.cxx', '.c++', '.h', '.hh', '.hpp', '.hxx', '.h++', '.ino'],
  async enabled(ctx) {
    const cfg = findUp('.clang-format', ctx.directory, ctx.worktree);
    if (!cfg) return null;
    const bin = which('clang-format');
    if (!bin) return null;
    return [bin, '-i', '$FILE'];
  },
};

// Порядок важен: prettier идёт ПЕРЕД biome? Нет — opencode держит их независимо,
// какой первым вернёт enabled() != null, тот и применяется.
// На практике prettier и biome не уживаются в одном проекте.
const FORMATTERS = [
  gofmt,
  prettier,
  biome,
  ruff,
  rustfmt,
  shfmt,
  clangFormat,
];

// ========== Публичный API ==========

/**
 * Найти подходящий форматтер для файла.
 * @returns {Promise<{ formatter: object, argv: string[] } | null>}
 */
async function pickFormatter(filePath, ctx) {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return null;

  for (const formatter of FORMATTERS) {
    if (!formatter.extensions.includes(ext)) continue;
    let argv = null;
    try {
      argv = await formatter.enabled(ctx);
    } catch (err) {
      console.warn('[formatter] enabled() failed for ' + formatter.name + ':', err.message);
      continue;
    }
    if (!argv) continue;
    return { formatter, argv };
  }
  return null;
}

/**
 * Запустить форматтер для файла. Тихо игнорирует ошибки — не ломаем write/edit.
 *
 * @param {string} filePath   абсолютный путь к файлу
 * @param {string} projectDir абсолютный путь к корню проекта
 * @param {object} [opts]
 * @param {string} [opts.worktree]  верхняя граница поиска (обычно git-корень; по умолчанию = projectDir)
 * @returns {Promise<{ applied: boolean, formatter?: string, error?: string }>}
 */
async function formatFile(filePath, projectDir, opts = {}) {
  if (!filePath || !projectDir) return { applied: false };
  const ctx = {
    directory: path.dirname(filePath),
    worktree: opts.worktree || projectDir,
    filePath,
  };
  const picked = await pickFormatter(filePath, ctx);
  if (!picked) return { applied: false };

  const { formatter, argv } = picked;
  const args = argv.map((a) => (a === '$FILE' ? filePath : a));
  const cmd = args[0];
  const restArgs = args.slice(1);

  // На Windows .cmd/.bat-файлы (npm-шимы) нельзя запускать напрямую.
  // Собираем одну строку с правильным quoting и запускаем через shell.
  // Для остального — обычный spawnSync без shell (безопаснее).
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);

  // Экранирование аргумента для cmd.exe (не для POSIX shell).
  function winQuote(arg) {
    if (!/[\s"^&|<>()%!]/.test(arg)) return arg;
    // Двойные кавычки вокруг + удвоение внутренних кавычек.
    return '"' + arg.replace(/"/g, '""') + '"';
  }

  let result;
  try {
    if (needsShell) {
      const line = [cmd, ...restArgs].map(winQuote).join(' ');
      result = spawnSync(line, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: 10_000,
        windowsHide: true,
        shell: true,
      });
    } else {
      result = spawnSync(cmd, restArgs, {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: 10_000,
        windowsHide: true,
      });
    }
  } catch (err) {
    console.warn('[formatter] spawn failed ' + formatter.name + ': ' + err.message);
    return { applied: false, formatter: formatter.name, error: err.message };
  }

  if (result.error || (result.status !== 0 && result.status !== null)) {
    const errMsg = (result.error && result.error.message) ||
      ((result.stderr || '').trim() || 'exit ' + result.status);
    console.warn('[formatter] ' + formatter.name + ' failed on ' + path.basename(filePath) + ': ' + errMsg);
    return { applied: false, formatter: formatter.name, error: errMsg };
  }
  console.log('[formatter] applied ' + formatter.name + ' to ' + path.basename(filePath));
  return { applied: true, formatter: formatter.name };
}

module.exports = {
  FORMATTERS,
  findUp,
  which,
  localBin,
  pickFormatter,
  formatFile,
};
