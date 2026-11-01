# Changelog

## [5.0.10] - 2026-11-01

Всем привет! 👋 Этот релиз — большой: у нас наконец-то появился **полноценный интерфейс в стиле VS Code**. Ниже — всё, что изменилось, простым языком. 🚀

### Added

- 🖥 **Новый Shell-интерфейс в стиле VS Code** — встречайте ==полностью новый UI==, собранный из partials и бандла React/TS:
  - аккуратная модульная структура в `src/ui/shell/` (`index.html` с `<!--@include:...-->`, partials для toolbar, activity bar, status bar, модалок и страниц, а также стили `base/components/pages/dsh-tokens`);
  - activity bar для переключения страниц, сворачиваемая боковая панель и status bar;
  - страницы на любой вкус: **Files, Git, Settings, Agents, MCP, Skills, Snippets, Workspaces, Conversations, Token, About**;
  - встроенный **Monaco Editor** — тот самый редактор из VS Code 🎉 (вендоринг в `src/ui/vendor/monaco`);
  - темы (`theme-presenter`), фоны, шрифты и даже «питомцы» — всё настраивается в настройках.
- 🧩 **Много-много IPC-хендлеров для Shell** в `src/main/shell-ipc.js` (`shell-*`) — теперь приложение умеет:
  - навигацию и историю окна (`shell-navigate/back/forward/reload/home`), а также minimize/maximize/close/is-maximized;
  - работать с проектом: выбор каталога, `shell-init-project`, дерево файлов, чтение файла, dir-info;
  - управлять сессиями: список всех сессий, архивирование, переименование;
  - настройки: `get/save/reset-settings`, auto-compact и триггер compact;
  - сниппеты, skills, агентов, MCP-серверы;
  - профили и провайдеры, web-сессии;
  - темы, фоны, шрифты, «питомцев», логи, апдейты и внешние ссылки.
- 🐙 **Git прямо из приложения** — новый модуль `src/main/git-gitops.js` (вдохновлён git-расширением VS Code) и страница **Git** (`git-react.tsx`):
  - `getRemotes`, `getBranchStatus` (upstream, ahead/behind), `commitAll`, `push`, `pull`, `fetchRemote`, `publish`, `sync`;
  - все команды запускаются через `execFile("git", args)` в каталоге проекта с буфером 8 МБ.
- ✏️ **Редактирование кода прямо в Monaco-превью** — страница Files (`files-react.tsx`) и `preview-monaco.ts`:
  - открывай файл в Monaco, редактируй и сохраняй через IPC;
  - `getMonacoValue()` помогает забрать содержимое из редактора;
  - подсветка расширений, иконки папок/файлов и поиск по дереву.
- 🔔 **Telegram-алерты синхронизируются с процессами** (`0544956`):
  - долгие процессы трекаются по **PID**: если убить процесс с ПК (в том числе `kill-all`), кнопка «убить» из сообщения в Telegram исчезает;
  - добавили ru/en-сообщения «остановлено с ПК» в `botsrc/i18n.js`, логика — в `process-manager.js` и `botsrc/index.js`.

### Changed

- 🎛 **Настройки переехали и стали удобнее** (`60c98d6`) — `settings-react.tsx` переписан:
  - новая вёрстка на компонентах `setting-row`, `select`, `ui-button`;
  - изменения применяются ==сразу==, без перезапуска (`shell-save-settings` → live-apply);
  - дополнен `shell-ipc.js`, обновлены `components.css` и `main.ts`.
- 🧱 **Окно перешло на Shell** — затронуты `src/main/index.js`, `window.js`, `preload/index.js`; появился `shell-preload.js` (мост API shell) и `shell-api.ts` на стороне UI.
- 🗂 **`settings-store.js`** немного причесали (`d1a7aad`): уточнили хранение и комментарии.
- 🏗 **Сборка и CI** (`51d506f`): `scripts/build-shell.mjs` и `scripts/copy-monaco.mjs` собирают Shell и копируют Monaco **до** `electron-builder`, скрипты прописаны в `package.json`.
- 📄 **README** (ru/en) обновлён под новый интерфейс и возможности.

### Fixed

- 🐛 **Починили устаревшие тесты** — `test/main/session-store.test.js`, `test/main/window.test.js` и `test/preload/commands.test.js` приведены в соответствие с новым Shell-окном и API.
- 🩹 **Стабильность макета Shell** — серия правок (`MAJOR UPDATE`, `major2`, `major3`) поправила layout: sidebar, модалки, страницы и токены темы (см. `base.css` / `shell.html`).
- 📊 **Stats dashboard, recorder и tool-render** — подкрутили отображение статистики и инлайн-рендер результатов инструментов под новую тему.
- 🧹 Мелкие фиксы `exit-plan-mode`, `whats-new`, `observer`, `continue-button` и `tps`.

### Removed

- ~~Старый монолитный `src/ui/shell.html`~~ — теперь всё собирается из partials (`src/ui/shell/index.html` + `scripts/build-shell.mjs`).
- Удалили устаревший ассет `assets/петы.jpg` — на его месте новое изображение.

Спасибо, что пользуетесь Cookie Code! 💚
