"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const {
  parseFetchArgs,
  formatFetchOutput,
} = require("../../tools/WebFetchTool");

test("parseFetchArgs 正常", () => {
  assert.deepStrictEqual(parseFetchArgs("https://example.com"), {
    url: "https://example.com",
  });
});

test("parseFetchArgs 空/非字符串抛错", () => {
  assert.throws(() => parseFetchArgs(""), /url must be a non-empty string/);
  assert.throws(() => parseFetchArgs(null), /url must be a non-empty string/);
  assert.throws(() => parseFetchArgs(123), /url must be a non-empty string/);
});

test("formatFetchOutput html 转 markdown", () => {
  const html = "<h1>标题</h1><p>内容</p>";
  const out = formatFetchOutput(
    "https://example.com",
    200,
    "html",
    html,
    false,
  );
  assert.match(out, /Fetched https:\/\/example\.com \(HTTP 200\)/);
  assert.match(out, /标题/);
  assert.match(out, /内容/);
});

test("formatFetchOutput text 原样", () => {
  const out = formatFetchOutput(
    "https://example.com",
    200,
    "text",
    "plain text",
    false,
  );
  assert.match(out, /plain text/);
});

test("formatFetchOutput 截断 footer", () => {
  const long = "x".repeat(30000);
  const out = formatFetchOutput(
    "https://example.com",
    200,
    "text",
    long,
    false,
  );
  assert.match(out, /\(Content truncated/);
});

test("formatFetchOutput 显式 truncated 参数", () => {
  const out = formatFetchOutput(
    "https://example.com",
    200,
    "text",
    "abc",
    true,
  );
  assert.match(out, /\(Content truncated/);
});

// --- 新功能 ---

test("formatFetchOutput maxChars 覆盖默认上限", () => {
  const body = "a".repeat(5000);
  const out = formatFetchOutput(
    "https://example.com",
    200,
    "text",
    body,
    false,
    { maxChars: 100 },
  );
  assert.match(out, /\(Content truncated/);
  // 正文被截到 100 字符
  assert.ok(out.length < 500);
});

test("formatFetchOutput maxChars 足够大时不截断", () => {
  const body = "short";
  const out = formatFetchOutput(
    "https://example.com",
    200,
    "text",
    body,
    false,
    { maxChars: 1000 },
  );
  assert.doesNotMatch(out, /\(Content truncated/);
});

test("formatFetchOutput raw=true 时 html 不转 markdown", () => {
  const html = "<h1>标题</h1>";
  const out = formatFetchOutput(
    "https://example.com",
    200,
    "html",
    html,
    false,
    { raw: true },
  );
  assert.match(out, /<h1>标题<\/h1>/);
});

test("formatFetchOutput 不在 HTML 标签中间截断（先转换后截断）", () => {
  // 构造一个长 HTML，若在原始 HTML 上截断会产生半截标签；转 markdown 后应正常
  const html = "<p>" + "x".repeat(30000) + "</p>";
  const out = formatFetchOutput(
    "https://example.com",
    200,
    "html",
    html,
    false,
    { maxChars: 200 },
  );
  // 转换后是纯文本，不应含未闭合的 <p>
  assert.doesNotMatch(out, /<p>/);
});

test("formatFetchOutput HTML 转 markdown 失败时降级为原文", () => {
  // 传 null 触发 turndown 异常路径（容错）
  const out = formatFetchOutput(
    "https://example.com",
    200,
    "html",
    null,
    false,
  );
  assert.match(out, /Fetched https:\/\/example\.com/);
});
