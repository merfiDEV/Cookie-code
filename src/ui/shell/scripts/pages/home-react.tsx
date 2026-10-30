/**
 * 主页（feat/022-dsh-compat-c7）
 *
 * 常用操作聚合：
 * - 新建会话 / 纯净切换
 * - 插件面板（sidebar.panellist）
 * - 底部动作（sidebar.footer.action）—— 固定底部，滚动不影响
 */
import {
  createElement,
  useState,
  useEffect,
  useCallback,
  Component,
} from "react";
import { api } from "../shared.js";
import { UiButton } from "../components/ui-button.js";
import { subscribeSlots, getSlotItems } from "../dsh-client-runtime.js";

const PANEL_SLOT = "sidebar.panellist";
const FOOTER_SLOT = "sidebar.footer.action";

/** 错误边界：单个插件组件崩溃不影响整个壳 */
class SlotErrorBoundary extends Component<
  { children?: any },
  { err: string | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(e: any) {
    return { err: e && e.message ? e.message : String(e) };
  }
  componentDidCatch(e: any) {
    console.error("[dsh-slot] 组件崩溃", e);
  }
  render() {
    if (this.state.err) {
      return createElement(
        "span",
        {
          title: "插件组件崩溃：" + this.state.err,
          style: { color: "#e55", fontSize: 11 },
        },
        "⚠ 插件出错",
      );
    }
    return (this as any).props.children;
  }
}

/** 取 spec 上的文案（label 可能是函数） */
function specLabel(spec: any, fallback: string): string {
  if (!spec) return fallback;
  const pick = (v: any) => {
    if (typeof v === "function") {
      try {
        return v();
      } catch (_) {
        return null;
      }
    }
    return v;
  };
  return String(
    pick(spec.label) || pick(spec.text) || pick(spec.title) || fallback,
  );
}

/** 订阅某个槽位（本地 client + 主进程 host 两路） */
function useSlot(slotName: string): any[] {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    const anyApi = api as any;
    // ① 本地（DSH client 注册的 React 组件）
    const refreshLocal = () => {
      const local = getSlotItems(slotName).map((s: any) => ({
        kind: "client",
        key: "c:" + s.key,
        spec: s.spec,
        Component: s.Component,
        id: s.id,
        pluginId: s.pluginId,
        t: s.t,
      }));
      setItems((prev) => {
        const host = prev.filter((x: any) => x.kind === "host");
        return [...local, ...host];
      });
    };
    refreshLocal();
    const unsub = subscribeSlots(refreshLocal);
    // ② 主进程 host 侧
    const isMine = (m: any) => !!(m && m.slot === slotName);
    const keyOf = (m: any) => m.pluginId + ":" + m.slot + ":" + m.id;
    if (anyApi.listPluginSlots) {
      anyApi
        .listPluginSlots()
        .then((r: any) => {
          if (!r || !r.success || !Array.isArray(r.slots)) return;
          const host = r.slots.filter(isMine).map((m: any) => ({
            kind: "host",
            key: "h:" + keyOf(m),
            spec: m.spec,
            id: m.id,
            pluginId: m.pluginId,
            order: m.order,
          }));
          setItems((prev) => [
            ...prev.filter((x: any) => x.kind === "client"),
            ...host,
          ]);
        })
        .catch(() => {});
    }
    if (anyApi.onPluginSlotRegister) {
      anyApi.onPluginSlotRegister((m: any) => {
        if (!isMine(m)) return;
        setItems((prev) => {
          const k = "h:" + keyOf(m);
          const next = prev.filter((x: any) => x.key !== k);
          next.push({
            kind: "host",
            key: k,
            spec: m.spec,
            id: m.id,
            pluginId: m.pluginId,
            order: m.order,
          });
          return next;
        });
      });
    }
    if (anyApi.onPluginSlotUnregister) {
      anyApi.onPluginSlotUnregister((m: any) => {
        if (!isMine(m)) return;
        setItems((prev) =>
          prev.filter(
            (x: any) =>
              !(
                x.kind === "host" &&
                x.pluginId === m.pluginId &&
                x.id === m.id
              ),
          ),
        );
      });
    }
    return unsub;
  }, [slotName]);
  return items;
}

