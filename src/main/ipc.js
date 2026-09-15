/**
 * IPC 处理器注册（渲染进程 → 主进程）
 * 多窗口版：按 event.sender 路由到对应窗口的 profile 上下文。
 */
const { app, dialog, ipcMain, Notification, shell } = require('electron');
const { exec } = require('child_process');
const path = require('path');

const windowState = require('./window');
const profileManager = require('./profile-manager');
const { toolRegistry, jsRunner } = require('./tool-registry');
const { initProject } = require('./project-context');
const { isDangerous } = require('./dangerous-commands');
const settingsStore = require('./settings-store');
const chatExport = require('./chat-export');
const { decodeOutput, normalizeCommand } = require('../../tools/decodeOutput');
const gitDiff = require('./git-diff');
const todoStore = require('./todo-store');
const planMode = require('./plan-mode');

/**
 * Если у окна все задачи выполнены (и список непустой) — пингуем Telegram один раз.
 * Набор id-шников, для которых уже пинговали, чтобы не спамить при повторных вызовах.
 */
const _todoAllDoneNotified = new Set();
const pendingUserQuestions = new Map();
const activeTaskTokens = new Map();
let userQuestionCounter = 0;

function beginTask(senderId) {
  const token = { canceled: false };
  activeTaskTokens.set(senderId, token);
  return token;
}

function isTaskCanceled(senderId, token) {
  return !token || token.canceled || activeTaskTokens.get(senderId) !== token;
}

function finishTask(senderId, token) {
  if (activeTaskTokens.get(senderId) === token) activeTaskTokens.delete(senderId);
}

function requestUserQuestion(sender, questions) {
  const requestId = `question_${Date.now()}_${++userQuestionCounter}`;
  const key = `${sender.id}:${requestId}`;
  return new Promise((resolve, reject) => {
    pendingUserQuestions.set(key, { resolve, reject });
    // Показываем диалог в окне (как раньше).
    try { sender.send('ask-user-question', { requestId, questions }); } catch (_) {}

    // Дублируем вопрос в Telegram с inline-клавиатурой (если бот включён).
    // Кто ответит первым — окно или TG — тот и резолвит promise.
    try {
      const bot = require('../../botsrc');
      bot.askQuestion(requestId, questions).catch(() => {});
    } catch (_) {}
  });
}

/**
 * Резолв вопроса, отвеченного в Telegram (вызывается из botsrc).
 * @returns {boolean} true, если нашли ожидающий вопрос.
 */
function resolveUserQuestionFromTelegram(requestId, answers) {
  for (const [key, pending] of pendingUserQuestions) {
    if (key.endsWith(':' + requestId)) {
      pendingUserQuestions.delete(key);
      // Просим окно закрыть диалог, если он ещё открыт.
      try {
        const senderId = Number(key.split(':')[0]);
        const wc = require('electron').webContents.fromId(senderId);
        if (wc && !wc.isDestroyed()) wc.send('ask-user-question-resolved', { requestId });
      } catch (_) {}
      pending.resolve(Array.isArray(answers) ? answers : []);
      return true;
    }
  }
  return false;
}

// ===== Режим плана =====
const pendingPlanApprovals = new Map();
let planApprovalCounter = 0;

/**
 * Показать план пользователю и дождаться решения (согласие/отказ).
 * @param {Electron.WebContents} sender
 * @param {string} plan — markdown плана
 * @returns {Promise<{approved: boolean}>}
 */
function requestExitPlanMode(sender, plan) {
  const requestId = 'plan_' + Date.now() + '_' + (++planApprovalCounter);
  const key = sender.id + ':' + requestId;
  return new Promise((resolve, reject) => {
    pendingPlanApprovals.set(key, { resolve, reject });
    try { sender.send('exit-plan-mode', { requestId, plan: String(plan || '') }); } catch (_) {}
  });
}

