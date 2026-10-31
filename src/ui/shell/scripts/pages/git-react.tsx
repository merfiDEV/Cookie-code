/**
 * Git-страница (React): ветка/upstream/ahead/behind, commit, push/pull/fetch,
 * publish, sync. Порт UX из VS Code Source Control.
 */
import { createElement, useState, useEffect, useCallback } from "react";
import { api } from "../shared.js";

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

function Ico({ d }: { d: string }) {
  return createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: 16,
      height: 16,
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
};

export function GitPage() {
  const [st, setSt] = useState<GitStatus | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState<{
    text: string;
    kind: "ok" | "err";
  } | null>(null);

  const show = (text: string, kind: "ok" | "err") => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 4000);
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
  useEffect(() => {
    load();
  }, [load]);

  const run = useCallback(
    async (name: string, fn: () => Promise<any>, okText: string) => {
      setBusy(name);
      try {
        const r = await fn();
        if (r && (r.ok || r.success)) {
          show(okText, "ok");
        } else {
          show((r && (r.error || r.code)) || "Ошибка", "err");
        }
      } catch (e: any) {
        show(e.message || String(e), "err");
      } finally {
        setBusy("");
        load();
      }
    },
    [load],
  );

  const commit = useCallback(async () => {
    if (!msg.trim()) return;
    const anyApi = api as any;
    await run("commit", () => anyApi.gitCommit(msg.trim()), "Коммит создан");
    setMsg("");
  }, [msg, run]);

  const b = st && st.branch;
  const ahead = b ? b.ahead : 0;
  const behind = b ? b.behind : 0;
  const hasUpstream = !!(b && b.upstream);
  const hasRemote = !!(st && st.hasRemote);

  return createElement(
    "div",
    { className: "ck-tab ck-tab-active ck-git" },
    createElement(
      "div",
      { className: "ck-actions" },
      createElement(
        "span",
        { className: "ck-set-group-title", style: { flex: 1 } },
        "Git",
      ),
      createElement(
        "button",
        { className: "ck-icon-btn", title: "Обновить", onClick: load },
        createElement(Ico, { d: ICONS.refresh }),
      ),
    ),
    !st
      ? createElement("div", { className: "ck-list-empty" }, "Загрузка…")
      : !st.ok
        ? createElement(
            "div",
            { className: "ck-list-empty" },
            "Git: " + (st.error || "ошибка"),
          )
        : createElement(
            "div",
            { className: "ck-git-body" },
            // Ветка + статус
            createElement(
              "div",
              { className: "ck-git-branch-card" },
              createElement(
                "div",
                { className: "ck-git-branch-row" },
                createElement(Ico, { d: ICONS.branch }),
                createElement(
                  "span",
                  { className: "ck-git-branch-name" },
                  b ? b.name : "—",
                ),
                b && b.upstream
                  ? createElement(
                      "span",
                      { className: "ck-git-upstream" },
                      b.upstream.remote + "/" + b.upstream.name,
                    )
                  : null,
              ),
              createElement(
                "div",
                { className: "ck-git-ab" },
                ahead > 0
                  ? createElement(
                      "span",
                      { className: "ck-git-ahead", title: "Не запушено" },
                      "↑" + ahead,
                    )
                  : null,
                behind > 0
                  ? createElement(
                      "span",
                      { className: "ck-git-behind", title: "Не подтянуто" },
                      "↓" + behind,
                    )
                  : null,
                !hasUpstream
                  ? createElement(
                      "span",
                      { className: "ck-git-noup" },
                      "нет upstream",
                    )
                  : null,
              ),
            ),
            // Кнопки действий
            createElement(
              "div",
              { className: "ck-git-actions" },
              !hasRemote
                ? createElement(
                    "div",
                    { className: "ck-git-hint" },
                    "Удалённый репозиторий не настроен",
                  )
                : !hasUpstream
                  ? createElement(
                      "button",
                      {
                        className: "ck-git-btn ck-git-btn-primary",
                        disabled: !!busy,
                        onClick: () =>
                          run(
                            "publish",
                            () => (api as any).gitPublish(),
                            "Ветка опубликована",
                          ),
                      },
                      createElement(Ico, { d: ICONS.cloud }),
                      busy === "publish" ? "Публикация…" : "Publish Branch",
                    )
                  : createElement(
                      "button",
                      {
                        className: "ck-git-btn ck-git-btn-primary",
                        disabled: !!busy || (ahead === 0 && behind === 0),
                        onClick: () =>
                          run(
                            "sync",
                            () => (api as any).gitSync(),
                            "Синхронизировано",
                          ),
                      },
                      createElement(Ico, { d: ICONS.sync }),
                      busy === "sync" ? "Синхронизация…" : "Sync",
                    ),
              hasUpstream
                ? createElement(
                    "button",
                    {
                      className: "ck-git-btn",
                      disabled: !!busy || ahead === 0,
                      title: "Запушить коммиты",
                      onClick: () =>
                        run("push", () => (api as any).gitPush({}), "Запушено"),
                    },
                    createElement(Ico, { d: ICONS.up }),
                    busy === "push" ? "Push…" : "Push",
                  )
                : null,
              hasUpstream
                ? createElement(
                    "button",
                    {
                      className: "ck-git-btn",
                      disabled: !!busy,
                      title: "Забрать изменения",
                      onClick: () =>
                        run(
                          "pull",
                          () => (api as any).gitPull({}),
                          "Подтянуто",
                        ),
                    },
                    createElement(Ico, { d: ICONS.down }),
                    busy === "pull" ? "Pull…" : "Pull",
                  )
                : null,
              createElement(
                "button",
                {
                  className: "ck-git-btn",
                  disabled: !!busy,
                  title: "Проверить изменения на сервере",
                  onClick: () =>
                    run(
                      "fetch",
                      () => (api as any).gitFetch({}),
                      "Fetch выполнен",
                    ),
                },
                createElement(Ico, { d: ICONS.fetch }),
                busy === "fetch" ? "Fetch…" : "Fetch",
              ),
            ),
            // Коммит
            createElement(
              "div",
              { className: "ck-git-commit" },
              createElement("textarea", {
                className: "ck-git-commit-msg",
                placeholder: "Сообщение коммита…",
                value: msg,
                rows: 3,
                onChange: (e: any) => setMsg(e.target.value),
              }),
              createElement(
                "button",
                {
                  className: "ck-git-btn ck-git-btn-primary",
                  disabled: !!busy || !msg.trim(),
                  onClick: commit,
                },
                busy === "commit"
                  ? "Коммит…"
                  : "Закоммитить всё (git add -A && commit)",
              ),
            ),
            toast
              ? createElement(
                  "div",
                  {
                    className:
                      "ck-git-toast " + (toast.kind === "ok" ? "ok" : "err"),
                  },
                  toast.text,
                )
              : null,
          ),
  );
}
