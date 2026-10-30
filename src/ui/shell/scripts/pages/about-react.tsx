/** About 页 (React-версия, для Cookie Code) */
import { createElement, useState, useEffect, useCallback } from "react";
import { api } from "../shared.js";

export function AboutPage() {
  const [version, setVersion] = useState("—");

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
  }, []);

  const openGithub = useCallback(() => {
    const anyApi = api as any;
    if (anyApi.openExternal)
      anyApi.openExternal("https://github.com/merfiDEV/Cookie-code");
  }, []);

  const checkUpdate = useCallback(() => {
    const anyApi = api as any;
    if (anyApi.checkUpdate) anyApi.checkUpdate();
  }, []);

  return createElement(
    "div",
    { className: "ck-tab ck-tab-active" },
    createElement(
      "div",
      { className: "ck-about-head" },
      createElement("div", { className: "ck-about-logo" }, "C"),
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
        { className: "ck-btn", onClick: checkUpdate },
        "Проверить обновления",
      ),
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