/**
 * Текущий sessionId окна (из его sessionStore). Может быть null (новый чат).
 * @param {Electron.IpcMainEvent|Electron.IpcMainInvokeEvent} event
 * @returns {string|null}
 */
function sessionIdOf(event) {
  const ctx = windowState.getContextByWebContents(event.sender);
  return ctx && ctx.sessionStore ? (ctx.sessionStore.state.currentSessionId || null) : null;
}

function maybeNotifyAllDone(senderId) {
  try {
    const todos = todoStore.getList(senderId);
    if (todos.length === 0) { _todoAllDoneNotified.delete(senderId); return; }
    const done = todos.filter((t) => t.status === 'completed').length;
    if (done === todos.length) {
      if (_todoAllDoneNotified.has(senderId)) return;
      _todoAllDoneNotified.add(senderId);
      try { require('../../botsrc').notifyAllDone(todos); } catch (_) {}
    } else {
      _todoAllDoneNotified.delete(senderId);
    }
  } catch (_) {}
}

/**
 * Вставить изображение в поле чата активного окна.
 * Использует Electron clipboard.writeImage + Ctrl+V.
 * @param {Electron.WebContents} sender
 * @param {string} filePath  абсолютный путь к файлу изображения
 * @param {string} caption   текст перед отправкой (вставляется в textarea)
 * @param {boolean} send     нажать Enter после вставки
 */
async function insertImageToChat(sender, filePath, caption, send) {
  try {
    const { clipboard, nativeImage } = require('electron');
    const fs = require('fs');

    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: `Файл не найден: ${filePath}` };
    }

    // Загружаем изображение в nativeImage и кладём в clipboard
    const img = nativeImage.createFromPath(filePath);
    if (img.isEmpty()) {
      return { success: false, error: `Не удалось загрузить изображение: ${filePath}` };
    }
    clipboard.writeImage(img);

    // Если есть подпись — вставляем текст в textarea
    if (caption && caption.trim()) {
      const safe = JSON.stringify(String(caption));
      const script = `(function(){
        const ta = document.querySelector('textarea[placeholder], textarea[name="search"], textarea.ds-scroll-area');
        if (!ta) return { ok: false, error: 'textarea not found' };
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, ${safe});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
        return { ok: true };
      })()`;
      await sender.executeJavaScript(script, true);
      await new Promise((r) => setTimeout(r, 100));
    } else {
      // Фокусируем textarea без текста
      const script = `(function(){
        const ta = document.querySelector('textarea[placeholder], textarea[name="search"], textarea.ds-scroll-area');
        if (ta) ta.focus();
        return true;
      })()`;
      await sender.executeJavaScript(script, true);
      await new Promise((r) => setTimeout(r, 100));
    }

    // Вставляем изображение из clipboard через Ctrl+V
    sender.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });
    sender.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });
    // Даём React обработать вставку
    await new Promise((r) => setTimeout(r, 300));

    // Если нужно отправить — жмём Enter
    if (send) {
      await new Promise((r) => setTimeout(r, 200));
      sender.sendInputEvent({ type: 'keyDown', keyCode: 'Return', key: 'Enter' });
      sender.sendInputEvent({ type: 'char', keyCode: 'Return', key: '\r' });
      sender.sendInputEvent({ type: 'keyUp', keyCode: 'Return', key: 'Enter' });
    }

    return { success: true };
  } catch (err) {
    console.error('[Cookie Code] insertImageToChat error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Попытаться открыть файл в VS Code (команда code --goto <path>).
 * @param {string} filePath — абсолютный путь
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function tryOpenInVSCode(filePath) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    // Обёртка: code --goto "путь" — откроет файл в VS Code.
    // На Windows 'code' — это code.cmd, доступный через cmd.exe.
    const safePath = String(filePath).replace(/"/g, '""');
    const cmd = process.platform === 'win32'
      ? `cmd /c code --goto "${safePath}"`
      : `code --goto "${safePath}"`;

    exec(cmd, { timeout: 5000 }, (error, _stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: (stderr || error.message || 'code не найден').trim() });
        return;
      }
      resolve({ success: true });
    });
  });
}

