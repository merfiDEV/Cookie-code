/**
 * Git-операции (порт идей VS Code git-extension): push/pull/fetch/commit,
 * статус ветки (upstream, ahead/behind), remote.
 * Все команды — через child_process.execFile("git", args), cwd = projectDir.
 */
const { execFile } = require("child_process");

/** Запустить git в каталоге проекта. Возвращает { ok, stdout, stderr, code }. */
function runGit(projectDir, args) {
  return new Promise((resolve) => {
    try {
      execFile(
        "git",
        args,
        { cwd: projectDir, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout, stderr) => {
          resolve({
            ok: !err,
            code: err ? err.code || 1 : 0,
            stdout: String(stdout || ""),
            stderr: String(stderr || ""),
          });
        },
      );
    } catch (e) {
      resolve({ ok: false, code: -1, stdout: "", stderr: e.message });
    }
  });
}

/** Проверить, есть ли remote (origin и т.п.). */
async function getRemotes(projectDir) {
  const r = await runGit(projectDir, ["remote", "-v"]);
  if (!r.ok) return [];
  const names = new Set();
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.trim().match(/^(\S+)\s+/);
    if (m) names.add(m[1]);
  }
  return Array.from(names);
}

/**
 * Статус текущей ветки: name, upstream {remote,name}|null, ahead, behind, hasRemote.
 * Аналог git.getBranch() из VS Code.
 */
