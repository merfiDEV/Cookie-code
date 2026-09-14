/**
 * Панель «Изменения» (git) с вкладками «Изменения» / «История».
 * - Изменения: список изменённых файлов (git status) → клик → окно с unified diff.
 * - История: список последних коммитов → клик → файлы коммита → клик → окно с diff;
 *   кнопка «Весь коммит» показывает полный diff коммита.
 */
const { showToast } = require('./ui');
const { t } = require('../i18n/i18n');

const PANEL_ID = 'cuckoo-diff-panel';
const LIST_ID = 'cuckoo-diff-list';
const LOG_LIST_ID = 'cuckoo-git-log-list';
const COMMIT_FILES_ID = 'cuckoo-commit-files';
const COMMIT_FILES_LIST_ID = 'cuckoo-commit-files-list';
const VIEWER_ID = 'cuckoo-diff-viewer';

const COMMITS_LIMIT = 20;

let currentCommit = null; // { hash, subject }

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function statusLabel(status) {
  switch (status) {
    case 'modified': return { txt: 'M', cls: 'modified' };
    case 'added': return { txt: 'A', cls: 'added' };
    case 'deleted': return { txt: 'D', cls: 'deleted' };
    case 'renamed': return { txt: 'R', cls: 'renamed' };
    case 'untracked': return { txt: 'U', cls: 'untracked' };
    default: return { txt: '?', cls: 'changed' };
  }
}

// ================= Вкладки =================

function setActiveTab(tab) {
  const tChanges = document.getElementById('cuckoo-diff-tab-changes');
  const tHistory = document.getElementById('cuckoo-diff-tab-history');
  const bodyChanges = document.getElementById(LIST_ID);
  const bodyHistory = document.getElementById(LOG_LIST_ID);
  const commitFiles = document.getElementById(COMMIT_FILES_ID);

  const isChanges = tab === 'changes';
  tChanges?.classList.toggle('active', isChanges);
  tHistory?.classList.toggle('active', !isChanges);
  bodyChanges?.classList.toggle('cuckoo-hidden', !isChanges);
  // При переключении на «Историю» прячем список коммитов только если не открыт коммит
  if (bodyHistory) bodyHistory.classList.toggle('cuckoo-hidden', isChanges || !!currentCommit);
  if (commitFiles) commitFiles.classList.toggle('cuckoo-hidden', isChanges || !currentCommit);

  if (isChanges) {
    currentCommit = null;
    renderDiffList();
  } else {
    renderGitLog();
  }
}

// ================= Вкладка «Изменения» =================

async function renderDiffList() {
  const list = document.getElementById(LIST_ID);
  if (!list) return;
  list.innerHTML = '<div class="cuckoo-session-empty">' + t('diff.loading') + '</div>';
  try {
    const res = await window.electronAPI.gitStatus();
    if (!res || !res.success) {
      list.innerHTML = '<div class="cuckoo-session-empty">' + escapeHtml(res && res.reason || t('diff.gitNotFound')) + '</div>';
      return;
    }
    const files = res.files || [];
    if (files.length === 0) {
      list.innerHTML = '<div class="cuckoo-session-empty">' + t('diff.noChanges') + '</div>';
      return;
    }
    list.innerHTML = files.map(f => {
      const s = statusLabel(f.status);
      return '<div class="cuckoo-diff-file" data-path="' + escapeHtml(f.path) + '" data-status="' + escapeHtml(f.status) + '" title="' + escapeHtml(f.path) + '">' +
        '<span class="cuckoo-diff-file-badge ' + s.cls + '">' + s.txt + '</span>' +
        '<span class="cuckoo-diff-file-path">' + escapeHtml(f.path) + '</span>' +
      '</div>';
    }).join('');

    list.querySelectorAll('.cuckoo-diff-file').forEach(el => {
      el.addEventListener('click', () => {
        list.querySelectorAll('.cuckoo-diff-file').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        openDiffViewer(el.dataset.path, el.dataset.status);
      });
    });
  } catch (err) {
    list.innerHTML = '<div class="cuckoo-session-empty">' + t('diff.errorPrefix', { msg: escapeHtml(err.message || err) }) + '</div>';
  }
}

// ================= Вкладка «История» =================

