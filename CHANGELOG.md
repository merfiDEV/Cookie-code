# Changelog

## [4.0.35] - 2026-09-29

### Added

- 🎤 **Голосовые сообщения теперь превращаются в текст — и всё это прямо у тебя на компьютере!** 🎉 Никаких облаков и сторонних сервисов — расшифровкой занимается локальный Whisper:
  - 🧠 новый модуль `botsrc/whisper.js`: сам скачает `whisper-cli.exe` (+ DLL) и GGML-модель, сконвертирует аудио через ffmpeg в WAV 16 kHz mono и вернёт чистый текст;
  - ⚙️ в настройках (вкладка Telegram) появился блок «🎤 Распознавание голоса (Whisper)» — включаешь одной галочкой и настраиваешь под себя:
    - размер модели: лёгкая / средняя / тяжёлая 🪶⚖️🏋️;
    - язык распознавания: авто, RU, EN, UK, DE, FR, ES, ZH 🌍;
    - при желании — свои пути к `whisper-cli.exe` и `ffmpeg`;
  - ⬇️ кнопки «Скачать whisper-cli», «Скачать модель» и «Удалить Whisper» — со статусом (exe / модель / ffmpeg) и прогрессом загрузки, чтобы всё было наглядно;
  - 💌 распознанный текст прилетает в Telegram отдельным сообщением, а если включён приём сообщений в чат (chatFeed) — аккуратно вставляется в поле ввода DeepSeek с пометкой о возможных неточностях;
  - 🆘 если что-то не готово — бот подскажет по-человечески: нет `whisper-cli.exe`, не скачана модель или не найден `ffmpeg`;
  - 📦 без внешних npm-зависимостей — только встроенный `fetch` (Node 18+/Electron), чтобы ничего лишнего не тянуть.

### Changed

- 💬 **Бот больше не игнорирует голосовые и аудио** — раньше они молча пропадали, теперь `msg.voice`/`msg.audio` честно распознаются как контент; в `/help` добавили пункт про распознавание голоса, чтобы ты знал о возможности :)
- 🧹 **Небольшая уборка форматирования в `src/main/ipc.js` и `src/preload/api.js`** — выровняли отступы в блоках `init-project`, `set-project-dir`, `list-sessions` и обработчиках инструментов. Логика не тронута, просто стало опрятнее.

### Added (EN)

- 🎤 **Voice messages turn into text — right on your machine!** 🎉 No clouds or third-party services — transcription runs on a local Whisper:
  - 🧠 new module `botsrc/whisper.js`: downloads `whisper-cli.exe` (+ DLL) and a GGML model, converts audio via ffmpeg to 16 kHz mono WAV, and returns clean text;
  - ⚙️ a new "🎤 Voice recognition (Whisper)" block in settings (Telegram tab) — flip one checkbox and tune it your way:
    - model size: light / medium / heavy 🪶⚖️🏋️;
    - recognition language: auto, RU, EN, UK, DE, FR, ES, ZH 🌍;
    - optional custom paths to `whisper-cli.exe` and `ffmpeg`;
  - ⬇️ "Download whisper-cli", "Download model", and "Remove Whisper" buttons — with a status line (exe / model / ffmpeg) and download progress, so everything stays clear;
  - 💌 the transcribed text arrives in Telegram as a separate message and, when chat feed is enabled, is gently inserted into the DeepSeek chat input with a note about possible inaccuracies;
  - 🆘 if something is missing, the bot explains it human-style: no `whisper-cli.exe`, model not downloaded, or `ffmpeg` not found;
  - 📦 no external npm dependencies — built-in `fetch` only (Node 18+/Electron), nothing extra pulled in.

### Changed (EN)

- 💬 **The bot no longer ignores voice and audio** — they used to vanish silently; now `msg.voice`/`msg.audio` are properly treated as content, and `/help` mentions voice recognition so you know it's there :)
- 🧹 **A bit of formatting tidy-up in `src/main/ipc.js` and `src/preload/api.js`** — indentation aligned in the `init-project`, `set-project-dir`, `list-sessions` blocks and tool handlers. No logic changed, just neater.