async function getBranchStatus(projectDir) {
  const fmt =
    "%(refname)%00%(upstream:short)%00%(objectname)%00%(upstream:track)%00%(upstream:remotename)%00%(upstream:remoteref)";
  const r = await runGit(projectDir, [
    "for-each-ref",
    "--format=" + fmt,
    "refs/heads",
  ]);
  if (!r.ok) return { ok: false, error: r.stderr || "git for-each-ref failed" };

  // Текущая ветка.
  const head = await runGit(projectDir, [
    "symbolic-ref",
    "--short",
    "-q",
    "HEAD",
  ]);
  const current = head.ok ? head.stdout.trim() : "";

  let result = null;
  for (const line of r.stdout.trim().split(/\r?\n/)) {
    if (!line) continue;
    let [ref, upstream, commit, status, remoteName, upstreamRef] = line
      .trim()
      .split("\0");
    const name = ref.replace(/^refs\/heads\//, "");
    let ahead = 0;
    let behind = 0;
    const m = /\[(?:ahead (\d+))?[,\s]*(?:behind (\d+))?]|\[gone]/.exec(
      status || "",
    );
    if (m) {
      ahead = Number(m[1]) || 0;
      behind = Number(m[2]) || 0;
    }
    const upName = upstreamRef
      ? upstreamRef.substring(11)
      : upstream && upstream.includes("/")
        ? upstream.substring(upstream.indexOf("/") + 1)
        : "";
    const upRemote = remoteName
      ? remoteName
      : upstream && upstream.includes("/")
        ? upstream.substring(0, upstream.indexOf("/"))
        : "";
    const upstreamObj =
      upstream && status !== "[gone]"
        ? { name: upName, remote: upRemote }
        : null;
    const branch = {
      name,
      commit: commit || null,
      upstream: upstreamObj,
      ahead,
      behind,
    };
    if (name === current) {
      result = branch;
      break;
    }
    if (!result) result = branch;
  }
  const remotes = await getRemotes(projectDir);
  return {
    ok: true,
    branch: result || null,
    current,
    remotes,
    hasRemote: remotes.length > 0,
  };
}

/** Закоммитить все изменения (git add -A && git commit -m). */
async function commitAll(projectDir, message) {
  if (!message || !String(message).trim())
    return { ok: false, error: "empty message" };
  const add = await runGit(projectDir, ["add", "-A"]);
  if (!add.ok) return { ok: false, error: add.stderr || "git add failed" };
  const commit = await runGit(projectDir, ["commit", "-m", String(message)]);
  if (!commit.ok)
    return { ok: false, error: commit.stderr || "git commit failed" };
  return { ok: true, stdout: commit.stdout };
}

/** Push: если setUpstream — git push -u <remote> <branch>. */
async function push(
  projectDir,
  { remote = "origin", branch = "", setUpstream = false, force = false } = {},
) {
  const args = ["push"];
  if (force) args.push("--force-with-lease");
  if (setUpstream) args.push("-u");
  if (remote) args.push(remote);
  if (branch) args.push(branch);
  const r = await runGit(projectDir, args);
  if (!r.ok) {
    const err = r.stderr || r.stdout || "git push failed";
    let code = "PushRejected";
    if (/Permission.*denied/i.test(err)) code = "PermissionDenied";
    else if (/Could not read from remote repository/i.test(err))
      code = "RemoteConnectionError";
    else if (/has no upstream branch/i.test(err)) code = "NoUpstreamBranch";
    else if (/non-fast-forward/i.test(err)) code = "NonFastForward";
    return { ok: false, error: err, code };
  }
  return { ok: true, stdout: r.stdout };
}

/** Pull (merge; rebase optional). */
async function pull(
  projectDir,
  { rebase = false, remote = "", branch = "" } = {},
) {
  const args = ["pull"];
  if (rebase) args.push("-r");
  if (remote) args.push(remote);
  if (branch) args.push(branch);
  const r = await runGit(projectDir, args);
  if (!r.ok) {
    const err = r.stderr || r.stdout || "git pull failed";
    let code = "PullFailed";
    if (/^CONFLICT \(/m.test(r.stdout || "")) code = "Conflict";
    else if (/Could not read from remote repository/i.test(err))
      code = "RemoteConnectionError";
    else if (/unmerged files|unstaged changes|would be overwritten/i.test(err))
      code = "DirtyWorkTree";
    return { ok: false, error: err, code };
  }
  return { ok: true, stdout: r.stdout };
}

/** Fetch (без merge). */
async function fetchRemote(
  projectDir,
  { remote = "", all = true, prune = true } = {},
) {
  const args = ["fetch"];
  if (remote) args.push(remote);
  else if (all) args.push("--all");
  if (prune) args.push("--prune");
  const r = await runGit(projectDir, args);
  if (!r.ok) {
    const err = r.stderr || r.stdout || "git fetch failed";
    let code = "FetchFailed";
    if (/No remote repository specified/i.test(err))
      code = "NoRemoteRepository";
    else if (/Could not read from remote repository/i.test(err))
      code = "RemoteConnectionError";
    return { ok: false, error: err, code };
  }
  return { ok: true, stdout: r.stdout };
}

/** Publish = push -u origin <current> (для ветки без upstream). */
async function publish(projectDir) {
  const st = await getBranchStatus(projectDir);
  if (!st.ok) return { ok: false, error: st.error };
  if (!st.hasRemote)
    return { ok: false, error: "no remote configured", code: "NoRemote" };
  const branch = st.current || (st.branch && st.branch.name);
  if (!branch)
    return { ok: false, error: "no current branch", code: "NoBranch" };
  return push(projectDir, {
    remote: st.remotes[0] || "origin",
    branch,
    setUpstream: true,
  });
}

/** Sync = pull (если behind), потом push (если ahead). */
async function sync(projectDir) {
  const st0 = await getBranchStatus(projectDir);
  if (!st0.ok) return { ok: false, error: st0.error };
  const results = { pulled: null, pushed: null };
  if (st0.branch && st0.branch.behind > 0) {
    results.pulled = await pull(projectDir);
    if (!results.pulled.ok)
      return { ok: false, stage: "pull", ...results.pulled };
  }
  const st1 = await getBranchStatus(projectDir);
  if (st1.branch && st1.branch.ahead > 0) {
    results.pushed = await push(projectDir, {
      remote: st1.remotes[0] || "origin",
      branch: st1.current || "",
    });
    if (!results.pushed.ok)
      return { ok: false, stage: "push", ...results.pushed };
  }
  return { ok: true, results };
}

/**
 * Список веток (локальные + удалённые) для переключателя на Git-странице.
 * Возвращает { ok, branches: [{ name, remote, current }] }.
 */
async function listBranches(projectDir) {
  const r = await runGit(projectDir, [
    "for-each-ref",
    "--format=%(HEAD)|%(refname)",
    "refs/heads",
    "refs/remotes",
  ]);
  if (!r.ok) return { ok: false, error: r.stderr || "git for-each-ref failed" };
  const branches = [];
  const seen = new Set();
  for (const raw of r.stdout.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const sep = raw.indexOf("|");
    if (sep < 0) continue;
    const current = raw.slice(0, sep).trim() === "*";
    let ref = raw.slice(sep + 1).trim();
    // Пропускаем симлинк HEAD удалённых (origin/HEAD).
    if (!ref || ref.endsWith("/HEAD")) continue;
    const remote = ref.startsWith("refs/remotes/");
    ref = ref.replace(/^refs\/(heads|remotes)\//, "");
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    branches.push({ name: ref, remote, current });
  }
  return { ok: true, branches };
}

/**
 * Переключить ветку (git checkout). remote=true — удалённая ветка:
 * создаём локальную с upstream, либо переключаемся на уже существующую.
 */
async function checkout(projectDir, { branch = "", remote = false } = {}) {
  const target = String(branch || "").trim();
  if (!target) return { ok: false, error: "no branch", code: "NoBranch" };
  let args;
  let local = target;
  if (remote) {
    local = target.replace(/^[^/]+\//, "");
    const exists = await runGit(projectDir, [
      "show-ref",
      "--verify",
      "--quiet",
      "refs/heads/" + local,
    ]);
    args = exists.ok
      ? ["checkout", local]
      : ["checkout", "-b", local, "--track", target];
  } else {
    args = ["checkout", local];
  }
  const r = await runGit(projectDir, args);
  if (!r.ok)
    return {
      ok: false,
      error: (r.stderr || r.stdout || "git checkout failed").trim(),
      code: "CheckoutFailed",
    };
  return { ok: true, branch: local };
}

module.exports = {
  runGit,
  getRemotes,
  getBranchStatus,
  listBranches,
  checkout,
  commitAll,
  push,
  pull,
  fetchRemote,
  publish,
  sync,
};
