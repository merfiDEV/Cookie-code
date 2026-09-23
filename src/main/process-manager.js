/**
 * process-manager.js
 * Отслеживание и экстренная остановка (kill) активных дочерних процессов команд.
 */
const { exec } = require("child_process");

const LONG_PROCESS_THRESHOLD_MS = 10000;

class ProcessManager {
  constructor() {
    this.activeProcesses = new Set();
    // PID, завершённые пользователем через кнопку Kill — чтобы инструменты
    // могли отличить намеренную остановку от обычного ненулевого exit code.
    this.killedPids = new Set();
    // Таймеры уведомления о долгом процессе: child -> timer
    this.longProcessTimers = new Map();
  }

  /** Пометить pid как убитый пользователем (вызывается из killAll). */
  markKilled(pid) {
    if (!pid) return;
    this.killedPids.add(pid);
    // Не держим память бесконечно — чистим старые записи.
    if (this.killedPids.size > 256) {
      const first = this.killedPids.values().next().value;
      this.killedPids.delete(first);
    }
  }

  /** Был ли процесс с данным pid остановлен пользователем. */
  wasKilled(pid) {
    return !!pid && this.killedPids.has(pid);
  }

  track(child, command) {
    if (!child || !child.pid) return;
    this.activeProcesses.add(child);
    const cleanup = () => {
      this.clearLongProcessTimer(child);
      this.activeProcesses.delete(child);
    };
    child.once("exit", cleanup);
    child.once("close", cleanup);
    child.once("error", cleanup);

    if (command && typeof command === "string") {
      this.scheduleLongProcessNotify(child, command);
    }
  }

  scheduleLongProcessNotify(child, command) {
    this.clearLongProcessTimer(child);
    const pid = child.pid;
    const timer = setTimeout(() => {
      this.longProcessTimers.delete(child);
      try {
        const bot = require("../../botsrc");
        if (bot && typeof bot.notifyLongProcess === "function") {
          bot.notifyLongProcess(
            pid,
            command,
            Math.round(LONG_PROCESS_THRESHOLD_MS / 1000),
          );
        }
      } catch (_) {}
    }, LONG_PROCESS_THRESHOLD_MS);
    if (timer.unref) timer.unref();
    this.longProcessTimers.set(child, timer);
  }

  clearLongProcessTimer(child) {
    const timer = this.longProcessTimers.get(child);
    if (timer) {
      clearTimeout(timer);
      this.longProcessTimers.delete(child);
    }
  }

  untrack(child) {
    if (child) {
      this.clearLongProcessTimer(child);
      this.activeProcesses.delete(child);
    }
  }

  /**
   * Убить конкретный активный дочерний процесс по pid (вместе с деревом процессов).
   * Используется кнопкой «Убить процесс» в Telegram для долгих команд.
   * @param {number} pid
   * @returns {Promise<{success: boolean, killed?: boolean, error?: string}>}
   */
  async killProcess(pid) {
    const numPid = Number(pid);
    if (!numPid) return { success: false, error: "pid не задан" };
    let target = null;
    for (const child of this.activeProcesses) {
      if (child && child.pid === numPid) {
        target = child;
        break;
      }
    }
    if (!target) return { success: false, error: "процесс не найден" };
    this.markKilled(numPid);
    this.clearLongProcessTimer(target);
    this.activeProcesses.delete(target);

    if (process.platform === "win32") {
      await new Promise((resolve) => {
        exec(`taskkill /pid ${numPid} /T /F`, { windowsHide: true }, () => {
          try {
            target.kill("SIGKILL");
          } catch (_) {}
          resolve();
        });
      });
    } else {
      try {
        process.kill(-numPid, "SIGKILL");
      } catch (_) {
        try {
          target.kill("SIGKILL");
        } catch (__) {}
      }
    }
    return { success: true, killed: true };
  }

  async killAll() {
    const list = Array.from(this.activeProcesses);
    if (list.length === 0) {
      return { success: true, count: 0 };
    }

    let killedCount = 0;
    const isWin = process.platform === "win32";

    const killPromises = list.map((child) => {
      return new Promise((resolve) => {
        const pid = child.pid;
        if (!pid) {
          resolve();
          return;
        }

        killedCount++;
        this.markKilled(pid);
        if (isWin) {
          exec(`taskkill /pid ${pid} /T /F`, { windowsHide: true }, () => {
            try {
              child.kill("SIGKILL");
            } catch (_) {}
            resolve();
          });
        } else {
          try {
            process.kill(-pid, "SIGKILL");
          } catch (_) {
            try {
              child.kill("SIGKILL");
            } catch (__) {}
          }
          resolve();
        }
      });
    });

    await Promise.all(killPromises);
    this.activeProcesses.clear();
    return { success: true, count: killedCount };
  }
}

const processManager = new ProcessManager();

module.exports = { processManager };
