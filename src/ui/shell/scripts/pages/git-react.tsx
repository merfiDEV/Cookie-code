/**
 * Git-страница (React) — дизайн v2 (IDE-style sidebar).
 * Всё рабочее: sync/push/pull/fetch, коммит (всё / & push), AI-генерация,
 * conventional-chips, список изменённых файлов, выбор ветки.
 */
import { createElement, useState, useEffect, useCallback, useRef } from "react";
import { api } from "../shared.js";

interface BranchRef {
  name: string;
  remote: boolean;
  current: boolean;
}
interface BranchInfo {
  name: string;
  commit?: string | null;
  upstream?: { name: string; remote: string } | null;
  ahead: number;
  behind: number;
}
interface GitStatus {
  ok: boolean;
  branch?: BranchInfo | null;
  current?: string;
  remotes?: string[];
  hasRemote?: boolean;
  error?: string;
}
interface ChangedFile {
  path: string;
  status: string;
  raw: string;
}

function Ico({ d, size = 16 }: { d: string; size?: number }) {
  return createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: size,
      height: size,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    createElement("path", { d }),
  );
}

const ICONS = {
  branch:
    "M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 3-2 5-5 6",
  sync: "M21 12a9 9 0 0 1-9 9M3 12a9 9 0 0 1 9-9M12 3v6M12 21v-6M3 12h6M21 12h-6",
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M5 12l7 7 7-7",
  cloud: "M18 10a4 4 0 0 0-7.9-1A3 3 0 0 0 6 15h12a3 3 0 0 0 0-6z",
  fetch: "M12 3v12M8 11l4 4 4-4M4 21h16",
  refresh: "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6",
  dots: "M12 12h.01M12 5h.01M12 19h.01",
  sparkle: "M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6",
  check: "M20 6L9 17l-5-5",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M18 15l-6-6-6 6",
  spinner: "M21 12a9 9 0 1 1-6.219-8.56",
};

const CONVENTIONAL = [
  "feat",
  "fix",
  "refactor",
  "docs",
  "chore",
  "style",
  "test",
  "perf",
];

