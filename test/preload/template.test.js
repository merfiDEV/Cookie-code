'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildOverlayHTML, OVERLAY_CSS } = require('../../src/preload/overlay/template');

test('buildOverlayHTML 包含核心元素', () => {
  const html = buildOverlayHTML();
  assert.ok(html.includes('cuckoo-overlay'));
  assert.ok(html.includes('cuckoo-btn-init'));
  assert.ok(html.includes('cuckoo-session-list'));
  assert.ok(html.includes('cuckoo-btn-manual-parse'));
  assert.ok(html.includes('cuckoo-status-badge'));
});

test('buildOverlayHTML — это функция (для пересборки при смене языка)', () => {
  assert.strictEqual(typeof buildOverlayHTML, 'function');
});

test('OVERLAY_CSS 包含核心样式', () => {
  assert.ok(OVERLAY_CSS.includes('.cuckoo-overlay'));
  assert.ok(OVERLAY_CSS.includes('--ck-primary'));
  assert.ok(OVERLAY_CSS.includes('cuckoo-hidden'));
});
