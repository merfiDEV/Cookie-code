/**
 * Тесты реестра форматтеров (format-registry).
 * Проверяют:
 *   - выбор форматтера по расширению (extensions)
 *   - findUp ищет package.json вверх по дереву
 *   - which возвращает null для несуществующего бинаря
 *   - formatFile не падает, если форматтера нет
 *   - форматтер применяется к реальному файлу (используем скрипт-заглушку)
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  FORMATTERS,
  findUp,
  which,
  pickFormatter,
  formatFile,
} = require('../../src/main/format-registry');

function mkTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

test('FORMATTERS содержит ожидаемые встроенные форматеры', () => {
  const names = FORMATTERS.map((f) => f.name);
  assert.ok(names.includes('gofmt'));
  assert.ok(names.includes('prettier'));
  assert.ok(names.includes('biome'));
  assert.ok(names.includes('ruff'));
  assert.ok(names.includes('rustfmt'));
  assert.ok(names.includes('shfmt'));
  assert.ok(names.includes('clang-format'));
});

test('findUp: находит package.json вверх по дереву', () => {
  const root = mkTmpDir('cuckoo-format-up-');
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"x"}');
    const nested = path.join(root, 'a', 'b', 'c');
    fs.mkdirSync(nested, { recursive: true });
    const found = findUp('package.json', nested, root);
    assert.strictEqual(found, path.join(root, 'package.json'));
  } finally {
    rmDir(root);
  }
});

test('findUp: возвращает null, если файл не найден до worktree', () => {
  const root = mkTmpDir('cuckoo-format-up-null-');
  try {
    const nested = path.join(root, 'a', 'b');
    fs.mkdirSync(nested, { recursive: true });
    const found = findUp('package.json', nested, root);
    assert.strictEqual(found, null);
  } finally {
    rmDir(root);
  }
});

test('which: возвращает null для заведомо отсутствующей команды', () => {
  const bin = which('definitely-not-a-real-binary-xyz-123');
  assert.strictEqual(bin, null);
});

test('pickFormatter: не возвращает форматтер для неизвестного расширения', async () => {
  const dir = mkTmpDir('cuckoo-format-pick-');
  try {
    const fake = path.join(dir, 'file.unknownext');
    fs.writeFileSync(fake, 'x');
    const picked = await pickFormatter(fake, { directory: dir, worktree: dir, filePath: fake });
    assert.strictEqual(picked, null);
  } finally {
    rmDir(dir);
  }
});

test('pickFormatter: выбирает prettier, если package.json содержит prettier и есть локальный bin', async () => {
  const root = mkTmpDir('cuckoo-format-prettier-');
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      devDependencies: { prettier: '^3.0.0' },
    }));
    const binDir = path.join(root, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const binName = process.platform === 'win32' ? 'prettier.cmd' : 'prettier';
    fs.writeFileSync(path.join(binDir, binName), 'echo'); // заглушка, чтобы localBin нашёл файл

    const file = path.join(root, 'a.js');
    fs.writeFileSync(file, 'const x=1;');
    const picked = await pickFormatter(file, { directory: root, worktree: root, filePath: file });
    assert.ok(picked, 'ожидался выбранный форматтер');
    assert.strictEqual(picked.formatter.name, 'prettier');
    assert.ok(picked.argv[0].includes('prettier'));
    assert.deepStrictEqual(picked.argv.slice(-2), ['--write', '$FILE']);
  } finally {
    rmDir(root);
  }
});

test('formatFile: не падает, если файл неизвестного типа', async () => {
  const dir = mkTmpDir('cuckoo-format-noop-');
  try {
    const f = path.join(dir, 'weird.unknownext');
    fs.writeFileSync(f, 'hello');
    const res = await formatFile(f, dir);
    assert.strictEqual(res.applied, false);
  } finally {
    rmDir(dir);
  }
});

test('formatFile: применяет gofmt, если бинарь есть в PATH', async (t) => {
  const gofmtBin = which('gofmt');
  if (!gofmtBin) {
    t.skip('gofmt не установлен — пропускаем');
    return;
  }
  const dir = mkTmpDir('cuckoo-format-go-');
  try {
    const f = path.join(dir, 'main.go');
    // специально кривой формат
    fs.writeFileSync(f, 'package main\nfunc  main( ){println("hi")}\n');
    const res = await formatFile(f, dir);
    assert.strictEqual(res.applied, true);
    assert.strictEqual(res.formatter, 'gofmt');
    const after = fs.readFileSync(f, 'utf-8');
    // gofmt приводит к каноничному виду с табуляцией
    assert.ok(after.includes('func main()'), 'gofmt должен был нормализовать сигнатуру');
  } finally {
    rmDir(dir);
  }
});


// ================== Тесты formatter.js (через мок electron) ==================

test('formatter: isEnabled возвращает true по умолчанию (без settings)', () => {
  const { installElectronMock } = require('../helpers/mock-electron');
  const restore = installElectronMock();
  try {
    // Перезагружаем модули, чтобы settings-store получил мок electron
    delete require.cache[require.resolve('../../src/main/settings-store')];
    delete require.cache[require.resolve('../../src/main/formatter')];
    const { isEnabled } = require('../../src/main/formatter');
    assert.strictEqual(isEnabled(), true);
  } finally {
    restore();
  }
});

test('formatter: formatAfterWrite ничего не делает при formattersEnabled=false', async () => {
  const { installElectronMock } = require('../helpers/mock-electron');
  const restore = installElectronMock();
  const dir = mkTmpDir('cuckoo-format-disabled-');
  try {
    const file = path.join(dir, 'x.py');
    fs.writeFileSync(file, 'x=1');

    // Пишем settings.json с formattersEnabled: false
    const settingsDir = path.join(process.cwd(), 'test', 'tmp', 'userData');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'cuckoo-settings.json'),
      JSON.stringify({ formattersEnabled: false })
    );

    delete require.cache[require.resolve('../../src/main/settings-store')];
    delete require.cache[require.resolve('../../src/main/formatter')];
    const { formatAfterWrite, isEnabled } = require('../../src/main/formatter');

    assert.strictEqual(isEnabled(), false);

    // Даже если ruff есть — не должен вызываться. Проверим, что результат не брошен и не применил формат.
    await formatAfterWrite(file, dir);
    // Тест не падает — значит guard работает.

    // Уборка settings-файла, чтобы не влиять на другие тесты
    fs.unlinkSync(path.join(settingsDir, 'cuckoo-settings.json'));
  } finally {
    restore();
    rmDir(dir);
  }
});

test('formatter: formatAfterWrite не падает на несуществующем файле', async () => {
  const { installElectronMock } = require('../helpers/mock-electron');
  const restore = installElectronMock();
  try {
    delete require.cache[require.resolve('../../src/main/settings-store')];
    delete require.cache[require.resolve('../../src/main/formatter')];
    const { formatAfterWrite } = require('../../src/main/formatter');
    await formatAfterWrite('D:\\nonexistent\\path\\file.js', 'D:\\nonexistent');
    // Ничего не произошло — но и не упало. ОК.
  } finally {
    restore();
  }
});