export function GitPage() {
  const [st, setSt] = useState<GitStatus | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [branches, setBranches] = useState<BranchRef[]>([]);
  const [branchOpen, setBranchOpen] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [toast, setToast] = useState<{
    text: string;
    kind: "ok" | "err";
  } | null>(null);

  const show = (text: string, kind: "ok" | "err") => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    const anyApi = api as any;
    if (!anyApi.gitBranchStatus) return;
    try {
      const r = await anyApi.gitBranchStatus();
      setSt(r || { ok: false, error: "no data" });
    } catch (e: any) {
      setSt({ ok: false, error: e.message || String(e) });
    }
  }, []);

  const loadFiles = useCallback(async () => {
    const anyApi = api as any;
    if (!anyApi.gitChangedFiles) return;
    try {
      const r = await anyApi.gitChangedFiles();
      if (r && r.ok && Array.isArray(r.files)) setFiles(r.files);
      else setFiles([]);
    } catch (_) {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    load();
    loadFiles();
  }, [load, loadFiles]);

  // Приём текста из инструмента generate_commit_message — вставка в textarea.
  useEffect(() => {
    const anyApi = api as any;
    if (!anyApi.onCommitMessage) return;
    anyApi.onCommitMessage((data: any) => {
      if (data && typeof data.message === "string") {
        setMsg(data.message);
        // Дать React перерендерить и поставить курсор в конец.
        setTimeout(() => {
          const ta = textareaRef.current;
          if (ta) {
            ta.focus();
            const len = ta.value.length;
            ta.setSelectionRange(len, len);
          }
        }, 30);
      }
    });
  }, []);

  const loadBranches = useCallback(async () => {
    const anyApi = api as any;
    if (!anyApi.gitListBranches) return;
    try {
      const r = await anyApi.gitListBranches();
      if (r && r.ok && Array.isArray(r.branches)) setBranches(r.branches);
      else setBranches([]);
    } catch (_) {
      setBranches([]);
    }
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches, st && (st as any).current]);

  useEffect(() => {
    if (!branchOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setBranchOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBranchOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [branchOpen]);

  const refreshAll = useCallback(() => {
    load();
    loadFiles();
    loadBranches();
  }, [load, loadFiles, loadBranches]);

  const run = useCallback(
    async (name: string, fn: () => Promise<any>, okText: string) => {
      setBusy(name);
      try {
        const r = await fn();
        if (r && (r.ok || r.success)) show(okText, "ok");
        else show((r && (r.error || r.code)) || "Ошибка", "err");
      } catch (e: any) {
        show(e.message || String(e), "err");
      } finally {
        setBusy("");
        refreshAll();
      }
    },
    [refreshAll],
  );

  const switchBranch = useCallback(
    async (br: BranchRef) => {
      setBranchOpen(false);
      if (br.current && !br.remote) return;
      const anyApi = api as any;
      if (!anyApi.gitCheckout) return;
      await run(
        "checkout",
        () => anyApi.gitCheckout({ branch: br.name, remote: br.remote }),
        "Ветка: " + br.name,
      );
    },
    [run],
  );

  const insertPrefix = (prefix: string) => {
    setMsg((cur) => {
      const cleaned = cur.replace(
        /^(feat|fix|refactor|docs|chore|style|test|perf)(\([^)]*\))?:\s*/,
        "",
      );
      return prefix + ": " + cleaned;
    });
    textareaRef.current?.focus();
  };

  const stageAll = useCallback(async () => {
    const anyApi = api as any;
    if (!anyApi.gitStageAll) return;
    await run(
      "stage",
      () => anyApi.gitStageAll(),
      "Все изменения проиндексированы",
    );
  }, [run]);

  const generateMsg = useCallback(async () => {
    const anyApi = api as any;
    if (!anyApi.generateCommitMessage) return;
    setBusy("ai");
    try {
      const r = await anyApi.generateCommitMessage();
      if (r && r.ok) show("Промпт улетел в AI-чат", "ok");
      else show((r && r.error) || "Ошибка", "err");
    } catch (e: any) {
      show(e.message || String(e), "err");
    } finally {
      setBusy("");
    }
  }, []);

  const commit = useCallback(async () => {
    if (!msg.trim()) return;
    const anyApi = api as any;
    await run("commit", () => anyApi.gitCommit(msg.trim()), "Коммит создан");
    setMsg("");
  }, [msg, run]);

  const commitPush = useCallback(async () => {
    if (!msg.trim()) return;
    const anyApi = api as any;
    if (!anyApi.gitCommitPush) return;
    await run(
      "commitPush",
      () => anyApi.gitCommitPush(msg.trim()),
      "Закоммичено и запушено",
    );
    setMsg("");
  }, [msg, run]);

  // Ctrl+Enter (Win/Linux) или ⌘+Enter (macOS) — коммит.
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);
  const shortcutLabel = isMac ? "⌘+Enter" : "Ctrl+Enter";
  const onKeyDown = (e: any) => {
    const isEnter =
      e.key === "Enter" || e.key === "NumpadEnter" || e.keyCode === 13;
    if (isEnter && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      commit();
    }
  };

  const b = st && st.branch;
  const ahead = b ? b.ahead : 0;
  const behind = b ? b.behind : 0;
  const hasUpstream = !!(b && b.upstream);
  const hasRemote = !!(st && st.hasRemote);

  // Заголовок + refresh
  const header = createElement(
    "div",
    { className: "ck-git-head" },
    createElement(
      "div",
      { className: "ck-git-head-title" },
      createElement(
        "span",
        { className: "ck-git-head-icon" },
        createElement(Ico, { d: ICONS.branch, size: 14 }),
      ),
      createElement("h2", { className: "ck-git-head-text" }, "Git"),
    ),
    createElement(
      "div",
      { className: "ck-git-head-actions" },
      createElement(
        "button",
        {
          className: "ck-git-iconbtn",
          title: "Обновить статус",
          disabled: !!busy,
          onClick: refreshAll,
        },
        createElement(Ico, { d: ICONS.refresh, size: 14 }),
      ),
    ),
  );

  if (!st) {
    return createElement(
      "div",
      { className: "ck-tab ck-tab-active ck-git" },
      header,
      createElement("div", { className: "ck-list-empty" }, "Загрузка…"),
    );
  }
  if (!st.ok) {
    return createElement(
      "div",
      { className: "ck-tab ck-tab-active ck-git" },
      header,
      createElement(
        "div",
        { className: "ck-list-empty" },
        "Git: " + (st.error || "ошибка"),
      ),
    );
  }

  // Branch status card
  const branchCard = createElement(
    "section",
    { className: "ck-git-card ck-git-branch" },
    createElement(
      "div",
      { className: "ck-git-branch-top" },
      createElement(
        "div",
        { className: "ck-git-branch-picker-wrap", ref: branchRef },
        createElement(
          "button",
          {
            className: "ck-git-branch-trigger2",
            disabled: !!busy,
            onClick: () => setBranchOpen((v) => !v),
            title: "Переключить ветку",
          },
          createElement(Ico, { d: ICONS.branch, size: 14 }),
          createElement(
            "span",
            { className: "ck-git-branch-name" },
            b ? b.name : "—",
          ),
          createElement(
            "span",
            { className: "ck-git-branch-chev" },
            createElement(Ico, { d: ICONS.chevronDown, size: 12 }),
          ),
        ),
        branchOpen
          ? createElement(
              "div",
              { className: "ck-git-branch-menu" },
              branches.length === 0
                ? createElement(
                    "div",
                    { className: "ck-git-branch-empty" },
                    "Нет веток",
                  )
                : branches.map((br) =>
                    createElement(
                      "div",
                      {
                        key: (br.remote ? "r:" : "l:") + br.name,
                        className:
                          "ck-git-branch-item" +
                          (br.current && !br.remote ? " active" : ""),
                        onClick: () => switchBranch(br),
                      },
                      createElement(
                        "span",
                        { className: "ck-git-branch-item-name" },
                        br.name,
                      ),
                      br.remote
                        ? createElement(
                            "span",
                            { className: "ck-git-branch-item-tag" },
                            "remote",
                          )
                        : null,
                      br.current && !br.remote
                        ? createElement(
                            "span",
                            { className: "ck-git-branch-item-check" },
                            createElement(Ico, { d: ICONS.check, size: 12 }),
                          )
                        : null,
                    ),
                  ),
            )
          : null,
      ),
      b && b.upstream
        ? createElement(
            "span",
            { className: "ck-git-upstream-badge" },
            createElement("span", { className: "ck-git-dot" }),
            createElement(
              "span",
              { className: "ck-git-upstream-name" },
              b.upstream.remote + "/" + b.upstream.name,
            ),
          )
        : !hasUpstream
          ? createElement(
              "span",
              { className: "ck-git-upstream-badge ck-git-upstream-badge-warn" },
              "нет upstream",
            )
          : null,
    ),
    createElement(
      "div",
      { className: "ck-git-branch-bottom" },
      createElement(
        "div",
        { className: "ck-git-ab-row" },
        createElement(
          "span",
          {
            className:
              "ck-git-ab-badge ck-git-ab-ahead " + (ahead > 0 ? "on" : "off"),
            title: "Впереди",
          },
          createElement(Ico, { d: ICONS.chevronUp, size: 11 }),
          String(ahead),
        ),
        createElement(
          "span",
          {
            className:
              "ck-git-ab-badge ck-git-ab-behind " + (behind > 0 ? "on" : "off"),
            title: "Позади",
          },
          createElement(Ico, { d: ICONS.chevronDown, size: 11 }),
          String(behind),
        ),
        createElement(
          "span",
          { className: "ck-git-ab-note" },
          ahead > 0
            ? ahead +
                " лок. " +
                plural(ahead, ["коммит", "коммита", "коммитов"])
            : "синхронизировано",
        ),
      ),
    ),
  );

  // Toolbar: Sync / Push / Pull / Fetch
  const toolbar = createElement(
    "nav",
    { className: "ck-git-toolbar" },
    createElement(
      "button",
      {
        className: "ck-git-tool ck-git-tool-primary",
        disabled: !!busy || (!hasUpstream && !hasRemote),
        onClick: () =>
          hasUpstream
            ? run("sync", () => (api as any).gitSync(), "Синхронизировано")
            : run(
                "publish",
                () => (api as any).gitPublish(),
                "Ветка опубликована",
              ),
        title: hasUpstream ? "Sync (pull + push)" : "Publish branch",
      },
      createElement(Ico, {
        d: hasUpstream ? ICONS.sync : ICONS.cloud,
        size: 16,
      }),
      createElement(
        "span",
        null,
        busy === "sync" || busy === "publish"
          ? "…"
          : hasUpstream
            ? "Sync"
            : "Publish",
      ),
    ),
    createElement(
      "button",
      {
        className: "ck-git-tool",
        disabled: !!busy || !hasUpstream || ahead === 0,
        onClick: () => run("push", () => (api as any).gitPush({}), "Запушено"),
        title: "Push",
      },
      createElement(Ico, { d: ICONS.up, size: 16 }),
      createElement("span", null, busy === "push" ? "…" : "Push"),
    ),
    createElement(
      "button",
      {
        className: "ck-git-tool",
        disabled: !!busy || !hasUpstream,
        onClick: () => run("pull", () => (api as any).gitPull({}), "Подтянуто"),
        title: "Pull",
      },
      createElement(Ico, { d: ICONS.down, size: 16 }),
      createElement("span", null, busy === "pull" ? "…" : "Pull"),
    ),
    createElement(
      "button",
      {
        className: "ck-git-tool",
        disabled: !!busy || !hasRemote,
        onClick: () =>
          run("fetch", () => (api as any).gitFetch({}), "Fetch выполнен"),
        title: "Fetch",
      },
      createElement(Ico, { d: ICONS.fetch, size: 16 }),
      createElement("span", null, busy === "fetch" ? "…" : "Fetch"),
    ),
  );

  // Commit composer
  const composer = createElement(
    "section",
    { className: "ck-git-card ck-git-composer" },
    createElement(
      "div",
      { className: "ck-git-composer-head" },
      createElement(
        "div",
        { className: "ck-git-composer-title" },
        createElement(Ico, { d: ICONS.file, size: 14 }),
        createElement("span", null, "Изменения"),
        createElement(
          "span",
          { className: "ck-git-composer-count" },
          files.length +
            " " +
            plural(files.length, ["файл", "файла", "файлов"]),
        ),
      ),
      createElement(
        "button",
        {
          className: "ck-git-link",
          disabled: !!busy || files.length === 0,
          onClick: stageAll,
          title: "git add -A",
        },
        "+ Индексировать всё",
      ),
    ),
    createElement(
      "div",
      { className: "ck-git-chips" },
      ...CONVENTIONAL.map((p) =>
        createElement(
          "button",
          {
            key: p,
            type: "button",
            className: "ck-git-chip",
            onClick: () => insertPrefix(p),
          },
          p + ":",
        ),
      ),
    ),
    createElement(
      "div",
      { className: "ck-git-input-wrap" },
      createElement("textarea", {
        ref: textareaRef,
        className: "ck-git-textarea",
        placeholder: "Сообщение коммита (" + shortcutLabel + " — закоммитить)…",
        value: msg,
        rows: 3,
        onChange: (e: any) => setMsg(e.target.value),
        onKeyDown,
      }),
      createElement(
        "div",
        { className: "ck-git-input-bar" },
        createElement(
          "button",
          {
            type: "button",
            className: "ck-git-aibtn",
            disabled: !!busy,
            onClick: generateMsg,
            title: "Сгенерировать сообщение через AI",
          },
          busy === "ai"
            ? createElement(Ico, { d: ICONS.spinner, size: 13 })
            : createElement(Ico, { d: ICONS.sparkle, size: 13 }),
          createElement(
            "span",
            null,
            busy === "ai" ? "Генерация…" : "Сгенерировать с ИИ",
          ),
        ),
        createElement(
          "span",
          { className: "ck-git-kbd", title: "Ctrl+Enter — закоммитить" },
          shortcutLabel,
        ),
      ),
    ),
    createElement(
      "div",
      { className: "ck-git-commit-row" },
      createElement(
        "button",
        {
          className: "ck-git-commit-main",
          disabled: !!busy || !msg.trim(),
          onClick: commit,
        },
        createElement(
          "span",
          { className: "ck-git-commit-main-title" },
          createElement(Ico, { d: ICONS.check, size: 14 }),
          busy === "commit" ? "Коммит…" : "Закоммитить всё",
        ),
        createElement(
          "span",
          { className: "ck-git-commit-main-sub" },
          "(git add -A && commit)",
        ),
      ),
      createElement(
        "button",
        {
          className: "ck-git-commit-split",
          disabled: !!busy || !msg.trim(),
          onClick: commitPush,
          title: "Закоммитить и запушить",
        },
        createElement(Ico, { d: ICONS.up, size: 13 }),
      ),
    ),
  );

  // File changes list
  const filesBlock =
    files.length > 0
      ? createElement(
          "section",
          { className: "ck-git-files" },
          createElement(
            "div",
            { className: "ck-git-files-head" },
            createElement(
              "span",
              { className: "ck-git-files-title" },
              "Рабочая директория",
            ),
            createElement(
              "span",
              { className: "ck-git-files-count" },
              files.length + " изм.",
            ),
          ),
          createElement(
            "div",
            { className: "ck-git-files-list" },
            ...files.map((f) =>
              createElement(
                "div",
                { key: f.path, className: "ck-git-file" },
                createElement("span", {
                  className:
                    "ck-git-file-dot ck-git-file-dot-" + f.status.toLowerCase(),
                }),
                createElement(
                  "span",
                  { className: "ck-git-file-path", title: f.path },
                  f.path,
                ),
                createElement(
                  "span",
                  {
                    className:
                      "ck-git-file-badge ck-git-file-badge-" +
                      f.status.toLowerCase(),
                  },
                  f.status,
                ),
              ),
            ),
          ),
        )
      : null;

  return createElement(
    "div",
    { className: "ck-tab ck-tab-active ck-git" },
    header,
    createElement(
      "div",
      { className: "ck-git-scroll" },
      branchCard,
      toolbar,
      composer,
      filesBlock,
    ),
    toast
      ? createElement(
          "div",
          {
            className: "ck-git-toast2 " + (toast.kind === "ok" ? "ok" : "err"),
          },
          toast.text,
        )
      : null,
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
