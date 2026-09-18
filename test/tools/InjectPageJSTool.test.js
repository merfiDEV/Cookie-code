"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { installElectronMock } = require("../helpers/mock-electron");

installElectronMock();

const { InjectPageJSTool } = require("../../tools/InjectPageJSTool");

test("InjectPageJSTool 构造器", () => {
  const t = new InjectPageJSTool();
  assert.strictEqual(t.name, "inject_page_js");
  assert.strictEqual(t.jsApi, "injectPageJS(code, windowId?)");
  assert.ok(t.parameters.required.includes("code"));
});

test("InjectPageJSTool getPromptSection", () => {
  const t = new InjectPageJSTool();
  const s = t.getPromptSection();
  assert.strictEqual(s.name, "tool:inject_page_js");
  assert.strictEqual(s.order, 114);
  assert.match(s.text, /injectPageJS/);
});

test("InjectPageJSTool 缺 code 返回错误", async () => {
  const t = new InjectPageJSTool();
  const r = await t.execute({});
  assert.strictEqual(r.success, false);
  assert.match(r.error, /code/);
});

test("InjectPageJSTool 未知 windowId 返回错误", async () => {
  const t = new InjectPageJSTool();
  const r = await t.execute({ code: "return 1", windowId: "no-such-window" });
  assert.strictEqual(r.success, false);
  assert.match(r.error, /不存在/);
});
