'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

// Мокаем window/CustomEvent до require модуля (safe.js использует console).
const dispatched = [];
global.window = {
  addEventListener() {},
  dispatchEvent(ev) { dispatched.push(ev); return true; },
  fetch: null,
  XMLHttpRequest: undefined,
};
global.CustomEvent = class CustomEvent {
  constructor(type, opts) { this.type = type; this.detail = (opts && opts.detail) || {}; }
};

const ti = require('../../src/preload/dom/token-interceptor');

beforeEach(() => {
  dispatched.length = 0;
  ti._resetTotal();
});

test('extractUsage: число в accumulated_token_usage', () => {
  const u = ti._extractUsage({ accumulated_token_usage: 1234 });
  assert.strictEqual(u.total, 1234);
  assert.strictEqual(u.source, 'accumulated');
});

test('extractUsage: объект accumulated_token_usage', () => {
  const u = ti._extractUsage({ accumulated_token_usage: { total_tokens: 500, prompt_tokens: 400, completion_tokens: 100 } });
  assert.strictEqual(u.total, 500);
  assert.strictEqual(u.prompt, 400);
  assert.strictEqual(u.completion, 100);
});

test('extractUsage: usage.total_tokens как резерв', () => {
  const u = ti._extractUsage({ usage: { total_tokens: 42 } });
  assert.strictEqual(u.total, 42);
  assert.strictEqual(u.source, 'usage');
});

test('extractUsage: реальный формат DeepSeek — BATCH патч-операции', () => {
  const u = ti._extractUsage({ p: 'response', o: 'BATCH', v: [{ p: 'accumulated_token_usage', v: 82 }, { p: 'quasi_status', v: 'FINISHED' }] });
  assert.strictEqual(u.total, 82);
  assert.strictEqual(u.source, 'accumulated');
});

test('extractUsage: реальный формат DeepSeek — снимок WIP', () => {
  const u = ti._extractUsage({ v: { response: { accumulated_token_usage: 50, status: 'WIP' } } });
  assert.strictEqual(u.total, 50);
  assert.strictEqual(u.source, 'accumulated');
});

test('extractUsage: BATCH с несколькими патчами берёт последний accumulated', () => {
  const u = ti._extractUsage({ v: [{ p: 'accumulated_token_usage', v: 10 }, { p: 'other', v: 1 }, { p: 'accumulated_token_usage', v: 30 }] });
  assert.strictEqual(u.total, 30);
});

test('extractUsage: нет данных → null', () => {
  assert.strictEqual(ti._extractUsage({}), null);
  assert.strictEqual(ti._extractUsage(null), null);
  assert.strictEqual(ti._extractUsage({ usage: {} }), null);
});

test('parseSseText: строки data: с usage', () => {
  const body = 'data: {"choices":[]}\n\ndata: {"accumulated_token_usage": 777}\n\ndata: [DONE]\n\n';
  const u = ti._parseSseText(body);
  assert.strictEqual(u.total, 777);
});

test('parseSseText: несколько кадров → последний usage', () => {
  const body = 'data: {"accumulated_token_usage": 10}\ndata: {"accumulated_token_usage": 25}\n';
  const u = ti._parseSseText(body);
  assert.strictEqual(u.total, 25);
});

test('parseSseText: битый JSON не роняет', () => {
  const body = 'data: {not json}\ndata: {"usage":{"total_tokens":9}}\n';
  const u = ti._parseSseText(body);
  assert.strictEqual(u.total, 9);
});

test('parseSseText: пусто → null', () => {
  assert.strictEqual(ti._parseSseText(''), null);
  assert.strictEqual(ti._parseSseText('data: [DONE]'), null);
});

test('isCompletionUrl: различает endpoint', () => {
  assert.strictEqual(ti._isCompletionUrl('https://chat.deepseek.com/api/v0/chat/completion'), true);
  assert.strictEqual(ti._isCompletionUrl('https://chat.deepseek.com/api/v0/chat/history'), false);
  assert.strictEqual(ti._isCompletionUrl(''), false);
});

test('publish: дельта считается от предыдущего total и рассылается событие', () => {
  ti._publish({ total: 100, prompt: 0, completion: 0, source: 'accumulated' });
  assert.strictEqual(dispatched.length, 1);
  assert.strictEqual(dispatched[0].type, 'cuckoo:token-update');
  assert.strictEqual(dispatched[0].detail.total, 100);
  assert.strictEqual(dispatched[0].detail.delta, 100);

  ti._publish({ total: 250, prompt: 0, completion: 0, source: 'accumulated' });
  assert.strictEqual(dispatched.length, 2);
  assert.strictEqual(dispatched[1].detail.delta, 150);
  assert.strictEqual(ti._getLastTotal(), 250);
});

test('publish: нулевая дельта не рассылается (стартовый кадр-снимок)', () => {
  ti._publish({ total: 50, source: 'accumulated' });
  dispatched.length = 0;
  // повтор с той же суммой (стартовый снимок следующего ответа) → пропуск
  ti._publish({ total: 50, source: 'accumulated' });
  assert.strictEqual(dispatched.length, 0);
});

test('publish: сброс (delta < 0) обновляет total без события', () => {
  ti._publish({ total: 500, source: 'accumulated' });
  dispatched.length = 0;
  ti._publish({ total: 10, source: 'accumulated' });
  assert.strictEqual(dispatched.length, 0);
  assert.strictEqual(ti._getLastTotal(), 10);
});

test('install: идемпотентен и патчит fetch', () => {
  let called = 0;
  global.window.fetch = function () { called++; return Promise.resolve({ clone: () => ({ text: () => Promise.resolve('') }) }); };
  ti.install();
  ti.install();
  assert.strictEqual(typeof global.window.fetch, 'function');
  // повторный install не должен оборачивать fetch дважды
  assert.strictEqual(called, 0);
});
