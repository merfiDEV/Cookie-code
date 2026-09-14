'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { detectTrigger, boundaryOk } = require('../../src/preload/dom/commands/detect');
const { COMMANDS, findCommand, searchCommands, PLAN_PROMPT, REVIEW_PROMPT, SUMMARIZE_PROMPT, descOf } = require('../../src/preload/dom/commands/registry');
const { collectReviewDiff, buildReviewPrompt } = require('../../src/preload/dom/commands/review-context');

// ==================== detect ====================

test('detectTrigger: токен в начале строки', () => {
  const hit = detectTrigger('/pl', 3);
  assert.ok(hit);
  assert.strictEqual(hit.trigger, '/');
  assert.strictEqual(hit.query, 'pl');
  assert.deepStrictEqual(hit.span, { start: 0, end: 3 });
});

test('detectTrigger: токен после пробела', () => {
  const hit = detectTrigger('привет /pl', 10);
  assert.ok(hit);
  assert.strictEqual(hit.query, 'pl');
  assert.deepStrictEqual(hit.span, { start: 7, end: 10 });
});

test('detectTrigger: одиночный слэш даёт пустой query', () => {
  const hit = detectTrigger('/', 1);
  assert.ok(hit);
  assert.strictEqual(hit.query, '');
});

test('detectTrigger: URL-протокол не триггерит', () => {
  assert.strictEqual(detectTrigger('https:/x', 6), null);
});

test('detectTrigger: двойной слэш не триггерит', () => {
  assert.strictEqual(detectTrigger('a //b', 4), null);
});

test('detectTrigger: слэш после буквы не триггерит', () => {
  assert.strictEqual(detectTrigger('abc/de', 6), null);
});

test('detectTrigger: нет токена', () => {
  assert.strictEqual(detectTrigger('обычный текст', 12), null);
  assert.strictEqual(detectTrigger('', 0), null);
});

// ==================== detect: @-файлы ====================

test('detectTrigger: @ в начале строки', () => {
  const hit = detectTrigger('@src', 4);
  assert.ok(hit);
  assert.strictEqual(hit.trigger, '@');
  assert.strictEqual(hit.query, 'src');
  assert.deepStrictEqual(hit.span, { start: 0, end: 4 });
});

test('detectTrigger: @ после пробела', () => {
  const hit = detectTrigger('файл @ipc', 9);
  assert.ok(hit);
  assert.strictEqual(hit.trigger, '@');
  assert.strictEqual(hit.query, 'ipc');
});

test('detectTrigger: одиночный @ даёт пустой query', () => {
  const hit = detectTrigger('@', 1);
  assert.ok(hit);
  assert.strictEqual(hit.trigger, '@');
  assert.strictEqual(hit.query, '');
});

test('detectTrigger: @ после буквы не триггерит (email)', () => {
  assert.strictEqual(detectTrigger('user@host', 9), null);
});

test('detectTrigger: @ не в наборе chars не триггерит', () => {
  assert.strictEqual(detectTrigger('@src', 4, '/'), null);
});

test('detectTrigger: слэш-токен не триггерит при chars="@", @ триггерит', () => {
  assert.strictEqual(detectTrigger('/plan', 5, '@'), null);
});

test('detectTrigger: неверные аргументы', () => {
  assert.strictEqual(detectTrigger(null, 1), null);
  assert.strictEqual(detectTrigger('abc', null), null);
  assert.strictEqual(detectTrigger('abc', 99), null);
});

test('boundaryOk: начало, пробел, пунктуация', () => {
  assert.strictEqual(boundaryOk('a', 0, '/'), true);
  assert.strictEqual(boundaryOk('a /', 2, '/'), true);
  assert.strictEqual(boundaryOk('a-/', 2, '/'), true);
  assert.strictEqual(boundaryOk('ab/', 2, '/'), false);
});

// ==================== registry ====================

test('registry: команда plan зарегистрирована', () => {
  const cmd = findCommand('plan');
  assert.ok(cmd);
  assert.strictEqual(cmd.name, 'plan');
  assert.ok(cmd.prompt.length > 100);
});

