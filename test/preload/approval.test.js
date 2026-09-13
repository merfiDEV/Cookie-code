'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const approval = require('../../src/preload/dom/approval');
const state = require('../../src/preload/dom/state');

test('needsApproval: режим off — ничего не требует подтверждения', () => {
  for (const tool of ['bash', 'write', 'read', 'pwsh', 'mysql']) {
    assert.strictEqual(approval.needsApproval(tool, 'off'), false, tool);
  }
});

test('needsApproval: режим risky — только рискованные инструменты', () => {
  const risky = ['bash', 'pwsh', 'write', 'file_write', 'edit', 'file_edit', 'deleteFile', 'mysql', 'web_fetch', 'inject_js', 'open_browser_window', 'mcp_call', 'skill_execute'];
  for (const tool of risky) {
    assert.strictEqual(approval.needsApproval(tool, 'risky'), true, tool);
  }
  const safe = ['read', 'file_read', 'read_lines', 'glob', 'file_glob', 'grep', 'file_grep', 'todo_write', 'city_time', 'mcp_list_servers', 'mcp_get_tools', 'skill_list', 'skill_load'];
  for (const tool of safe) {
    assert.strictEqual(approval.needsApproval(tool, 'risky'), false, tool);
  }
});

test('needsApproval: режим all — всё требует подтверждения', () => {
  for (const tool of ['read', 'bash', 'glob', 'unknown_tool']) {
    assert.strictEqual(approval.needsApproval(tool, 'all'), true, tool);
  }
  assert.strictEqual(approval.needsApproval(undefined, 'all'), true);
});

test('needsApproval: неизвестный режим трактуется как off', () => {
  assert.strictEqual(approval.needsApproval('bash', undefined), false);
  assert.strictEqual(approval.needsApproval('bash', 'sometimes'), false);
});

test('isRiskyTool распознаёт псевдонимы и некорректный ввод', () => {
  assert.strictEqual(approval.isRiskyTool('executeCommand'), true);
  assert.strictEqual(approval.isRiskyTool('webFetch'), true);
  assert.strictEqual(approval.isRiskyTool('read'), false);
  assert.strictEqual(approval.isRiskyTool(null), false);
  assert.strictEqual(approval.isRiskyTool(42), false);
});

test('isDenialError: только отказы пользователя', () => {
  assert.strictEqual(approval.isDenialError(approval.DENIED_TOOL_ERROR), true);
  assert.strictEqual(approval.isDenialError(approval.DENIED_JS_ERROR), true);
  assert.strictEqual(approval.isDenialError('User denied this tool call'), true);
  assert.strictEqual(approval.isDenialError('SyntaxError: unexpected token'), false);
  assert.strictEqual(approval.isDenialError(''), false);
  assert.strictEqual(approval.isDenialError(null), false);
});

test('сессионная память «Разрешить всегда» работает и сбрасывается', () => {
  approval.resetSessionAllowances();
  assert.strictEqual(approval.isSessionAllowed('read'), false);
  approval.rememberSessionAllowed('read');
  assert.strictEqual(approval.isSessionAllowed('read'), true);
  assert.strictEqual(approval.isSessionAllowed('bash'), false);
  approval.rememberSessionAllowed(null);
  assert.strictEqual(approval.isSessionAllowed(null), true); // согласованное приведение к строке
  approval.resetSessionAllowances();
  assert.strictEqual(approval.isSessionAllowed('read'), false);
});

test('state: дефолтный режим — off (прежнее поведение сохранено)', () => {
  assert.strictEqual(state.toolApprovalMode, 'off');
});

test('denial-флаги содержат маркер, по которому chat-input распознаёт отказ', () => {
  // chat-input.js ветвится на isDenialError(result.error)
  assert.ok(approval.DENIED_TOOL_ERROR.includes('User denied'));
  assert.ok(approval.DENIED_JS_ERROR.includes('User denied'));
});
