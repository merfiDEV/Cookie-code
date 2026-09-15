/**
 * Whats-new: показ нововведений при первом запуске после обновления.
 *
 * Логика:
 *   1. При старте читаем lastSeenVersion из <userData>/whats-new-state.json.
 *   2. Если он есть и != текущей — читаем CHANGELOG.md,
 *      выбираем записи в диапазоне (lastSeen, current],
 *      сохраняем их в pending (для отправки в окно после его загрузки).
 *   3. НЕМЕДЛЕННО записываем current в lastSeenVersion — чтобы при
 *      повторном запуске той же версии whats-new не показывался.
 *   4. Когда окно готово — шлём 'whats-new-show' с markdown-контентом.
 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const parser = require('./changelog-parser');

function getStateFile() {
  return path.join(app.getPath('userData'), 'whats-new-state.json');
}

function readState() {
  try {
    const f = getStateFile();
    if (fs.existsSync(f)) {
      let raw = fs.readFileSync(f, 'utf-8');
      // Убираем BOM (\uFEFF): PowerShell 5.1 и Блокнот пишут UTF-8 с BOM,
      // из-за чего JSON.parse падает с "Unexpected token '﻿'".
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[WhatsNew] read error:', err.message);
  }
  return { lastSeenVersion: null, lastShownAt: null };
}

function writeState(state) {
  try {
    const f = getStateFile();
    const tmp = f + '.tmp';
    // Атомарная запись: пишем в .tmp и делаем rename
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmp, f);
  } catch (err) {
    console.error('[WhatsNew] write error:', err.message);
  }
}

// Хранит pending-запрос для окна: { from, to, markdown }
let pendingForWindow = null;

/**
 * Вызывается один раз при старте приложения (до создания окна).
 * Возвращает { shouldShow, from, to, markdown } и СРАЗУ сохраняет state.
 */
function checkAndMark() {
  const current = app.getVersion();
  const state = readState();
  const from = state.lastSeenVersion;

  // Первый запуск вообще: не показываем, только запоминаем
  if (!from) {
    writeState({ lastSeenVersion: current, lastShownAt: null });
    return { shouldShow: false, from: null, to: current, markdown: '' };
  }

  // Версия не менялась — не показываем
  if (from === current) {
    return { shouldShow: false, from, to: current, markdown: '' };
  }

  // Версия вперёд: показать
  const forward = parser.compareSemver(current, from) > 0;

  // ВСЕГДА запоминаем новую версию (в т.ч. при откате — чтобы не показывать whats-new
  // при следующем запуске той же старой версии).
  writeState({
    lastSeenVersion: current,
    lastShownAt: forward ? new Date().toISOString() : null,
  });

  if (!forward) {
    // Откат — не показываем
    return { shouldShow: false, from, to: current, markdown: '' };
  }

  // Собираем markdown из CHANGELOG
  let markdown = '';
  try {
    const raw = parser.loadBuiltinChangelog();
    const entries = parser.parseChangelog(raw);
    const selected = parser.extractSince(entries, from, current);
    markdown = parser.toMarkdown(selected);
  } catch (err) {
    console.error('[WhatsNew] parse error:', err.message);
  }

  if (!markdown) {
    // CHANGELOG не содержит нужных записей — показываем хотя бы заголовок
    markdown = '### v' + current + '\n\n_Обновились до новой версии. Подробности — в CHANGELOG.md._';
  }

  pendingForWindow = { from, to: current, markdown };
  return { shouldShow: true, from, to: current, markdown };
}

/**
 * Забрать pending для отправки в окно (и очистить).
 */
function consumePendingForWindow() {
  const p = pendingForWindow;
  pendingForWindow = null;
  return p;
}

module.exports = {
  checkAndMark,
  consumePendingForWindow,
  readState,
  writeState,
  getStateFile,
};
