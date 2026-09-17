"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const contextPort = require("../../src/main/context-port");

test("context-port: set/get round-trip", () => {
  contextPort.set(1, { history: "h1", stage: "history" });
  const d = contextPort.get(1);
  assert.ok(d);
  assert.strictEqual(d.history, "h1");
  assert.strictEqual(d.stage, "history");
});

test("context-port: get неизвестного id → null", () => {
  assert.strictEqual(contextPort.get(999), null);
});

test("context-port: summary перезаписывает stage, сохраняя history", () => {
  contextPort.set(2, { history: "h2", stage: "history" });
  contextPort.set(2, { history: "h2", summary: "s2", stage: "summary" });
  const d = contextPort.get(2);
  assert.strictEqual(d.stage, "summary");
  assert.strictEqual(d.summary, "s2");
  assert.strictEqual(d.history, "h2");
});

test("context-port: clear удаляет запись", () => {
  contextPort.set(3, { history: "h3" });
  contextPort.clear(3);
  assert.strictEqual(contextPort.get(3), null);
});
