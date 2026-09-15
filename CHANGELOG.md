# Changelog

## [Unreleased]

### Added
- _Нет незарелиженных изменений — всё ниже разнесено по версиям._

## [4.0.19] - 2026-09-15

### Added
- **Учёт токенов диалога**: панель «Токены диалога» с оценкой всего диалога из DOM (CJK 0.6 / ASCII 0.3), сохранение по `sessionId` в localStorage, обновление раз в секунду, на `popstate`/`hashchange` и `beforeunload`; формат K/M вместо китайского «万»
- **Токены под ответом AI**: оценка токенов именно этого ответа под каждым сообщением
- **Перехват серверных токенов DeepSeek** (`token-interceptor`): точные значения usage из ответов DeepSeek + настройка видимости
- **What's New**: модальное окно нововведений при первом запуске после обновления
  - `src/main/changelog-parser.js` — парсер CHANGELOG.md (диапазон версий, semver-сравнение)
  - `src/main/whats-new.js` — логика check-and-mark, атомарная запись состояния
  - `src/preload/dom/whats-new.js` — одноразовый модал в рендерере; CHANGELOG.md включается в сборку
- **Диагностика интеграции** (`src/preload/dom/diagnostics.js`) — инструмент и UI проверки связки main/preload/сайт

### Changed
- **Удалён Claude-провайдер** (`src/providers/claude.js`, промпт, лого, тесты)
- Удалён мёртвый код network-hook (`src/interceptor/`, `intercept-observer.js`, `serverTokenUsage`, `useIntercept`)
- Обновлён UI вкладки настроек (`settings-tab.js`)
- Убран устаревший хелпер tryOpenInVSCode

## [4.0.18] - 2026-09-14

### Added
- **Авто-форматтеры** после `write`/`edit`: файл автоматически приводится к стилю проекта
  - Встроенный реестр: prettier, biome, gofmt, ruff, rustfmt, shfmt, clang-format
  - Определение по расширению + наличию конфига + бинарю в `PATH` или `node_modules/.bin`
  - Отключается флагом `formattersEnabled: false` в `cuckoo-settings.json`
  - Ошибки форматтера никогда не ломают `write`/`edit`
  - Кнопка вкл/выкл в настройках Cookie Code; документация в README (EN + RU)
- **Режим плана (Plan Mode)**: кнопка-тумблер, per-session режим, перетаскиваемый диалог плана, инструмент `exit_plan_mode`
- **Produced files** под ответом AI (факт-ориентированно, только успешные операции), ru/en i18n, настройка `showProducedFiles`, тесты
- **Бейджи +/− строк** по каждому блоку diff в ответе
- **Telegram-бот**: команды `/help` и `/settings` с полным меню настроек

### Fixed
- `meta.produced` label: «Создано» → «Затронуто» / Produced → Affected
- i18n overlay: `OVERLAY_HTML` → `buildOverlayHTML()` — пересборка при смене языка

## [4.0.17] - 2026-09-14

### Added
- **File-path chips**: кликабельные чипы путей (абсолютный + относительный через `projectDir`) с открытием в VS Code / проводнике и настройкой видимости
- **Produced files** под ответом AI (базовый вариант) + ru/en i18n
- Override QR-кода скачивания приложения DeepSeek — свой QR и ссылка на Telegram
- `safe()`-обёртка для защиты от изменений DOM DeepSeek

### Fixed
- `meta.produced` label: Создано → Затронуто / Produced → Affected

## [4.0.16] - 2026-09-14

### Added
- Модуль review context для сбора diff
- Команда `summarize` — краткий итог текущей сессии

### Fixed
- Остановка задачи работает без дочернего процесса

## [4.0.15] - 2026-09-13

### Added
- Стеклянный эффект (glass) для поля ввода DeepSeek

### Fixed
- Иконка приложения в окне и уведомлениях

## [4.0.14] - 2026-09-13

### Changed
- Доработаны UI подтверждения (approval) и inline-результатов

## [4.0.13] - 2026-09-13

### Changed
- Технический релиз (bump версии)

## [4.0.12] - 2026-09-13

### Added
- Подтверждение вызовов инструментов через Telegram (approve tool calls)

## [4.0.11] - 2026-09-13

### Changed
- Скрытие системных сообщений отключено по умолчанию (`hideSystemMessages: false`)

## [4.0.10] - 2026-09-13

### Added
- **Approval gate**: подтверждение вызовов инструментов и JS-блоков
- Inline-результаты инструментов внутри карточек вызовов
- Скрытие service-сообщений в чате для чистого UI

### Fixed
- Stealth-режим пропускал service-сообщения в актуальном UI DeepSeek

## [4.0.9] - 2026-09-13

### Added
- Инструмент `read_photo` — вставка изображений в чат
- Ответы на вопросы AI через inline-клавиатуру Telegram

## [4.0.8] - 2026-09-13

### Added
- Цвета темы, кастомные фоны, перетаскиваемый overlay
- Унифицированы кнопки настроек, добавлена секция Service

## [4.0.7] - 2026-09-12

### Added
- Иконки приложения + папка кастомных фонов