function registerIpcHandlers() {
  // Мост Telegram → окно: ответ на вопрос из TG резолвит тот же promise.
  try {
    const bot = require('../../botsrc');
    if (typeof bot.setOnQuestionAnswered === 'function') {
      bot.setOnQuestionAnswered((requestId, answers) => {
        resolveUserQuestionFromTelegram(requestId, answers);
      });
    }
  } catch (_) {}

  // Решение пользователя по плану (согласие/отказ из окна).
  ipcMain.on('exit-plan-mode-response', (event, { requestId, approved } = {}) => {
    if (!requestId) return;
    const key = event.sender.id + ':' + requestId;
    const pending = pendingPlanApprovals.get(key);
    if (!pending) return;
    pendingPlanApprovals.delete(key);
    if (approved) planMode.clearPlanMode(event.sender.id, sessionIdOf(event));
    pending.resolve({ approved: !!approved });
  });

  // Включение/выключение режима плана для текущей сессии окна.
  ipcMain.handle('set-plan-mode', async (event, { enabled } = {}) => {
    const sessionId = sessionIdOf(event);
    planMode.setPlanMode(event.sender.id, sessionId, !!enabled);
    return { success: true, planMode: planMode.isPlanMode(event.sender.id, sessionId), sessionId };
  });

  ipcMain.on('ask-user-question-response', (event, { requestId, answers, canceled } = {}) => {
    if (!requestId) return;
    const key = `${event.sender.id}:${requestId}`;
    const pending = pendingUserQuestions.get(key);
    if (!pending) return;
    pendingUserQuestions.delete(key);
    if (canceled) {
      pending.reject(new Error('Пользователь отменил вопрос'));
      return;
    }
    pending.resolve(Array.isArray(answers) ? answers : []);
  });

  // Whats-new: открыть CHANGELOG.md в системном редакторе (по кнопке в модалке)
  ipcMain.handle('whats-new-open-changelog', async () => {
    try {
      const { shell } = require('electron');
      const path = require('path');
      const candidates = [
        path.join(__dirname, '..', '..', 'CHANGELOG.md'),
        path.join(process.resourcesPath || '', 'CHANGELOG.md'),
      ];
      for (const p of candidates) {
        try {
          if (require('fs').existsSync(p)) {
            const err = await shell.openPath(p);
            return err ? { success: false, error: err } : { success: true };
          }
        } catch (_) {}
      }
      return { success: false, error: 'CHANGELOG.md не найден' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Открыть файл/папку в системе (из file-chip в ответе AI)
  ipcMain.handle('open-path', async (_event, payload) => {
    const targetPath = payload && payload.path;
    if (!targetPath || typeof targetPath !== 'string') {
      return { success: false, error: 'Путь не указан' };
    }
    try {
      const fs = require('fs');
      if (!fs.existsSync(targetPath)) {
        return { success: false, error: 'Файл не найден: ' + targetPath };
      }

      const ext = path.extname(targetPath).toLowerCase();
      const CODE_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']);

      // Скриптовые файлы Windows ассоциирует с Windows Script Host (WSH),
      // который пытается их ВЫПОЛНИТЬ и падает с синтаксической ошибкой.
      // Поэтому для них приоритетно открываем VS Code, при неудаче — проводник.
      if (CODE_EXTS.has(ext)) {
        const opened = await tryOpenInVSCode(targetPath);
        if (opened.success) return { success: true, openedWith: 'vscode' };
        // VS Code недоступен — показываем файл в проводнике (безопасно).
        try {
          shell.showItemInFolder(targetPath);
          return { success: true, openedWith: 'explorer', note: opened.error };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }

      // Остальные файлы — обычным способом
      const errorMsg = await shell.openPath(targetPath);
      if (errorMsg) {
        return { success: false, error: errorMsg };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 初始化项目
  ipcMain.handle('init-project', async (event, { skipPrompt = false } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    return initProject(skipPrompt, ctx);
  });

  // 列出会话
  ipcMain.handle('list-sessions', async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const store = ctx ? ctx.sessionStore : null;
    if (!store || !store.state.selectedProjectDir) {
      return { success: true, sessions: [] };
    }
    const all = store.readSessionStore();
    const sessions = Object.keys(all).filter(id => all[id] === store.state.selectedProjectDir);
    return { success: true, sessions };
  });

  // 列出项目文件（用于 @ 文件提及自动补全）
  // 返回 { success, files: [{ rel, abs }] }，rel 为相对 projectDir 的路径，abs 为绝对路径。
  ipcMain.handle('list-project-files', async (event, { query = '' } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const store = ctx ? ctx.sessionStore : null;
    const projectDir = store ? store.state.selectedProjectDir : null;
    if (!projectDir) return { success: true, files: [] };

    try {
      const path = require('path');
      const { buildGlobArgs, runRipgrep } = require('../../tools/GlobToolNew');
      const safeQuery = String(query || '').replace(/[\\*?\[\]]/g, '');
      const pattern = safeQuery ? '**/*' + safeQuery + '*' : '**/*';
      const args = buildGlobArgs({ pattern });
      const { stdout } = await runRipgrep(args, projectDir);
      const files = stdout
        .split(/\r?\n/)
        .map((p) => p.replace(/\\/g, '/').replace(/^\.\//, ''))
        .filter((p) => p.length > 0)
        .map((rel) => ({ rel, abs: path.join(projectDir, rel), isDir: false }));

      // Дополнительно собираем директории проекта (ripgrep их не отдаёт).
      const IGNORE_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', 'coverage', '.next', '.cache', '.vscode', '.idea']);
      const dirs = [];
      (function walk(absDir, relDir) {
        let entries;
        try { entries = require('fs').readdirSync(absDir, { withFileTypes: true }); } catch (_) { return; }
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          if (IGNORE_DIRS.has(e.name)) continue;
          const rel = relDir ? relDir + '/' + e.name : e.name;
          if (safeQuery && !rel.includes(safeQuery)) { /* всё равно заходим глубже */ }
          dirs.push({ rel, abs: path.join(projectDir, rel), isDir: true });
          walk(path.join(absDir, e.name), rel);
        }
      })(projectDir, '');

      const q = safeQuery.toLowerCase();
      const matchDir = (d) => !q || d.rel.toLowerCase().includes(q);
      const matchFile = (f) => !q || f.rel.toLowerCase().includes(q);

      const dirList = dirs.filter(matchDir).sort((a, b) => a.rel.localeCompare(b.rel));
      const fileList = files.filter(matchFile).sort((a, b) => a.rel.localeCompare(b.rel));

      const merged = dirList.concat(fileList).slice(0, 100);
      return { success: true, files: merged };
    } catch (err) {
      return { success: false, error: err.message, files: [] };
    }
  });

  // 导航到会话
  ipcMain.handle('navigate-session', async (event, { sessionId }) => {
    if (!sessionId) return { success: false, error: '缺少会话ID' };
    const ctx = windowState.getContextByWebContents(event.sender);
    const win = ctx ? ctx.win : null;
    if (!win || win.isDestroyed()) return { success: false, error: '窗口已关闭' };
    // 按当前 provider 拼会话 URL（DeepSeek /chat/s/ 等）
    let url = null;
    try {
      const { getProviderByUrl } = require('../providers');
      const provider = getProviderByUrl(win.webContents.getURL());
      if (provider && typeof provider.sessionUrlBase === 'string' && provider.sessionUrlBase) {
        url = provider.sessionUrlBase + sessionId;
      }
    } catch (_) { /* 回退 DeepSeek */ }
    if (!url) url = 'https://chat.deepseek.com/a/chat/s/' + sessionId;
    try {
      await win.webContents.loadURL(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Открыть новый чат (переход на домашнюю страницу провайдера).
  ipcMain.handle('new-chat', async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const win = ctx ? ctx.win : null;
    if (!win || win.isDestroyed()) return { success: false, error: '窗口已关闭' };
    let url = null;
    try {
      const { getProviderByUrl } = require('../providers');
      const provider = getProviderByUrl(win.webContents.getURL());
      if (provider && provider.homeUrl) url = provider.homeUrl;
    } catch (_) {}
    if (!url) url = 'https://chat.deepseek.com/';
    try {
      await win.webContents.loadURL(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 执行命令
  ipcMain.handle('execute-command', async (event, { command, id }) => {
    if (!command || typeof command !== 'string') {
      return { id, success: false, error: '无效的命令' };
    }
    const trimmed = normalizeCommand(command.trim());
    if (!trimmed) return { id, success: false, error: '命令为空' };

    const ctx = windowState.getContextByWebContents(event.sender);
    const win = ctx ? ctx.win : windowState.getMainWindow();
    const store = ctx ? ctx.sessionStore : null;
    const selectedDir = store ? store.state.selectedProjectDir : null;

    const dangerWarning = isDangerous(trimmed) ? '\n\n⚠️ 警告：此命令可能存在风险，请谨慎确认！' : '';
    const result = await dialog.showMessageBox(win, {
      type: isDangerous(trimmed) ? 'warning' : 'question',
      buttons: ['取消', '确认执行'],
      defaultId: 0,
      cancelId: 0,
      title: '确认执行命令',
      message: '将执行以下命令：',
      detail: trimmed + dangerWarning,
    });
    if (result.response !== 1) {
      return { id, success: false, error: '用户取消了执行', canceled: true };
    }
    return new Promise((resolve) => {
      const { processManager } = require('./process-manager');
      const child = exec(
        trimmed,
        {
          cwd: selectedDir || process.env.USERPROFILE || app.getPath('home'),
          timeout: 30000,
          maxBuffer: 1024 * 1024,
          encoding: 'buffer',
        },
        (error, stdout, stderr) => {
          const wasKilledByUser = processManager.wasKilled(child.pid);
          processManager.untrack(child);
          resolve({
            id,
            success: !error && !wasKilledByUser,
            stdout: decodeOutput(stdout),
            stderr: decodeOutput(stderr),
            error: wasKilledByUser ? '执行已被用户停止' : (error ? error.message : null),
            canceled: wasKilledByUser,
          });
        }
      );
      processManager.track(child);
    });
  });

  // 执行工具
  ipcMain.handle('execute-tool', async (event, { toolName, params, callId }) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const store = ctx ? ctx.sessionStore : null;
    const selectedDir = store ? store.state.selectedProjectDir : null;

    // Режим плана: блокируем изменяющие инструменты (кроме записи plan.md).
    if (planMode.isPlanMode(event.sender.id, sessionIdOf(event))) {
      const verdict = planMode.checkBlocked(toolName, params || {});
      if (verdict.blocked) {
        return { callId, success: false, error: verdict.error };
      }
    }

    const taskToken = beginTask(event.sender.id);
    try {
      const result = await toolRegistry.execute(toolName, {
        ...params,
        projectDir: selectedDir,
        senderId: event.sender.id,
        askUserQuestion: (questions) => requestUserQuestion(event.sender, questions),
        pasteImage: (filePath, caption, send) => insertImageToChat(event.sender, filePath, caption, send),
        exitPlanMode: (plan) => requestExitPlanMode(event.sender, plan),
      });
      if (isTaskCanceled(event.sender.id, taskToken)) {
        return { callId, success: false, canceled: true, error: '执行已被用户停止' };
      }
      // Если менялся todo-список — пушим обновление в окно
      if (toolName === 'todo_write' || toolName === 'todo_edit' || toolName === 'todo_delete') {
        try { event.sender.send('todo-updated', { todos: todoStore.getList(event.sender.id) }); } catch (_) {}
        maybeNotifyAllDone(event.sender.id);
      }
      // Уведомление в Telegram (не блокирует ответ).
      try {
        const preview = result.success
          ? (typeof result.data === 'string' ? result.data : '')
          : (result.error || '');
        const exitMatch = String(preview).match(/\[exit code:\s*(-?\d+)\]/);
        const hasBadExit = !!(exitMatch && exitMatch[1] !== '0');
        const ok = !!result.success && !hasBadExit;
        require('../../botsrc').notifyToolResult(toolName, ok, { args: params, preview });
      } catch (_) {}
      return { callId, success: result.success, data: result.data, error: result.error };
    } catch (err) {
      try {
        require('../../botsrc').notifyToolResult(toolName, false, err.message);
      } catch (_) {}
      return { callId, success: false, error: err.message };
    } finally {
      finishTask(event.sender.id, taskToken);
    }
  });

  // ========== Вставка изображения в поле чата (read_photo) ==========
  // IPC-хэндлер, вызываемый рендер-процессом (для будущего использования из overlay).
  ipcMain.handle('chat-insert-image', async (event, { filePath, caption, send } = {}) => {
    return insertImageToChat(event.sender, filePath, String(caption || ''), send !== false);
  });

  // AI 回复完成时：窗口已聚焦则不打扰；否则弹通知并让任务栏/Dock 闪烁
  ipcMain.handle('show-ai-notification', async (event) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const win = ctx ? ctx.win : windowState.getMainWindow();

      if (win && !win.isDestroyed() && win.isFocused()) {
        // 用户正在查看该窗口，不弹通知、不闪烁
        return { success: true, skipped: true, reason: 'window-focused' };
      }

      if (win && !win.isDestroyed()) {
        let windowName = 'Cookie Code';
        if (ctx && ctx.profileId) {
          const profile = profileManager.getProfileById(ctx.profileId);
          if (profile && profile.name) windowName = profile.name;
        }

        const lang = settingsStore.getSetting('language') === 'en' ? 'en' : 'ru';
        const notifText = {
          ru: { title: 'AI завершил задачу', body: 'AI завершил ответ' },
          en: { title: 'AI task completed', body: 'AI has finished responding' },
        }[lang];

        const notification = new Notification({
          title: windowName + ' - ' + notifText.title,
          body: notifText.body,
          icon: require('path').join(__dirname, '..', '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
        });

        // Клик по уведомлению — сфокусировать окно (восстановить из свёрнутого/трея).
        notification.on('click', () => {
          try {
            if (!win || win.isDestroyed()) return;
            if (win.isMinimized()) win.restore();
            if (!win.isVisible()) win.show();
            win.focus();
            win.flashFrame(false);
          } catch (err) {
            console.error('[Cookie Code] notification click focus error:', err.message);
          }
        });

        notification.show();

        win.flashFrame(true);
        win.once('focus', () => {
          if (!win.isDestroyed()) win.flashFrame(false);
        });
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Остановить текущую задачу окна и активные дочерние процессы.
  // AI-ответ может выполняться без child process, поэтому одного killAll() недостаточно.
  ipcMain.handle('kill-process', async (event) => {
    try {
      const taskToken = activeTaskTokens.get(event.sender.id);
      if (taskToken) taskToken.canceled = true;
      const { processManager } = require('./process-manager');
      const result = await processManager.killAll();
      const ctx = windowState.getContextByWebContents(event.sender);
      const win = ctx && ctx.win;
      if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        try { win.webContents.stop(); } catch (_) {}
      }
      return { success: true, stopped: true, count: result.count };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 执行 JS 脚本
  ipcMain.handle('execute-js', async (event, { code, callId }) => {
    if (!code || typeof code !== 'string') {
      return { callId, success: false, error: '无效的 JS 代码' };
    }
    const ctx = windowState.getContextByWebContents(event.sender);
    const store = ctx ? ctx.sessionStore : null;
    const selectedDir = store ? store.state.selectedProjectDir : null;
    const taskToken = beginTask(event.sender.id);
    try {
      const before = JSON.stringify(todoStore.getList(event.sender.id));
      const result = await jsRunner.run(
        code,
        selectedDir,
        event.sender.id,
        (questions) => requestUserQuestion(event.sender, questions),
        (filePath, caption, send) => insertImageToChat(event.sender, filePath, caption, send),
        (plan) => requestExitPlanMode(event.sender, plan),
        sessionIdOf(event)
      );
      if (isTaskCanceled(event.sender.id, taskToken)) {
        return { callId, success: false, canceled: true, error: '执行已被用户停止' };
      }
      const after = JSON.stringify(todoStore.getList(event.sender.id));
      if (before !== after) {
        try { event.sender.send('todo-updated', { todos: todoStore.getList(event.sender.id) }); } catch (_) {}
        maybeNotifyAllDone(event.sender.id);
      }
      return { callId, ...result };
    } catch (err) {
      return { callId, success: false, error: err.message };
    } finally {
      finishTask(event.sender.id, taskToken);
    }
  });

  // 站点原生发送：向聚焦输入框注入真实级 Enter（智谱只响应 isTrusted=true 的输入，合成事件免疫）
  ipcMain.handle('chat-send-enter', async (event) => {
    const sender = event.sender;
    if (!sender || sender.isDestroyed()) return false;
    try {
      sender.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      sender.sendInputEvent({ type: 'char', keyCode: 'Enter', key: '\r' });
      sender.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
      console.log('[Cookie Code] native Enter отправлен в окно');
      return true;
    } catch (err) {
      console.error('[Cookie Code] ❌ 原生 Enter 发送失败:', err.message);
      return false;
    }
  });

  // ========== Cookie Code 用户设置 (settings.json) ==========
  ipcMain.handle('cuckoo-settings-get-all', async () => {
    return settingsStore.readSettings();
  });

  ipcMain.handle('cuckoo-settings-set', async (_event, { key, value }) => {
    if (!key || typeof key !== 'string') {
      return { success: false, error: '无效的 key' };
    }
    const result = settingsStore.setSetting(key, value);
    if (!result) return { success: false, error: '写入失败' };
    return { success: true, settings: result };
  });

  // ========== Telegram-бот (botsrc/) ==========
  ipcMain.handle('telegram-apply', async () => {
    try {
      const bot = require('../../botsrc');
      const status = await bot.applySettings();
      return { success: true, status };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('telegram-status', async () => {
    try {
      const bot = require('../../botsrc');
      return { success: true, status: bot.getStatus() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('telegram-ping', async () => {
    try {
      const bot = require('../../botsrc');
      return await bot.ping();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('telegram-test', async () => {
    try {
      const bot = require('../../botsrc');
      return await bot.testSend();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Ответ AI → в Telegram (для просмотра с телефона).
  ipcMain.handle('telegram-notify-ai', async (_event, { text } = {}) => {
    try {
      const bot = require('../../botsrc');
      return await bot.notifyAIResponse(text);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('telegram-approval-request', async (_event, { requestId, info } = {}) => {
    try {
      const bot = require('../../botsrc');
      return await bot.requestApproval(requestId, info || {});
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('telegram-approval-cancel', async (_event, { requestId } = {}) => {
    try {
      const bot = require('../../botsrc');
      return bot.cancelApproval(requestId);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ========== Экспорт ответа AI в PDF / DOCX ==========
  ipcMain.handle('cuckoo-chat-export', async (_event, payload) => {
    try {
      console.log('[Cookie Code] chat-export: получен запрос, format =', payload && payload.format, ', html.length =', payload && payload.html && payload.html.length);
      const result = await chatExport.exportChat(payload || {});
      console.log('[Cookie Code] chat-export: результат =', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('[Cookie Code] chat-export error:', err.message, err.stack);
      return { success: false, error: err.message };
    }
  });

  // ========== Todo-задачи окна ==========
  ipcMain.handle('todo-get', async (event) => {
    try {
      return { success: true, todos: todoStore.getList(event.sender.id) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('todo-clear', async (event) => {
    try {
      todoStore.clear(event.sender.id);
      try { event.sender.send('todo-updated', { todos: [] }); } catch (_) {}
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ========== Git diff (панель «Изменения») ==========
  // Список изменённых файлов в текущем проекте (git status).
  ipcMain.handle('git-status', async (event) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      return await gitDiff.getStatus(projectDir);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  // Unified diff одного файла.
  ipcMain.handle('git-diff-file', async (event, { filePath, status } = {}) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      if (!filePath) return { success: false, reason: 'filePath is required' };
      return await gitDiff.getFileDiff(projectDir, filePath, status);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  // ========== Git history (вкладка «История») ==========
  ipcMain.handle('git-log', async (event, { limit } = {}) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      return await gitDiff.getLog(projectDir, limit || 20);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('git-commit-files', async (event, { hash } = {}) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      return await gitDiff.getCommitFiles(projectDir, hash);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('git-commit-file-diff', async (event, { hash, filePath } = {}) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      return await gitDiff.getCommitFileDiff(projectDir, hash, filePath);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('git-commit-diff', async (event, { hash } = {}) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      return await gitDiff.getCommitDiff(projectDir, hash);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  // Открыть файл настроек (cuckoo-settings.json) системным редактором.
  // Если файла ещё нет — создаём его с дефолтами, чтобы редактор не ругался.
  ipcMain.handle('cuckoo-settings-open-file', async () => {
    try {
      const fs = require('fs');
      const file = settingsStore.getSettingsPath();
      if (!fs.existsSync(file)) {
        settingsStore.writeSettings(settingsStore.readSettings());
      }
      const errMsg = await shell.openPath(file);
      if (errMsg) return { success: false, error: errMsg };
      return { success: true, path: file };
    } catch (err) {
      console.error('[Cookie Code] 打开 settings.json 失败:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ========== Пользовательские фоны (userData/backgrounds) ==========
  // Папка: <userData>/backgrounds — пользователь кладёт туда картинки,
  // они автоматически появляются в выборе фонов в настройках.
  const CUSTOM_BG_EXT = ['.webp', '.jpg', '.jpeg', '.png', '.gif'];
  const getCustomBackgroundsDir = () => path.join(app.getPath('userData'), 'backgrounds');

  ipcMain.handle('cuckoo-backgrounds-list', async () => {
    try {
      const fs = require('fs');
      const dir = getCustomBackgroundsDir();
      fs.mkdirSync(dir, { recursive: true });
      const files = fs.readdirSync(dir).filter((f) => {
        return CUSTOM_BG_EXT.includes(path.extname(f).toLowerCase());
      });
      const list = files.map((f) => {
        const ext = path.extname(f);
        const base = f.slice(0, -ext.length);
        return {
          id: 'custom:' + base,
          label: base,
          file: path.join(dir, f),
          custom: true,
        };
      });
      return { success: true, dir, backgrounds: list };
    } catch (err) {
      console.error('[Cookie Code] 读取 пользовательских фонов失败:', err.message);
      return { success: false, error: err.message, dir: getCustomBackgroundsDir(), backgrounds: [] };
    }
  });

  // Открыть папку с пользовательскими фонами в системном проводнике.
  ipcMain.handle('cuckoo-backgrounds-open-folder', async () => {
    try {
      const fs = require('fs');
      const dir = getCustomBackgroundsDir();
      fs.mkdirSync(dir, { recursive: true });
      const errMsg = await shell.openPath(dir);
      if (errMsg) return { success: false, error: errMsg };
      return { success: true, path: dir };
    } catch (err) {
      console.error('[Cookie Code] 打开 папку фонов失败:', err.message);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerIpcHandlers, resolveUserQuestionFromTelegram };
