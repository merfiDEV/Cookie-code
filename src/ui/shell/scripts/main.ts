window.addEventListener("error", (e) =>
  console.error("[shell] window.error:", e.message, e.error && e.error.stack),
);
window.addEventListener("unhandledrejection", (e) =>
  console.error("[shell] unhandledrejection:", e.reason),
);
/**
 * 壳页面脚本入口（React 版，feat/shell-react）
 *
 * React 接管：侧栏（shell-frame）+ 状态栏（statusbar）+ 13 个页面。
 * 旧的原生 pages 已停用（文件保留，未删；见 docs/requirements/023-shell-react.md）。
 *
 * 仍保留的旧模块（非侧栏 / React 未覆盖）：
 *   toolbar    地址栏/导航
 *   preview    文件预览（React Files 页通过 openPreview 调用）
 *   platform   平台相关
 *   plugin-shell  插件界面挂载（状态栏/工具栏/侧栏槽）
 *   theme-presenter  主题（写 --ck-* 变量）
 */
import { api } from "./shared.js";
import "./toolbar.js";
import "./preview.js";
import "./platform.js";

import { initThemePresenter } from "./theme-presenter.js";
import { mountShellFrame, registerPage } from "./shell-frame.js";
import { mountStatusBar } from "./statusbar.js";
import { bindInitPrompt } from "./init-prompt.js";
import { installAutoTranslate } from "./i18n.js";
import { HomePage } from "./pages/home-react.js";
import { TokenPage } from "./pages/token-react.js";
import { AboutPage } from "./pages/about-react.js";
import { SkillsPage } from "./pages/skills-react.js";
import { McpPage } from "./pages/mcp-react.js";
import { SnippetsPage } from "./pages/snippets-react.js";
import { ConversationsPage } from "./pages/conversations-react.js";
// SettingsPage 改为全屏模态（shell-frame 直接引入），不再注册为 tab
import { AgentsPage } from "./pages/agents-react.js";
import { FilesPage } from "./pages/files-react.js";
import { WorkspacesPage } from "./pages/workspaces-react.js";

// 插件界面挂载（接收主进程 shell-plugin-mount）

// 主题呈现层（消费主进程快照，写 --ck-* 变量）
try {
  initThemePresenter();
} catch (_) {
  /* ignore */
}

// ⚛ React 壳框架（feat/shell-react）
try {
  registerPage("home", HomePage);
  registerPage("about", AboutPage);
  registerPage("skills", SkillsPage);
  registerPage("mcp", McpPage);
  registerPage("token", TokenPage);
  registerPage("snippets", SnippetsPage);
  registerPage("conversations", ConversationsPage);
  // settings 页改为全屏模态（见 shell-frame.tsx），不注册为 tab
  registerPage("agents", AgentsPage);
  registerPage("files", FilesPage);
  registerPage("workspaces", WorkspacesPage);
  mountShellFrame();
  mountStatusBar();
  bindInitPrompt();
  try {
    installAutoTranslate();
  } catch (e) {
    console.error("[i18n] install failed:", e);
  }
  // 加载 DSH 插件 client 入口（异步，失败不影响壳）
} catch (e) {
  console.error("[react-shell] 挂载失败", e);
}

// 上报壳页面真实可视尺寸
function reportShellSize(): void {
  if (api.reportShellSize)
    api.reportShellSize(window.innerWidth, window.innerHeight);
}
reportShellSize();

// Главный канал раскладки: измеряем реальный .viewport из DOM и шлём в main.
// AI-view (WebContentsView) ставится ровно в эти координаты — больше никакой
// хардкод-математики (сайдбар 320/48, toolbar, statusbar — всё берётся из CSS).
function reportLayout(): void {
  const vp = document.querySelector(".viewport") as HTMLElement | null;
  if (!vp) return;
  const r = vp.getBoundingClientRect();
  const anyApi = api as any;
  if (anyApi.reportLayout) {
    anyApi.reportLayout({
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
    });
  }
}
// Дёргаем на: старте, resize, скролле layout-панелей (sidebar toggle).
reportLayout();
window.addEventListener("resize", () => {
  reportShellSize();
  reportLayout();
});
// На случай шрифтов/картинок, меняющих высоту — ещё раз через 300ms и 1.5s.
setTimeout(reportLayout, 300);
setTimeout(reportLayout, 1500);
// ResizeObserver на .viewport — ловит любые изменения сайдбара/тулбара.
try {
  const vp = document.querySelector(".viewport");
  if (vp) {
    const ro = new ResizeObserver(() => reportLayout());
    ro.observe(vp);
    ro.observe(document.querySelector(".main-area") || document.body);
  }
} catch (_) {}