async function renderGitLog() {
  const list = document.getElementById(LOG_LIST_ID);
  if (!list) return;
  list.innerHTML = '<div class="cuckoo-session-empty">' + t('diff.loading') + '</div>';
  try {
    const res = await window.electronAPI.gitLog(COMMITS_LIMIT);
    if (!res || !res.success) {
      list.innerHTML = '<div class="cuckoo-session-empty">' + escapeHtml(res && res.reason || t('diff.gitNotFound')) + '</div>';
      return;
    }
    const commits = res.commits || [];
    if (commits.length === 0) {
      list.innerHTML = '<div class="cuckoo-session-empty">' + t('diff.noCommits') + '</div>';
      return;
    }
    list.innerHTML = commits.map(c =>
      '<div class="cuckoo-commit-item" data-hash="' + escapeHtml(c.hash) + '" data-subject="' + escapeHtml(c.subject) + '">' +
        '<span class="cuckoo-commit-subject-line">' + escapeHtml(c.subject) + '</span>' +
        '<span class="cuckoo-commit-meta-line"><span class="cuckoo-commit-hash">' + escapeHtml(c.short) + '</span> · ' + escapeHtml(c.author) + ' · ' + escapeHtml(c.date) + '</span>' +
      '</div>'
    ).join('');

    list.querySelectorAll('.cuckoo-commit-item').forEach(el => {
      el.addEventListener('click', () => {
        openCommitFiles(el.dataset.hash, el.dataset.subject);
      });
    });
  } catch (err) {
    list.innerHTML = '<div class="cuckoo-session-empty">' + t('diff.errorPrefix', { msg: escapeHtml(err.message || err) }) + '</div>';
  }
}

/** Открыть список файлов коммита. */
async function openCommitFiles(hash, subject) {
  currentCommit = { hash, subject };
  const logList = document.getElementById(LOG_LIST_ID);
  const commitFiles = document.getElementById(COMMIT_FILES_ID);
  const filesList = document.getElementById(COMMIT_FILES_LIST_ID);
  const subjectEl = document.getElementById('cuckoo-commit-subject');

  if (logList) logList.classList.add('cuckoo-hidden');
  if (commitFiles) commitFiles.classList.remove('cuckoo-hidden');
  if (subjectEl) subjectEl.textContent = subject || '';
  if (filesList) filesList.innerHTML = '<div class="cuckoo-session-empty">' + t('diff.loading') + '</div>';

  try {
    const res = await window.electronAPI.gitCommitFiles(hash);
    if (!res || !res.success) {
      filesList.innerHTML = '<div class="cuckoo-session-empty">' + escapeHtml(res && res.reason || t('diff.error')) + '</div>';
      return;
    }
    const files = res.files || [];
    if (files.length === 0) {
      filesList.innerHTML = '<div class="cuckoo-session-empty">' + t('diff.noFiles') + '</div>';
      return;
    }
    filesList.innerHTML = files.map(f => {
      const s = statusLabel(f.status);
      return '<div class="cuckoo-diff-file" data-path="' + escapeHtml(f.path) + '" title="' + escapeHtml(f.path) + '">' +
        '<span class="cuckoo-diff-file-badge ' + s.cls + '">' + s.txt + '</span>' +
        '<span class="cuckoo-diff-file-path">' + escapeHtml(f.path) + '</span>' +
      '</div>';
    }).join('');

    filesList.querySelectorAll('.cuckoo-diff-file').forEach(el => {
      el.addEventListener('click', async () => {
        filesList.querySelectorAll('.cuckoo-diff-file').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        await openCommitFileViewer(currentCommit.hash, el.dataset.path);
      });
    });
  } catch (err) {
    filesList.innerHTML = '<div class="cuckoo-session-empty">' + t('diff.errorPrefix', { msg: escapeHtml(err.message || err) }) + '</div>';
  }
}

/** Вернуться к списку коммитов. */
function backToLog() {
  currentCommit = null;
  const logList = document.getElementById(LOG_LIST_ID);
  const commitFiles = document.getElementById(COMMIT_FILES_ID);
  if (logList) logList.classList.remove('cuckoo-hidden');
  if (commitFiles) commitFiles.classList.add('cuckoo-hidden');
}

// ================= Окно просмотра diff =================

function renderUnifiedDiff(diffText) {
  if (!diffText || !diffText.trim()) {
    return '<div class="cuckoo-diff-empty">' + t('diff.empty') + '</div>';
  }
  const lines = diffText.split(/\r?\n/);
  const html = lines.map(line => {
    let cls = 'ctx';
    if (line.startsWith('+++') || line.startsWith('---')) cls = 'meta';
    else if (line.startsWith('@@')) cls = 'hunk';
    else if (line.startsWith('commit ') || line.startsWith('Author:') || line.startsWith('Date:') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('similarity') || line.startsWith('rename ')) cls = 'meta';
    else if (line.startsWith('+')) cls = 'add';
    else if (line.startsWith('-')) cls = 'del';
    return '<div class="cuckoo-diff-line ' + cls + '"><span class="cuckoo-diff-text">' + escapeHtml(line) + '</span></div>';
  }).join('');
  return '<pre class="cuckoo-diff-code">' + html + '</pre>';
}