## [4.0.34] - 2026-09-26

### Added

- 📤 **Инструмент `attach_telegram` — отправка файлов в Telegram** — AI может прикрепить любой локальный файл и отправить его прямо в чат с ботом:
  - JS-API `attachTelegram(filePath, caption?, comment?)`: `caption` — подпись к файлу, `comment` — то, что AI хочет добавить от себя (зачем файл, что внутри, на что обратить внимание);
  - если задан только `comment`, он уходит подписью; если заданы оба — `comment` дописывается к `caption` отдельной строкой;
  - лимит 45 МБ (запас под лимит Telegram в 50 МБ), подпись и комментарий обрезаются до 1024 символов;
  - отправка через уже настроенного бота (`telegramBot.sendDocument`) — новых зависимостей нет;
  - файлы больше лимита, отсутствующий файл или ненастроенный бот возвращают понятную ошибку;
  - объявление в `cuckoo-tools.d.ts`, обёртка `attachTelegram` в песочнице `JsRunner`.
- 📁 **Telegram-бот: выбор проекта кнопками** — новая команда `/projects` (алиасы `/project`, `/proj`) открывает список проектов inline-клавиатурой:
  - список собирается из сохранённых связок «сессия → проект» активного профиля, плюс текущий проект;
  - постраничный вывод по 8 проектов с кнопками «◀️ Назад / Вперёд ▶️» и счётчиком страниц;
  - выбор проекта переключает окно на **существующую сессию** этого проекта (та же навигация, что и `/switch`) — новый чат не создаётся;
  - кнопка «⌨️ Ввести путь вручную» принимает абсолютный путь к папке следующим сообщением;
  - если проект не выбран, команды `/diff`, `/log`, `/sessions` показывают сообщение вместе с клавиатурой выбора.

### Changed

- 📜 **`/log` и `/sessions` редактируют сообщение, а не плодят новые** — при повторном вызове и при листании страниц бот обновляет уже отправленное сообщение (`editMessageText`); если сообщение было удалено вручную — отправляется новое.
- 🆕 **`/new` сообщает результат** — вместо тишины или `⚠️ undefined` бот отвечает явно: «🆕 Новый чат открыт», «⚠️ Нет активного окна…» или «❌ Не удалось открыть новый чат: \<причина\>».
- 🌐 **Язык бота больше не навязывается** — `readSettings()` отдаёт ровно то, что записано в файле настроек, без подстановки языка системы; при `/start` бот больше не требует принудительно выбрать язык, а сразу показывает справку.

### Fixed

- 🐛 **`/new` не отвечал** — `newChat()` делает `loadURL` на домашнюю страницу и выгружает JS-контекст окна, поэтому `executeJavaScript` с ожиданием результата зависал навсегда. Теперь вызов «выстрелил-и-забыл», а ответ приходит сразу.
- 🐛 **Пагинация выбора проекта падала** — `ReferenceError: msgId is not defined` в обработчике callback-кнопок; id сообщения теперь берётся из `cbq.message`, а при неудачном редактировании есть фолбэк на отправку нового сообщения.
- 🐛 **Выбор проекта не применялся в приложении** — установка проекта по известному пути не переключала окно на его сессию. Добавлен IPC `set-project-dir` (+ `setProjectDir` в preload и `setProjectByDir` в main): поиск сессии по папке проекта и навигация на неё.
- 🐛 **Ошибка `setProjectDir недоступен в окне`** — метода не существовало; добавлен полный путь IPC → preload → main.

### Removed

- 🧹 **Принудительная фиксация языка DeepSeek** — удалён модуль `src/preload/dom/deepseek-language.js`, который переключал Language на «Система» и блокировал селект (`pointer-events:none`, `aria-disabled`, гашение `onMouseDown`/`onKeyDown`). Язык интерфейса DeepSeek снова выбирается пользователем свободно.

### Added (EN)

