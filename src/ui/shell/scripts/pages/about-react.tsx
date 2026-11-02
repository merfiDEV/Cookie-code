/** About 页 (React-версия, для Cookie Code) */
import { createElement, useState, useEffect, useCallback } from "react";
import { api } from "../shared.js";

export function AboutPage() {
  const [version, setVersion] = useState("—");
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  useEffect(() => {
    const anyApi = api as any;
    if (anyApi.getAppInfo) {
      anyApi
        .getAppInfo()
        .then((r: any) => {
          if (r && r.success) setVersion(r.version || "—");
        })
        .catch(() => {});
    }
    // Иконка приложения из build/icon.png
    if (anyApi.getAssetUrl) {
      anyApi
        .getAssetUrl("build/icon.png")
        .then((r: any) => {
          if (r && r.success && r.url) setIconUrl(r.url);
        })
        .catch(() => {});
    }
  }, []);

  const openGithub = useCallback(() => {
    const anyApi = api as any;
    if (anyApi.openExternal)
      anyApi.openExternal("https://github.com/merfiDEV/Cookie-code");
  }, []);

  const [updateStatus, setUpdateStatus] = useState<{
    text: string;
    kind: "info" | "success" | "error";
  } | null>(null);
  const [checking, setChecking] = useState(false);

  const checkUpdate = useCallback(async () => {
    const anyApi = api as any;
    if (!anyApi.checkUpdate) return;
    setChecking(true);
    setUpdateStatus({ text: "Проверка обновлений…", kind: "info" });
    try {
      const r: any = await anyApi.checkUpdate();
      const status = r && r.status;
      if (status === "dev") {
        setUpdateStatus({
          text: "Проверка обновлений недоступна в dev-режиме",
          kind: "info",
        });
      } else if (status === "available") {
        setUpdateStatus({
          text: "Доступна новая версия: v" + (r.version || "?"),
          kind: "success",
        });
      } else if (status === "ready") {
        setUpdateStatus({
          text: "Обновление скачано — перезапустите приложение",
          kind: "success",
        });
      } else if (status === "up-to-date") {
        setUpdateStatus({
          text: "Обновлений нет — у вас последняя версия",
          kind: "success",
        });
      } else {
        setUpdateStatus({
          text: "Ошибка проверки: " + ((r && r.error) || "неизвестно"),
          kind: "error",
        });
      }
    } catch (e: any) {
      setUpdateStatus({
        text: "Ошибка: " + (e && e.message ? e.message : String(e)),
        kind: "error",
      });
    } finally {
      setChecking(false);
    }
  }, []);

  return createElement(
    "div",
    { className: "ck-tab ck-tab-active" },
    createElement(
      "div",
      { className: "ck-about-head" },
      createElement(
        "div",
        { className: "ck-about-logo" },
        iconUrl
          ? createElement("img", {
              src: iconUrl,
              alt: "Cookie Code",
              style: {
                width: "100%",
                height: "100%",
                objectFit: "contain",
                borderRadius: "inherit",
              },
            })
          : "C",
      ),
      createElement("div", { className: "ck-about-title" }, "Cookie Code"),
      createElement(
        "div",
        { className: "ck-about-ver" },
        "Версия ",
        createElement("span", null, version),
      ),
    ),
    createElement(
      "div",
      { className: "ck-about-group" },
      createElement("div", { className: "ck-about-group-title" }, "Обновления"),
      createElement(
        "button",
        {
          className: "ck-btn",
          onClick: checkUpdate,
          disabled: checking,
          style: checking ? { opacity: 0.6, cursor: "default" } : undefined,
        },
        checking ? "Проверка…" : "Проверить обновления",
      ),
      updateStatus
        ? createElement(
            "div",
            {
              className: "ck-about-update-status",
              style: {
                marginTop: 10,
                fontSize: 12,
                color:
                  updateStatus.kind === "error"
                    ? "#e55"
                    : updateStatus.kind === "success"
                      ? "#4ade80"
                      : "var(--ck-text-dim)",
              },
            },
            updateStatus.text,
          )
        : null,
    ),
    createElement(
      "div",
      { className: "ck-about-group" },
      createElement("div", { className: "ck-about-group-title" }, "Исходники"),
      createElement(
        "p",
        { className: "ck-about-tip" },
        "Открытый проект — поставьте звезду, если нравится.",
      ),
      createElement(
        "a",
        { className: "ck-about-link", onClick: openGithub },
        "github.com/merfiDEV/Cookie-code",
      ),
    ),
  );
}