async function openDiffViewer(filePath, status) {
  const viewer = document.getElementById(VIEWER_ID);
  if (!viewer) return;
  const titleEl = viewer.querySelector('#cuckoo-diff-viewer-title');
  const bodyEl = viewer.querySelector('#cuckoo-diff-viewer-body');
  if (titleEl) titleEl.textContent = filePath;
  if (bodyEl) bodyEl.innerHTML = '<div class="cuckoo-diff-empty">' + t('diff.loading') + '</div>';
  viewer.classList.remove('cuckoo-hidden');
  try {
    const res = await window.electronAPI.gitDiffFile(filePath, status);
    if (!res || !res.success) {
      bodyEl.innerHTML = '<div class="cuckoo-diff-empty">' + escapeHtml(res && res.reason || t('diff.diffFailed')) + '</div>';
      return;
    }
    bodyEl.innerHTML = renderUnifiedDiff(res.diff || '');
  } catch (err) {
    bodyEl.innerHTML = '<div class="cuckoo-diff-empty">' + t('diff.errorPrefix', { msg: escapeHtml(err.message || err) }) + '</div>';
  }
}

async function openCommitFileViewer(hash, filePath) {
  const viewer = document.getElementById(VIEWER_ID);
  if (!viewer) return;
  const titleEl = viewer.querySelector('#cuckoo-diff-viewer-title');
  const bodyEl = viewer.querySelector('#cuckoo-diff-viewer-body');
  if (titleEl) titleEl.textContent = filePath + ' @ ' + (hash || '').slice(0, 7);
  if (bodyEl) bodyEl.innerHTML = '<div class="cuckoo-diff-empty">' + t('diff.loading') + '</div>';
  viewer.classList.remove('cuckoo-hidden');
  try {
    const res = await window.electronAPI.gitCommitFileDiff(hash, filePath);
    if (!res || !res.success) {
      bodyEl.innerHTML = '<div class="cuckoo-diff-empty">' + escapeHtml(res && res.reason || t('diff.diffFailed')) + '</div>';
      return;
    }
    bodyEl.innerHTML = renderUnifiedDiff(res.diff || '');
  } catch (err) {
    bodyEl.innerHTML = '<div class="cuckoo-diff-empty">' + t('diff.errorPrefix', { msg: escapeHtml(err.message || err) }) + '</div>';
  }
}

async function openCommitFullDiff() {
  if (!currentCommit) return;
  const viewer = document.getElementById(VIEWER_ID);
  if (!viewer) return;
  const titleEl = viewer.querySelector('#cuckoo-diff-viewer-title');
  const bodyEl = viewer.querySelector('#cuckoo-diff-viewer-body');
  if (titleEl) titleEl.textContent = t('diff.commit.titlePrefix') + (currentCommit.hash || '').slice(0, 7);
  if (bodyEl) bodyEl.innerHTML = '<div class="cuckoo-diff-empty">' + t('diff.loading') + '</div>';
  viewer.classList.remove('cuckoo-hidden');
  try {
    const res = await window.electronAPI.gitCommitDiff(currentCommit.hash);
    if (!res || !res.success) {
      bodyEl.innerHTML = '<div class="cuckoo-diff-empty">' + escapeHtml(res && res.reason || t('diff.diffFailed')) + '</div>';
      return;
    }
    bodyEl.innerHTML = renderUnifiedDiff(res.diff || '');
  } catch (err) {
    bodyEl.innerHTML = '<div class="cuckoo-diff-empty">' + t('diff.errorPrefix', { msg: escapeHtml(err.message || err) }) + '</div>';
  }
}

function closeDiffViewer() {
  const viewer = document.getElementById(VIEWER_ID);
  if (viewer) viewer.classList.add('cuckoo-hidden');
}

// ================= Панель =================

function openDiffPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel.classList.remove('cuckoo-hidden');
  currentCommit = null;
  setActiveTab('changes');
}

function closeDiffPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel.classList.add('cuckoo-hidden');
  closeDiffViewer();
}

function toggleDiffPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  if (panel.classList.contains('cuckoo-hidden')) openDiffPanel();
  else closeDiffPanel();
}

module.exports = {
  openDiffPanel, closeDiffPanel, toggleDiffPanel,
  renderDiffList, renderGitLog, closeDiffViewer,
  setActiveTab, backToLog, openCommitFullDiff,
};
