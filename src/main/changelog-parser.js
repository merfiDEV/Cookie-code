/**
 * Парсер CHANGELOG.md — извлекает блоки версий для whats-new.
 *
 * Формат, который понимаем (наш CHANGELOG.md):
 *   ## [4.0.13] - 2026-09-08
 *   ### Fixed
 *   - Что-то починили
 *   - Ещё что-то
 *   ### Added
 *   - Новая фича
 *
 *   ## [Unreleased]
 *   ### Added
 *   - ...
 *
 * Не пытаемся быть универсальным парсером Keep a Changelog —
 * поддерживаем ровно тот формат, что лежит в нашем репо.
 */
const fs = require('fs');
const path = require('path');

/**
 * Сравнить две semver-строки.
 * @returns -1 | 0 | 1
 */
function compareSemver(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/**
 * Разобрать CHANGELOG.md в массив записей.
 * @param {string} md — содержимое файла
 * @returns {Array<{version: string, date: string|null, unreleased: boolean, sections: {title: string, items: string[]}[]}>}
 */
function parseChangelog(md) {
  if (!md || typeof md !== 'string') return [];
  const lines = md.split(/\r?\n/);
  const entries = [];
  let current = null;
  let currentSection = null;

  const VER_RE = /^##\s+\[([^\]]+)\](?:\s*-\s*(.+))?\s*$/;
  const SECTION_RE = /^###\s+(.+?)\s*$/;
  const ITEM_RE = /^\s*[-*]\s+(.+)$/;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;

    const mVer = line.match(VER_RE);
    if (mVer) {
      if (current) entries.push(current);
      const version = mVer[1].trim();
      const date = mVer[2] ? mVer[2].trim() : null;
      const unreleased = /unreleased/i.test(version);
      current = { version, date, unreleased, sections: [] };
      currentSection = null;
      continue;
    }

    if (!current) continue;

    const mSec = line.match(SECTION_RE);
    if (mSec) {
      currentSection = { title: mSec[1].trim(), items: [] };
      current.sections.push(currentSection);
      continue;
    }

    const mItem = line.match(ITEM_RE);
    if (mItem && currentSection) {
      // Одна строка может содержать вложенные подпункты — оставляем как есть
      currentSection.items.push(mItem[1].trim());
    }
  }
  if (current) entries.push(current);
  return entries;
}

/**
 * Выбрать записи версий в диапазоне (from, to].
 * from может быть null — тогда возвращаем только to.
 * to может быть null — тогда возвращаем всё от from до последнего релиза.
 * Unreleased пропускаем.
 */
function extractSince(entries, from, to) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const result = [];
  for (const e of entries) {
    if (e.unreleased) continue;
    // Приводим версию к чистому виду (без префикса v)
    const v = String(e.version).replace(/^v/, '').trim();
    if (!/^\d+\.\d+\.\d+/.test(v)) continue;

    if (from && compareSemver(v, from) <= 0) continue;
    if (to && compareSemver(v, to) > 0) continue;
    result.push({ ...e, version: v });
  }
  // Сортируем по убыванию версии (свежие — сверху)
  result.sort((a, b) => compareSemver(b.version, a.version));
  return result;
}

/**
 * Загрузить CHANGELOG.md из встроенного файла.
 * Ищем рядом с main-процессом: <appRoot>/CHANGELOG.md.
 * В electron-builder файл включён в сборку (не отфильтрован).
 */
function loadBuiltinChangelog() {
  const candidates = [
    path.join(__dirname, '..', '..', 'CHANGELOG.md'),
    path.join(process.resourcesPath || '', 'CHANGELOG.md'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf-8');
      }
    } catch (_) {}
  }
  return '';
}

/**
 * Собрать markdown-строку из выбранных записей — для показа в whats-new.
 * Формат компактнее оригинального: версия → разделы → пункты.
 */
function toMarkdown(entries) {
  if (!entries || entries.length === 0) return '';
  const out = [];
  for (const e of entries) {
    out.push('### v' + e.version + (e.date ? ' — ' + e.date : ''));
    for (const s of e.sections) {
      if (!s.items.length) continue;
      out.push('**' + s.title + '**');
      for (const it of s.items) out.push('- ' + it);
    }
    out.push('');
  }
  return out.join('\n').trim();
}

module.exports = {
  parseChangelog,
  extractSince,
  loadBuiltinChangelog,
  toMarkdown,
  compareSemver,
};