export function HomePage() {
  const [version, setVersion] = useState("");
  const panels = useSlot(PANEL_SLOT);
  const footers = useSlot(FOOTER_SLOT);
  // Task/history из AI-страницы (detector/observer)
  const [task, setTask] = useState<{
    command?: string;
    timestamp?: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const anyApi = api as any;
    if (typeof anyApi.onTaskUpdate !== "function") return;
    anyApi.onTaskUpdate((d: any) => {
      if (!d) return;
      if (d.kind === "task") {
        setTask({ command: d.command, timestamp: d.timestamp });
      } else if (d.kind === "status") {
        setRunning(!!d.running);
      } else if (d.kind === "history" && Array.isArray(d.history)) {
        setHistory(d.history);
      }
    });
  }, []);

  const killTask = useCallback(() => {
    const anyApi = api as any;
    if (typeof anyApi.killProcess === "function") {
      anyApi.killProcess().catch(() => {});
    }
    setRunning(false);
    setTask(null);
  }, []);

  useEffect(() => {
    const anyApi = api as any;
    if (anyApi.getAppInfo)
      anyApi
        .getAppInfo()
        .then((r: any) => {
          if (r && r.success) setVersion(r.version || "");
        })
        .catch(() => {});
  }, []);

  const newSession = useCallback(async () => {
    const anyApi = api as any;
    try {
      if (anyApi.newWebConversation) await anyApi.newWebConversation();
      else if (api.home) api.home();
    } catch (_) {
      /* ignore */
    }
  }, []);

  // Overlay-действия из старой панели — вызываем через shell-overlay-action
  const overlayAction = useCallback((action: string) => {
    const anyApi = api as any;
    if (typeof anyApi.overlayAction === "function") {
      anyApi.overlayAction(action).catch(() => {});
    }
  }, []);

  const initProject = useCallback(async () => {
    const anyApi = api as any;
    try {
      if (anyApi.initProject) await anyApi.initProject();
    } catch (_) {
      /* ignore */
    }
  }, []);

  const invokeCommand = useCallback((spec: any) => {
    const anyApi = api as any;
    if (spec && spec.command && typeof anyApi.commandInvoke === "function")
      anyApi.commandInvoke(spec.command).catch(() => {});
  }, []);

  // P3：DSH sidebar.panellist 项点击 → 切到 main 面板（按 id 匹配）
  const selectPanel = useCallback((id: string) => {
    try {
      const fn = (window as any).__cuckooSelectPanel;
      if (typeof fn === "function") fn(id);
    } catch (_) {}
  }, []);

  const renderItem = (m: any) => {
    const label = specLabel(m.spec, m.id);
    const C = m.Component;
    // 组装组件 props：ownerProps + inject face + t
    let injected: any = {};
    try {
      if (m.spec && typeof m.spec.inject === "function")
        injected = m.spec.inject({}) || {};
    } catch (e) {
      /* ignore */
    }
    const t = typeof m.t === "function" ? m.t : (k: string) => k;
    const props: any = { wide: true, ...injected };
    props.t = t;
    // 组件自带的文字（若 spec 没有 label/text/title，则不显示额外文字）
    const showLabel = !!(
      m.spec &&
      (m.spec.label || m.spec.text || m.spec.title)
    );
    // DSH 语义：sidebar.panellist 项有 id → 点击切 main 面板
    const hasCommand = !!(m.spec && m.spec.command);
    const panelId = m.id;
    const onClick = hasCommand
      ? () => invokeCommand(m.spec)
      : () => selectPanel(panelId);
    // 有组件 → 用 div 包（避免 <button> 嵌 <button>）；无组件 → 用 button
    if (C) {
      return createElement(
        "div",
        {
          key: m.key,
          className: "ck-btn ck-btn-anim",
          title: m.spec && m.spec.title ? String(m.spec.title) : label,
          onClick,
          style: {
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          },
        },
        createElement(
          "span",
          {
            style: {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            },
          },
          createElement(SlotErrorBoundary, null, createElement(C, props)),
        ),
        showLabel ? createElement("span", null, label) : null,
      );
    }
    return createElement(
      "button",
      {
        key: m.key,
        className: "ck-btn ck-btn-anim",
        title: m.spec && m.spec.title ? String(m.spec.title) : label,
        onClick,
        style: { flex: "0 0 auto" },
      },
      createElement("span", null, label),
    );
  };

  return createElement(
    "div",
    { className: "ck-tab ck-tab-active ck-home" },
    // 滚动区：品牌 + 按钮 + 插件面板
    createElement(
      "div",
      { className: "ck-home-scroll" },
      createElement(
        "div",
        {
          style: {
            padding: "6px 2px 8px",
            display: "flex",
            alignItems: "baseline",
            gap: 6,
          },
        },
        createElement(
          "span",
          {
            style: {
              fontSize: 20,
              fontWeight: 700,
              color: "var(--ck-text-2)",
              letterSpacing: ".2px",
              lineHeight: 1.2,
            },
          },
          "Cookie Code",
        ),
        version
          ? createElement(
              "span",
              { style: { fontSize: 12, color: "var(--ck-text-dim)" } },
              "v" + version,
            )
          : null,
      ),
      createElement(
        "div",
        {
          className: "ck-actions",
          style: { flexDirection: "column", gap: 10, alignItems: "stretch" },
        },
        createElement(
          UiButton,
          {
            icon: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
            onClick: initProject,
          },
          "Инициализировать проект",
        ),
        createElement(
          UiButton,
          {
            icon: "M4 4h16v4H4zM6 8v12h12V8M9 12h6",
            onClick: () => overlayAction("gen-doc"),
          },
          "Создать описание",
        ),
        createElement(
          UiButton,
          {
            icon: "M9 12h6M8 7H7a5 5 0 0 0 0 10h1M16 7h1a5 5 0 0 1 0 10h-1",
            onClick: () => overlayAction("prompts"),
          },
          "Промпты",
        ),
        createElement(
          UiButton,
          {
            icon: "M1,13c0-1.1,0.9-2,2-2s2,0.9,2,2s-0.9,2-2,2S1,14.1,1,13z M8.89,10.11l4.53-1.21L12.64,6L8.11,7.21 c-0.8,0.21-1.28,1.04-1.06,1.84l0,0C7.27,9.85,8.09,10.33,8.89,10.11z M20.5,5.9L23,3l-1-1l-3,3l-2,4l-9.48,2.87 c-0.82,0.2-1.39,0.89-1.5,1.68L5.24,18L2.4,21.8L4,23l3-4l1.14-3.14L14,14l5-3.5L20.5,5.9z",
            onClick: () => overlayAction("immersive"),
          },
          "Погружение",
        ),
        createElement(
          UiButton,
          {
            icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
            onClick: () => overlayAction("manual-parse"),
          },
          "Разобрать вручную",
        ),
        createElement(
          UiButton,
          {
            icon: "M3 4h18v4H3zM5 8v11h14V8M10 12h4",
            onClick: () => overlayAction("diff"),
          },
          "Diff",
        ),
      ),
      createElement("div", {
        style: { height: 1, background: "var(--ck-border)", margin: "14px 0" },
      }),
      // Блок «Обнаружена задача» + «История» (перенос из старой overlay-панели)
      createElement(
        "div",
        { className: "ck-task-block" },
        createElement(
          "div",
          { className: "ck-task-title" },
          "Обнаружена задача:",
          running
            ? createElement(
                "span",
                { className: "ck-task-running" },
                createElement("span", { className: "ck-task-spinner" }),
                " выполняется",
                createElement(
                  "button",
                  {
                    className: "ck-task-kill",
                    title: "Остановить",
                    onClick: killTask,
                  },
                  "Kill",
                ),
              )
            : null,
        ),
        createElement(
          "div",
          { className: "ck-task-cmd" },
          task && task.command ? task.command : "Нет",
        ),
        createElement(
          "div",
          {
            className: "ck-task-history-toggle",
            onClick: () => setHistoryOpen((v) => !v),
          },
          createElement(
            "span",
            { className: "ck-task-caret" + (historyOpen ? " open" : "") },
            "▾",
          ),
          "ИСТОРИЯ",
        ),
        historyOpen
          ? createElement(
              "div",
              { className: "ck-task-history" },
              history.length === 0
                ? createElement(
                    "div",
                    { className: "ck-task-history-empty" },
                    "Записей нет",
                  )
                : history.map((h, i) =>
                    createElement(
                      "div",
                      { key: h.id || i, className: "ck-task-history-item" },
                      createElement(
                        "span",
                        { className: "ck-task-history-cmd" },
                        h.command || "",
                      ),
                      createElement(
                        "span",
                        {
                          className:
                            "ck-task-history-status " +
                            (h.canceled ? "" : h.success ? "success" : "error"),
                        },
                        h.canceled ? "⏹" : h.success ? "✅" : "❌",
                      ),
                    ),
                  ),
            )
          : null,
      ),
    ),
    // 底部动作（固定，滚动不影响）
    footers.length > 0
      ? createElement(
          "div",
          { className: "ck-home-footer", id: "ck-home-footer" },
          footers.map(renderItem),
        )
      : null,
  );
}