test('registry: команда review зарегистрирована', () => {
  const cmd = findCommand('review');
  assert.ok(cmd);
  assert.strictEqual(cmd.name, 'review');
  assert.strictEqual(cmd.prompt, REVIEW_PROMPT);
  assert.ok(REVIEW_PROMPT.includes('git status'));
  assert.ok(REVIEW_PROMPT.includes('CRITICAL、HIGH、MEDIUM 或 LOW'));
});

test('registry: команда summarize зарегистрирована', () => {
  const cmd = findCommand('summarize');
  assert.ok(cmd);
  assert.strictEqual(cmd.name, 'summarize');
  assert.strictEqual(cmd.prompt, SUMMARIZE_PROMPT);
  assert.ok(SUMMARIZE_PROMPT.includes('已完成的任务'));
  assert.ok(SUMMARIZE_PROMPT.includes('不要编造'));
});

test('review-context: собирает diff изменённых файлов', async () => {
  const calls = [];
  const result = await collectReviewDiff({
    async gitStatus() {
      return { success: true, files: [{ path: 'src/app.js', status: 'modified' }] };
    },
    async gitDiffFile(filePath, status) {
      calls.push([filePath, status]);
      return { success: true, diff: '@@ -1 +1 @@\n-old\n+new' };
    },
  });
  assert.deepStrictEqual(calls, [['src/app.js', 'modified']]);
  assert.ok(result.diff.includes('===== src/app.js ====='));
  assert.ok(buildReviewPrompt(result).includes('以下是本次 review 的实际 diff'));
});

test('review-context: сообщает причину при отсутствии изменений', async () => {
  const result = await collectReviewDiff({
    async gitStatus() { return { success: true, files: [] }; },
    async gitDiffFile() { throw new Error('не должен вызываться'); },
  });
  assert.strictEqual(result.diff, '');
  assert.strictEqual(result.reason, 'Изменённых файлов нет');
  assert.ok(buildReviewPrompt(result).includes('无法获取 diff'));
});

test('registry: findCommand нечувствителен к регистру', () => {
  assert.ok(findCommand('PLAN'));
  assert.ok(findCommand('Plan'));
});

test('registry: findCommand неизвестной команды', () => {
  assert.strictEqual(findCommand('nope'), undefined);
  assert.strictEqual(findCommand(''), undefined);
  assert.strictEqual(findCommand(null), undefined);
});

test('registry: searchCommands по префиксу', () => {
  assert.deepStrictEqual(searchCommands('pl').map((c) => c.name), ['plan']);
  assert.deepStrictEqual(searchCommands('p').map((c) => c.name), ['plan']);
  assert.deepStrictEqual(searchCommands('re').map((c) => c.name), ['review']);
  assert.deepStrictEqual(searchCommands('sum').map((c) => c.name), ['summarize']);
  assert.deepStrictEqual(searchCommands('').map((c) => c.name), ['plan', 'review', 'summarize']);
  assert.deepStrictEqual(searchCommands('xyz'), []);
});

test('registry: PLAN_PROMPT содержит ключевые фразы', () => {
  assert.ok(PLAN_PROMPT.includes('计划模式'));
  assert.ok(PLAN_PROMPT.includes('计划 Markdown'));
  assert.ok(PLAN_PROMPT.includes('等待用户确认'));
});

test('registry: все команды имеют обязательные поля', () => {
  for (const c of COMMANDS) {
    assert.strictEqual(typeof c.name, 'string');
    assert.ok(c.name.length > 0);
    assert.strictEqual(typeof c.descriptionKey, 'string');
    assert.strictEqual(typeof c.prompt, 'string');
  }
});

test('registry: descOf резолвит через функцию перевода', () => {
  const cmd = findCommand('plan');
  const fakeT = (key) => 'T:' + key;
  assert.strictEqual(descOf(cmd, fakeT), 'T:cmd.plan.description');
  // без t() возвращает ключ
  assert.strictEqual(descOf(cmd), 'cmd.plan.description');
  assert.strictEqual(descOf(null), '');
});