## [4.0.6] - 2026-09-12

### Added
- Принудительная тёмная тема на сайте

## [4.0.5] - 2026-09-12

### Added
- Интерактивный инструмент вопросов пользователю (user question tool)
- Глобальный тумблер кастомизации

## [4.0.3] - 2026-09-12

### Changed
- Язык по умолчанию берётся из системной локали

## [4.0.2] - 2026-09-12

### Changed
- CI: bump версии от max(package.json, последний тег) — защита от коллизий тегов
- CI: исправлен парсинг YAML (`build.yml`), релизный пайплайн снова включён
- Синхронизированы CI-воркфлоу, упрощён `release.bat`, скриншоты в README

### Fixed
- Восстановлен оригинальный скриншот Telegram-бота

## [4.0.1] - 2026-09-12

### Changed
- Лицензия переключена на MIT, новые скриншоты Telegram-бота

## [4.0.0] - 2026-09-12

### Added
- **Панель Todo**: список задач, store и инструменты; фикс всплытия панели/таба при неизменном списке
- **Панель «Изменения»** с git diff + вкладка «История» для просмотра прошлых коммитов
- **@-file mentions**: автодополнение файлов проекта при вводе `@`; результаты-директории в file picker
- **Telegram**: команда `/todos` и уведомление о завершении задач
- i18n overlay: локализованы строки ручного парсинга и выполнения инструментов
- Updater: UI переведён на английский, апдейты указывают на merfiDEV/Cookie-code

### Changed
- Лицензия переключена на MIT; `release.bat` адаптирован под origin
- Удалены `LICENSE` и `HANDOFF_MCP.md`

## [0.3.6] - 2026-09-08

### Fixed
- 添加标准编辑菜单，修复 macOS 无法在 DeepSeek 输入框复制/粘贴的问题

## [0.3.5] - 2026-09-08

### Fixed
- glob/grep 工具打包后 ripgrep ENOENT，通过 asarUnpack 解包二进制并修正运行路径
- 恢复 README 中 Codecov 覆盖率徽章

## [0.3.4] - 2026-09-07

### Fixed
- pwsh 工具改用 execFile，避免管道符被 cmd 预解析导致命令残缺
- 主窗口 UA 改为 Chrome 130 普通标识，避免 DeepSeek 提示隐私风险
- openBrowserWindow 工具窗口同步设置 Chrome 130 UA，不再暴露 Electron 标识
- XML invoke 检测不再要求必须位于文本开头，并避免提示语自触发循环
- 渲染进程可通过 --cuckoo-user-data 参数加载自定义 Provider

