'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const { processManager } = require('../../src/main/process-manager');

test('ProcessManager: track и untrack очищают таймеры и процессы', () => {
  const fakeChild = {
    pid: 999999,
    once: () => {},
  };
  processManager.track(fakeChild, 'ping 127.0.0.1');
  assert.ok(processManager.activeProcesses.has(fakeChild));
  assert.ok(processManager.longProcessTimers.has(fakeChild));

  processManager.untrack(fakeChild);
  assert.strictEqual(processManager.activeProcesses.has(fakeChild), false);
  assert.strictEqual(processManager.longProcessTimers.has(fakeChild), false);
});

test('ProcessManager: killProcess для несуществующего pid возвращает ошибку', async () => {
  const r = await processManager.killProcess(1234567);
  assert.strictEqual(r.success, false);
  assert.ok(/не найден/.test(r.error));
});

test('ProcessManager: killProcess завершает реальный процесс и помечает killed', async () => {
  const isWin = process.platform === 'win32';
  const child = isWin
    ? spawn('ping', ['-n', '20', '127.0.0.1'], { windowsHide: true })
    : spawn('sleep', ['20']);

  assert.ok(child.pid);
  processManager.track(child, 'ping test');

  assert.ok(processManager.activeProcesses.has(child));
  const pid = child.pid;

  const result = await processManager.killProcess(pid);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.killed, true);
  assert.strictEqual(processManager.wasKilled(pid), true);
  assert.strictEqual(processManager.activeProcesses.has(child), false);
});
