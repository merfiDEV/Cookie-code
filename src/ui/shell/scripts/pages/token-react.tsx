/**
 * Токены — статистика и контекст текущего диалога.
 */
import { createElement, useState, useEffect, useCallback } from "react";
import { api } from "../shared.js";

function formatTokens(n: number): string {
  if (!isFinite(n) || n < 0) return "0";
  if (n >= 1000000000) return (n / 1000000000).toFixed(2) + " млрд";
  if (n >= 1000000) return (n / 1000000).toFixed(2) + " млн";
  if (n >= 1000) return (n / 1000).toFixed(1) + " тыс";
  return String(Math.round(n));
}

export function TokenPage() {
  const [usage, setUsage] = useState<any>({ total: 0, delta: 0, context: 0 });
  const [systemTotal, setSystemTotal] = useState(0);
  const [auto, setAuto] = useState<any>({ enabled: true, threshold: 800000 });
  const [tps, setTps] = useState("--");

  const load = useCallback(async () => {
    const anyApi = api as any;
    try {
      const r = await anyApi.getTokenUsage?.();
      if (r && r.success && r.data) setUsage(r.data);
    } catch (_) {}
    try {
      const r = await anyApi.getSystemTotal?.();
      if (r && r.success) setSystemTotal(r.total || 0);
    } catch (_) {}
    try {
      const r = await anyApi.getAutoCompact?.();
      if (r && r.success && r.data) setAuto(r.data);
    } catch (_) {}
  }, []);

  useEffect(() => {
    load();
    const anyApi = api as any;
    if (anyApi.onTokenUpdated)
      anyApi.onTokenUpdated((d: any) => setUsage(d || {}));
    if (anyApi.onTotalUpdated)
      anyApi.onTotalUpdated((d: any) => setSystemTotal(d?.total || 0));
    if (anyApi.onTpsUpdated)
      anyApi.onTpsUpdated((d: any) => setTps(d?.tps ? String(d.tps) : "--"));
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const saveAuto = useCallback(async (enabled: boolean, threshold: number) => {
    const anyApi = api as any;
    try {
      await anyApi.saveAutoCompact?.({ enabled, threshold });
    } catch (_) {}
    setAuto({ enabled, threshold });
  }, []);

  return createElement(
    "div",
    { className: "ck-tab ck-tab-active" },
    createElement(
      "div",
      { className: "ck-actions" },
      createElement(
        "span",
        { className: "ck-set-group-title", style: { flex: 1 } },
        "Токены",
      ),
      createElement(
        "button",
        { className: "ck-icon-btn", title: "Обновить", onClick: load },
        "↻",
      ),
    ),
    createElement(
      "div",
      { className: "ck-list", style: { padding: 12 } },
      createElement(
        "div",
        { className: "ck-card" },
        createElement(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              padding: 8,
            },
          },
          createElement("span", null, "Контекст текущего диалога"),
          createElement(
            "strong",
            null,
            formatTokens(usage.context || usage.total || 0),
          ),
        ),
        createElement(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              padding: 8,
            },
          },
          createElement("span", null, "Последняя дельта"),
          createElement("strong", null, formatTokens(usage.delta || 0)),
        ),
        createElement(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              padding: 8,
            },
          },
          createElement("span", null, "Скорость (t/s)"),
          createElement("strong", null, tps),
        ),
        createElement(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              padding: 8,
            },
          },
          createElement("span", null, "Системный тотал"),
          createElement("strong", null, formatTokens(systemTotal)),
        ),
      ),
      createElement(
        "div",
        { className: "ck-card", style: { marginTop: 12, padding: 8 } },
        createElement(
          "div",
          {
            className: "ck-switch-card",
            onClick: () => saveAuto(!auto.enabled, auto.threshold),
          },
          createElement(
            "div",
            { className: "ck-switch-text" },
            createElement(
              "div",
              { className: "ck-switch-label" },
              "Автосжатие контекста",
            ),
            createElement(
              "div",
              { className: "ck-switch-desc" },
              "Порог: " +
                Math.round((auto.threshold || 0) / 10000) +
                " тыс токенов",
            ),
          ),
          createElement(
            "label",
            { className: "ck-switch ck-switch-lg" },
            createElement("input", {
              type: "checkbox",
              checked: !!auto.enabled,
              onChange: (e: any) => saveAuto(e.target.checked, auto.threshold),
            }),
            createElement("span", { className: "ck-switch-track" }),
          ),
        ),
        createElement(
          "div",
          { style: { display: "flex", gap: 8, marginTop: 8 } },
          createElement("input", {
            type: "number",
            className: "ck-input",
            style: { flex: 1 },
            value: Math.round((auto.threshold || 800000) / 10000),
            onChange: (e: any) =>
              setAuto({ ...auto, threshold: Number(e.target.value) * 10000 }),
          }),
          createElement(
            "button",
            {
              className: "ck-btn",
              onClick: () => saveAuto(auto.enabled, auto.threshold),
            },
            "Сохранить",
          ),
        ),
      ),
    ),
  );
}