### Added
- Provider 发送扩展接口（provider.triggerSend），支持站点原生发送
- 流式稳定性双通道校验（mutation 快照 + interval 兜底）
- 完成检测兜底轮询（每 2s 主动复查），覆盖后台/最小化漏触发场景
- MCP 工具调用识别（await mcpXxx / log(await xxx））
- 无 pre 的 .md-code 代码容器兜底

### Changed
- 会话 ID 提取与跳转 URL 改为 Provider 方法，不再硬编码 DeepSeek 格式

## [0.3.0] - 2026-09-07

### Added
- 多平台 Provider 框架：支持 DeepSeek 与 Claude，按平台区分输入框/发送按钮/用户信息/消息解析
- 平台选择页：新窗口未指定平台时展示卡片式选择页（含官方品牌 logo）
- 提示词模板化：每平台独立模板，支持 `{{PLATFORM_INFO}}` `{{TOOL_API_TYPES}}` `{{TOOLS_LIST}}` `{{TOOL_SECTIONS}}` `{{PROJECT_DIR}}` `{{PROJECT_INTRO_SECTION}}` `{{MCP_SECTION}}` 占位符
- 自定义 Provider 功能：用户可通过平台选择页导入 JS 文件，支持复制到 userData、重名替换、删除前窗口占用检查
- 自定义 Provider 类型声明与模板：`src/providers/custom/provider.d.ts` + `provider.template.js`
- Provider 方法化：平台差异全部下沉到 Provider 方法（findInput/findSendButton/isResponseComplete/getMessageCandidates 等）
- Claude 自动解析：基于停止按钮边沿触发完成检测，跳过空消息，避免重复触发
- 按平台分文件记录渲染日志到 `wyp/log/{providerId}.log`
- 新增 Provider 单元测试

### Changed
- 系统提示词由单文件改为多平台模板，运行时按 providerId 选择并替换占位符
- 工具 API 类型定义从 `tools/cuckoo-tools.d.ts` 动态读取，避免多处维护
- 平台 logo 从首字母占位改为官方 SVG

### Fixed
- Claude 自动解析重复触发/漏触发问题
- 多个 `{{PROJECT_DIR}}` 占位符只替换第一个的问题
- 导入自定义 Provider 后源文件被删导致失效的问题

---

## [0.2.5-beta.1] - 2026-09-02

### Added
- 新增 MCP（Model Context Protocol）按需查询能力
  - mcpListServers() 查看已配置的 MCP server（名称/类型/状态/工具数/工具名）
  - mcpGetTools(serverName) 查看指定 server 的工具详情（描述+参数）
  - mcpCall(server, tool, args) 调用 MCP 工具
- MCP 启动时自动连接已启用的 server，初始化项目时等待连接（8 秒超时）
- MCP 配置保存前完整 JSON 结构校验（错误时明确提示且不覆盖输入）
- MCP 配置保存后弹确认框，由用户决定是否通知 AI（避免打断 AI 操作）
- showConfirmDialog 扩展支持确认/取消双按钮 + Promise 返回（向后兼容）
- 新增 McpCallTool、McpQueryTools 单元测试

### Changed
- MCP 提示词改为按需查看模式，不再全量注入工具列表（节省 token）
- MCP 保存后的自动通知改为简短格式，引导 AI 按需查询
- 移除 .cuckooCode/CUCKOO.md 作为全局项目介绍（避免干扰其他项目场景）

### Fixed
- 修复 connectEnabledServers 从未被调用导致 MCP 启动后未连接的问题
- 修复 initProject 同步逻辑中 MCP 连接时序竞态（改为 async + 等待）

---

## [0.2.0] - 2026-08-27

### Breaking Changes
- 主进程重构：main.js 拆分为 src/main/ 模块（应用生命周期、IPC、项目上下文、会话存储分离）
- preload 重构：preload.js 拆分为 src/preload/ 模块（DOM 监测、overlay UI、工具解析分离）
- 移除 MySQLTool.js（已无维护，提示词中不再暴露）
- 移除旧版工具桥接实现（ToolBridge.js、UnifiedToolManager.js、WebContentCapturer.js）
- bash/pwsh 不再强制要求 description 参数（改为可选）

### Added
- 新增 5 个对标 dsh 的工具实现：
  - read（offset/limit 分段读取，替代 readFile）
  - write（全量覆盖，替代 writeFile）
  - edit（精确替换，替代 editFile）
  - glob（ripgrep 引擎，替代旧 GlobTool）
  - grep（ripgrep JSON 输出，替代旧 GrepTool）
- 新增 todoWrite 工具（全量任务列表，对标 dsh todo_write）
- 新增 pwsh 工具（PowerShell 执行，对标 dsh tool-pwsh）
- 新增 webFetch 工具（HTML 转 Markdown，对标 dsh web_fetch）
- 新增 openBrowserWindow / injectJS 工具（打开调试窗口并注入 JS）
- 工具系统支持 section 机制（对标 dsh systemPrompt.section），每个工具有独立的 prompt section
- 系统提示词全面改版：中文 dsh 风格 + 动态平台检测（Windows/macOS/Linux）
- 发送延迟可配置（UI 设置 + localStorage 持久化）
- UI 全面改版：悬浮球模式（48px 右下角 FAB + 小面板），不再占用全高侧边栏
- 跨平台启动脚本 start.js（Windows/macOS/Linux 通用）
- 完整单元测试覆盖（tools / main / preload）

### Changed
- package.json start 脚本改为 node start.js（修复 macOS chcp: command not found）
- start.js 自动根据平台选择 UTF-8 编码设置
- 工具返回格式统一为 dsh 风格（纯文本 envelope / marker）
- 错误提示统一为英文 dsh 风格
- package.json 增加 allowScripts 配置（npm 新版本 electron postinstall 被阻止问题）

### Fixed
- edit 工具 CRLF 适配（LF 的 old_string 能匹配 CRLF 文件）
- bash/pwsh 非零退出不再报错，改用 [exit code: N] 标记
- glob 路径去掉 ./ 前缀
- Windows 平台信息动态生成（不再硬编码）
- Electron postinstall 被 npm allowScripts 阻止导致二进制缺失的问题
- JS 脚本无输出时提示使用 log()

### Security
- bash/pwsh 危险命令黑名单保留（Windows + PowerShell 特有命令）
- 命令执行超时限制保持 30 秒
- 输出缓冲 1MB 限制保持

### Dependencies
- 新增 @vscode/ripgrep（glob/grep 底层引擎）
- 新增 turndown + @joplin/turndown-plugin-gfm（webFetch HTML 转 Markdown）

---

## [1.0.0] - 2026-08-11

### Added
- 初始版本发布
- Electron 桌面应用，嵌入 DeepSeek 网页版
- 自动检测 AI 回复中的 cmd/powershell 代码块，弹窗确认后执行
- 工具调用系统：支持 file_write、file_read、file_edit、file_glob、file_grep、bash、file_delete 等工具
- 会话级项目目录绑定，工具操作以项目目录为基础
- 侧边覆盖层面板，显示命令预览、执行结果和历史记录
- Ctrl+Shift+C 快捷键切换覆盖层
- 项目初始化功能，自动生成目录树并注入系统提示词
- 支持危险命令检测与额外警告
- 会话持久化（cookies/localStorage 保存到 %APPDATA%/cuckoo-code-session）

### Security
- 命令执行前必须用户确认
- 危险命令（rm -rf /、format、shutdown 等）触发额外警告
- 30 秒命令执行超时限制
- 1MB 命令输出缓冲区限制
