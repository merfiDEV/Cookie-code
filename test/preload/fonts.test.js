"use strict";
const { test } = require("node:test");
const assert = require("node:assert");

// Заглушка DOM + electronAPI до require модуля.
let captured = "";
const fakeStyle = { _id: "", _text: "" };
Object.defineProperty(fakeStyle, "textContent", {
  set(v) {
    this._text = v;
  },
  get() {
    return this._text;
  },
});
Object.defineProperty(fakeStyle, "id", {
  set(v) {
    this._id = v;
  },
  get() {
    return this._id;
  },
});

global.document = {
  createElement: () => fakeStyle,
  head: { appendChild: () => {} },
  documentElement: { appendChild: () => {} },
  getElementById: () => null,
};
global.window = {
  electronAPI: {
    listCustomFonts: async () => ({
      success: true,
      dir: "x",
      fonts: [
        {
          id: "custom:MyFont",
          label: "MyFont",
          file: __dirname + "/fixtures/none.otf",
          custom: true,
        },
      ],
    }),
    getCuckooSettings: async () => ({ font: "anthropic-mono" }),
    onSettingsChanged: () => {},
  },
};

const fonts = require("../../src/preload/dom/fonts");

test("fonts: BUILTIN_FONTS содержит system и anthropic-mono", () => {
  const ids = fonts.BUILTIN_FONTS.map((f) => f.id);
  assert.ok(ids.includes("system"));
  assert.ok(ids.includes("anthropic-mono"));
});

test("fonts: DEFAULT_ID = system", () => {
  assert.strictEqual(fonts.DEFAULT_ID, "system");
});

test("fonts: getAllFonts до загрузки кастомных = встроенные", () => {
  assert.strictEqual(fonts.getAllFonts().length, fonts.BUILTIN_FONTS.length);
});

test("fonts: findFont находит anthropic-mono", () => {
  const f = fonts.findFont("anthropic-mono");
  assert.ok(f);
  assert.strictEqual(f.family, "Anthropic Mono");
});

test("fonts: apply(anthropic-mono) инжектит @font-face и правила", () => {
  fonts.apply("anthropic-mono");
  assert.ok(fakeStyle.textContent.includes("@font-face"));
  assert.ok(fakeStyle.textContent.includes("Anthropic Mono"));
  assert.ok(fakeStyle.textContent.includes("cuckoo-root"));
  assert.ok(fakeStyle.textContent.includes("html, body, body *"));
  assert.strictEqual(fakeStyle.id, "cuckoo-font-style");
});

test("fonts: apply(system) не падает и очищает стиль", () => {
  fonts.apply("system");
  assert.doesNotThrow(() => fonts.apply("system"));
});

test("fonts: apply(несуществующий id) не падает", () => {
  assert.doesNotThrow(() => fonts.apply("nope"));
});

test("fonts: DEFAULT_WEIGHT = 400", () => {
  assert.strictEqual(fonts.DEFAULT_WEIGHT, 400);
});

test("fonts: apply(system, 600) применяет жирность без @font-face", () => {
  fonts.apply("system", 600);
  assert.ok(fakeStyle.textContent.includes("font-weight: 600 !important"));
  assert.ok(!fakeStyle.textContent.includes("@font-face"));
});

test("fonts: apply(anthropic-mono, 700) применяет и шрифт, и жирность", () => {
  fonts.apply("anthropic-mono", 700);
  assert.ok(fakeStyle.textContent.includes("@font-face"));
  assert.ok(fakeStyle.textContent.includes("font-weight: 700 !important"));
});

test("fonts: applyWeight меняет только жирность, сохраняя шрифт", () => {
  fonts.apply("anthropic-mono", 400);
  fonts.applyWeight(300);
  assert.ok(fakeStyle.textContent.includes("font-weight: 300 !important"));
  assert.ok(fakeStyle.textContent.includes("Anthropic Mono"));
});

test("fonts: normalizeWeight ограничивает диапазон 100–900", () => {
  fonts.apply("system", 50);
  assert.ok(fakeStyle.textContent.includes("font-weight: 100 !important"));
  fonts.apply("system", 9999);
  assert.ok(fakeStyle.textContent.includes("font-weight: 900 !important"));
});
