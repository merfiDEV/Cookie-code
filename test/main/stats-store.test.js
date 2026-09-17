"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Изолируем userData во временную папку ДО require модуля.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cuckoo-stats-"));
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    return { app: { getPath: () => tmp } };
  }
  return origLoad.apply(this, arguments);
};

const stats = require("../../src/main/stats-store");

test("stats: пустая статистика возвращает нули", () => {
  const s = stats.getSummary(30);
  assert.strictEqual(s.totals.messages, 0);
  assert.strictEqual(s.totals.tokens, 0);
  assert.strictEqual(s.sessions, 0);
  // Heatmap выровнен по неделям: дней не меньше периода, первый день — воскресенье.
  assert.ok(s.days.length >= 30, "days >= span");
  const firstDow = new Date(s.days[0].date + "T00:00:00").getDay();
  assert.strictEqual(firstDow, 0, "первый день heatmap — воскресенье");
});

test("stats: recordMessage учитывает сообщения и сессии", () => {
  stats.recordMessage({ sessionId: "s1", role: "user" });
  stats.recordMessage({ sessionId: "s1", role: "ai" });
  const s = stats.getSummary(30);
  assert.strictEqual(s.totals.messages, 2);
  assert.strictEqual(s.sessions, 1);
});

test("stats: recordTokens накапливает токены", () => {
  stats.recordTokens({ sessionId: "s1", tokens: 100 });
  stats.recordTokens({ sessionId: "s1", tokens: 50 });
  const s = stats.getSummary(30);
  assert.strictEqual(s.totals.tokens, 150);
});

test("stats: второй message в другой сессии увеличивает sessions", () => {
  stats.recordMessage({ sessionId: "s2", role: "ai" });
  const s = stats.getSummary(30);
  assert.strictEqual(s.sessions, 2);
});

test("stats: reset обнуляет", () => {
  stats.reset();
  const s = stats.getSummary(30);
  assert.strictEqual(s.totals.messages, 0);
  assert.strictEqual(s.totals.tokens, 0);
  assert.strictEqual(s.sessions, 0);
});

test.after(() => {
  Module._load = origLoad;
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (_) {}
});