- 📤 **Tool `attach_telegram` — send files to Telegram** — the AI can attach any local file and send it straight to the chat with the bot:
  - JS API `attachTelegram(filePath, caption?, comment?)`: `caption` is the file caption, `comment` is an extra note the AI adds itself (why the file, what's inside, what to look at);
  - if only `comment` is given, it becomes the caption; if both are given, `comment` is appended to `caption` on a separate line;
  - 45 MB limit (headroom under Telegram's 50 MB cap), caption and comment are truncated to 1024 chars;
  - sent through the already-configured bot (`telegramBot.sendDocument`) — no new dependencies;
  - oversized files, a missing file, or an unconfigured bot return a clear error;
  - declared in `cuckoo-tools.d.ts`, wrapped as `attachTelegram` in the `JsRunner` sandbox.
- 📁 **Telegram bot: pick a project with buttons** — the new `/projects` command (aliases `/project`, `/proj`) opens a project list as an inline keyboard:
  - the list is built from saved "session → project" mappings of the active profile plus the current project;
  - paged output, 8 projects per page, with "◀️ Back / Next ▶️" buttons and a page counter;
  - picking a project switches the window to the **existing session** of that project (same navigation as `/switch`) — no new chat is created;
  - the "⌨️ Enter path manually" button accepts an absolute folder path as the next message;
  - if no project is selected, `/diff`, `/log`, and `/sessions` show the message together with the project picker.

### Changed (EN)

- 📜 **`/log` and `/sessions` edit the message instead of posting new ones** — on repeat calls and when paging, the bot updates the message it already sent (`editMessageText`); if the message was deleted manually, a new one is sent.
- 🆕 **`/new` reports the result** — instead of silence or `⚠️ undefined`, the bot answers explicitly: "🆕 New chat opened", "⚠️ No active window…", or "❌ Failed to open a new chat: \\<reason\\>".
- 🌐 **The bot language is no longer forced** — `readSettings()` returns exactly what is stored in the settings file, with no system-language substitution; on `/start` the bot no longer demands a language choice and just shows help.

### Fixed (EN)

- 🐛 **`/new` did not respond** — `newChat()` calls `loadURL` to the home page, which unloads the window's JS context, so `executeJavaScript` awaiting a result hung forever. The call is now fire-and-forget and the reply comes back immediately.
- 🐛 **Project picker pagination crashed** — `ReferenceError: msgId is not defined` in the callback-button handler; the message id is now taken from `cbq.message`, and a failed edit falls back to sending a new message.
- 🐛 **Project selection did not apply in the app** — setting a project by a known path did not switch the window to its session. Added the IPC `set-project-dir` (plus `setProjectDir` in preload and `setProjectByDir` in main): it finds the session by project folder and navigates to it.
- 🐛 **"setProjectDir is unavailable in the window" error** — the method did not exist; the full IPC → preload → main path was added.

### Removed (EN)

- 🧹 **Forced DeepSeek language lock** — deleted the `src/preload/dom/deepseek-language.js` module, which switched Language to "System" and locked the select (`pointer-events:none`, `aria-disabled`, neutered `onMouseDown`/`onKeyDown`). The DeepSeek UI language can be chosen freely by the user again.

## [4.0.33] - 2026-09-23

### Added

- ⏳ **Уведомление в Telegram о долгих процессах с кнопкой «🛑 Убить процесс»** — если команда bash/pwsh или скрипт AI выполняется дольше 10 секунд, бот присылает сообщение с таймером и кнопкой экстренной остановки:
  - работает для любых команд: и запущенных AI через `JsRunner`, и классических инструментов `bash`/`pwsh`, и ручных запусков из блоков кода в чате :)
  - по нажатию кнопки процесс мгновенно завершается вместе со всем деревом процессов (`taskkill /T /F` на Windows);
  - сообщение в Telegram красиво обновляется на «🛑 Процесс остановлен пользователем» или сообщает, если процесс уже успел завершиться сам;
  - если Telegram-бот в настройках выключен или не настроен — приложение работает в обычном режиме без задержек и лишних запросов.

### Fixed

- 🪓 **Остановка зависших процессов** — теперь кнопка завершения в Telegram корректно находит активный дочерний процесс и гарантированно гасит всё дерево процессов на Windows.
