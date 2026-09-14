# Cookie Code

<p align="center">
  <a href="https://github.com/merfiDEV/Cookie-code/releases/latest"><img src="https://img.shields.io/github/v/release/merfiDEV/Cookie-code?style=flat-square&color=8b93ff" alt="Latest Release"></a>
  <a href="https://github.com/merfiDEV/Cookie-code/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/merfiDEV/Cookie-code"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-8b93ff?style=flat-square" alt="Platform"></a>
  <a href="https://github.com/merfiDEV/Cookie-code"><img src="https://img.shields.io/badge/Electron-33-47848f?style=flat-square&logo=electron&logoColor=white" alt="Electron"></a>
  <a href="https://github.com/merfiDEV/Cookie-code"><img src="https://img.shields.io/badge/Node.js-%3E%3D%2016-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node"></a>
</p>

<p align="center">
  <strong>English</strong> · <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="assets/photo_1_2026-09-12_19-02-00.jpg" alt="Cookie Code — main window" width="900">
</p>

**Cookie Code** is a zero-token-cost AI Agent for your desktop.

It embeds the DeepSeek web chat into a native Electron window, injects a side overlay, and turns the chat into a local executor: the AI is prompted to emit tool calls (JavaScript code blocks), which are intercepted, confirmed, executed in a local sandbox, and streamed back to the AI. No API key, no token billing — you use your regular web account.

---

## Why it exists

Web chats are great at *thinking*, but they cannot *act* on your machine. Cookie Code closes that loop:

- **Zero token cost** — everything goes through the DeepSeek web UI, no API calls.
- **Real agent loop** — Think → Act → Observe → Repeat. File I/O, code search, shell commands, database queries, MCP tools.
- **Native desktop shell** — Electron wrapper with its own overlay panel, theming, and settings.

---

## Features

### Tool execution

- The AI emits tool calls as JavaScript code blocks (```cuckoo).
- Each call is intercepted, previewed, and executed in a sandboxed Node context.
- Results are streamed back into the chat as a system message.
- Non-zero shell exits (`[exit code: N]`) are highlighted in red under the corresponding tool block.

### Inline tool blocks

Every `cuckoo` block in the chat is decorated into a collapsible card with the tool name, file hint, and execution time:

<p align="center">
  <img src="assets/photo_3_2026-09-12_19-02-00.jpg" alt="Inline tool block — Read" width="800">
  <br>
  <img src="assets/photo_4_2026-09-12_19-02-00.jpg" alt="Inline tool block — Glob" width="800">
</p>

- ▼ icon + tool name (Read / Write / Edit / Bash / Glob / Grep / PowerShell / Todo / WebFetch / MCP / MySQL / …)
- File hint derived from the first argument
- Click to expand/collapse
- Red style + warning icon when the execution failed

The same applies after page reload — the styles are restored from `localStorage`.

### Tool call approval

Tool execution can be gated behind explicit user confirmation (Settings → Cookie Code → **Agent & Privacy**):

- **Off** — tools run automatically (previous behavior).
- **Risky only** — confirmation is requested for dangerous tools (`bash`, `pwsh`, `write`, `edit`, `deleteFile`, `mysql`, `webFetch`, `injectJS`, `mcpCall`, …). Read-only tools (`read`, `glob`, `grep`, `todo`, …) run without asking.
- **All calls** — every tool call and every ```cuckoo JS block asks first.

Each pending call shows a modal card with the tool name and a params/code preview. Buttons: **Deny (Esc)**, **Approve (Enter)**, and **Always allow `<tool>`** (remembered for the current page session only). Denials are reported back to the AI through the regular tool-result channel with an explicit "do not retry" instruction, so the agent waits for your guidance instead of looping.

### Clean chat (hidden service messages)

Service traffic — tool result payloads, JS result digests, the initial system prompt, XML-format hints — still reaches the AI, but is no longer displayed in the chat window:

- After being sent, such user messages are automatically hidden in the DOM (`.cuckoo-hidden-msg`), leaving only the real conversation visible.
- **Tool results are shown inline**: each ```cuckoo tool call card gets a collapsible **Result** section right below the call code — expand the card to see the raw output (`✓ Result`), execution error (`⚠ Execution error`) or a user denial (`⛔ Denied by user`). Results survive page reloads (persisted in `localStorage`) and re-attach to their cards automatically.
- Messages remain in the DOM (just `display: none`), so history parsing, reload restoration, and AI context detection keep working.
- Hidden messages are re-hidden after page reloads via a lightweight observer + periodic rescan.
- Toggle in **Settings → Cookie Code → Agent & Privacy → Hide service messages in chat** (applies instantly, no reload needed).

### Response meta

Under each AI reply you get an automatic badge:

```
⏱ 5.2s · ~380 tok
```

- Real response time measured from stream start to completion
- Estimated token count (`chars / 4`) — a rough approximation
- Persisted in `localStorage`, restored on reload

### Backgrounds

27 hand-picked wallpapers shipped with the app. Pick from a preview grid in **Settings → Cookie Code**:

<p align="center">
  <img src="assets/photo_5_2026-09-12_19-02-00.jpg" alt="Background picker — wallpaper grid" width="500">
</p>

Change instantly, no reload required.

### Blur & transparency

Full control over the UI glass effect:

- Background blur (0–30 px)
- Header blur & sidebar blur
- Header / sidebar / tool-block opacity
- Tool-block glass blur

All settings persist in `cuckoo-settings.json`.

### RGB username

The username in the sidebar has an animated rainbow gradient (enabled by default). Toggle it in **Settings → Cookie Code → Effects**.

### Telegram bot

Control and monitor Cookie Code from your phone:

<p align="center">
  <img src="assets/photo_6_2026-09-12_19-02-00.jpg" alt="Telegram bot settings" width="420">
  <br>
  <img src="assets/photo_1_2026-09-12_19-08-16.jpg" alt="Telegram bot — settings" width="420">
  <img src="assets/photo_2_2026-09-12_19-08-16.jpg" alt="Telegram bot — notifications" width="420">
</p>

- **Tool notifications** — every tool call (success/failure, name, arguments, result) is sent to your Telegram chat. For `edit`, the new code is shown (up to 2000 chars).
- **AI replies** — every AI text response is mirrored to Telegram (human-readable text, code blocks stripped).
- **Incoming messages** — send a message to the bot and it lands in the DeepSeek chat as if you typed it.
- **`/todos` command** — get the current task list of the active window from Telegram.
- **All-done notification** — when every task in the list becomes `completed`, the bot sends a one-time "🎉 All tasks completed" message (fires again after the list changes).
- Lightweight, **dependency-free** client (long-polling, no VPS or webhook needed).
- Configured in **Settings → Cookie Code → Telegram bot** (token from @BotFather + chat ID).

### Clean window

No Electron system menu — the app opens straight into DeepSeek. All standard keyboard shortcuts (Ctrl+C/V, Ctrl+R, F12) still work.

### Project initialization

Pick a project directory once — the AI receives the directory tree and a system prompt tailored to the real project. Every tool call then resolves paths relative to that directory.

### MCP support

Claude Desktop-compatible configuration format. Supports both `stdio` and `http` MCP servers. Manage servers and tools from the overlay panel.

### Skills

Drop a folder into `.cuckoo/skills/<name>/` with a `SKILL.md` (and optional `tool.js`) and it becomes callable via `skillList`, `skillLoad`, `skillExecute`.

### Auto-formatters

Every `write` and `edit` runs the file through a language-specific formatter so the AI's output matches your project's style automatically — no manual `prettier --write` step, no style noise in the diff.

Built-in formatters:

| Formatter | Trigger | What it needs |
|-----------|---------|---------------|
| `prettier` | `.js .jsx .ts .tsx .json .css .md .yaml` … | `prettier` in the nearest `package.json` + binary in `node_modules/.bin` or `PATH` |
| `biome` | same as prettier | `biome.json` / `biome.jsonc` in the project |
| `gofmt` | `.go` | `gofmt` in `PATH` |
| `ruff` | `.py .pyi` | `ruff` in `PATH` + `[tool.ruff]` in `pyproject.toml` (or `ruff.toml`) |
| `rustfmt` | `.rs` | `rustfmt` in `PATH` |
| `shfmt` | `.sh .bash` | `shfmt` in `PATH` |
| `clang-format` | `.c .cpp .h` … | `.clang-format` config + `clang-format` in `PATH` |

- Detection is **config-aware**: ruff won't run in a project without a `[tool.ruff]` section; prettier won't run without a `package.json` dependency. No unexpected reformatting of foreign code.
- Formatter errors are swallowed — a failed formatter never blocks `write`/`edit`.
- Disable with `"formattersEnabled": false` in `cuckoo-settings.json`.

### Session persistence

Login state, projects, and settings are stored under `%APPDATA%/cuckoo-ai-pro-session` (Windows) or the equivalent userData path on macOS/Linux.

---

## Installation

### Requirements

- Node.js >= 16.0.0
- npm

### From source

```bash
# Clone
git clone https://github.com/merfiDEV/Cookie-code.git
cd Cookie-code

# Install dependencies
npm install

# If npm blocks the electron postinstall (allowScripts), approve it:
#   npm install-scripts ls
#   npm install-scripts approve electron
#   npm install

# Start
npm start
```

### Build

```bash
# Windows installer (NSIS)
npm run build:win

# Portable
npm run build:win:portable

# macOS DMG
npm run build:mac:dmg
```

---

## Usage

1. Launch the app — it opens straight into DeepSeek.
2. Log in with your regular DeepSeek account.
3. Click **Initialize project** and pick a directory. The AI now has access to the directory tree and the system prompt.
4. Chat with the AI. Ask it to edit files, run commands, search the codebase, etc.
5. Tool calls in the AI's reply are intercepted, previewed in the overlay, and executed.
6. Results are sent back to the AI automatically, and the loop continues.

### Example tool call

The AI emits a block like this:

````markdown
```cuckoo
const content = await read("src/index.js");
log(content);
```
````

Cookie Code intercepts it, executes it in a sandbox, and returns the result to the AI.

---

## Available tools

| Tool | Description |
|------|-------------|
| `read`, `readLines` | Read files (with line numbers, offset/limit) |
| `write`, `edit` | Create / modify files (auto-formatted on save — see below) |
| `deleteFile` | Delete a file |
| `glob`, `grep` | File search (ripgrep-backed) |
| `bash`, `pwsh` | Execute shell commands |
| `todoWrite` | Structured task list |
| `webFetch` | Fetch HTTP(S) content as Markdown |
| `mysql` | Run SQL queries |
| `mcpCall`, `mcpListServers`, `mcpGetTools` | MCP tools |
| `skillList`, `skillLoad`, `skillExecute` | Custom skills |
| `openBrowserWindow`, `injectJS` | Electron browser window + JS injection |

Full TypeScript declarations are shipped at `tools/cuckoo-tools.d.ts`.

---

## Customization

Cookie Code is built to be reshaped: swap wallpapers, tune the glass effect, change the accent color, write your own skills, or extend the tool set.

<p align="center">
  <img src="assets/photo_2026-09-13_22-54-33.jpg" alt="Cookie Code — full customized interface" width="900">
  <br>
  <img src="assets/photo_1_2026-09-13_13-16-57.jpg" alt="Cookie Code — customization settings" width="800">
  <br>
  <img src="assets/photo_2_2026-09-13_13-16-57.jpg" alt="Cookie Code — custom theme" width="800">
</p>

### Appearance

Everything visual lives in **Settings → Cookie Code** and persists in `cuckoo-settings.json`:

- **Backgrounds** — 27 built-in wallpapers, or drop your own image into `src/ui/backgrounds/` and register it in `registry.json`.
- **Glass effect** — background / header / sidebar blur, opacity, and tool-block glass blur.
- **RGB username** — animated rainbow gradient in the sidebar, toggled under **Effects**.

---

## Safety

- Optional approval gate for tool calls (off / risky tools only / all calls)
- 30 s command timeout, 60 s sandbox timeout
- 1 MB output buffer
- Dangerous command blocklist (rm -rf /, format, diskpart, …)
- File paths confined to the project directory

---

## Configuration

User settings live in `cuckoo-settings.json` under the app's userData directory:

```json
{
  "background": "miku",
  "backgroundBlur": 0,
  "headerBlur": 12,
  "sidebarBlur": 12,
  "headerOpacity": 45,
  "sidebarOpacity": 45,
  "toolBlockOpacity": 55,
  "toolBlockBlur": 0,
  "rgbUsername": true,
  "formattersEnabled": true,
  "toolApprovalMode": "off",
  "hideSystemMessages": true,
  "telegramEnabled": false,
  "telegramBotToken": "",
  "telegramChatId": "",
  "telegramNotifyTools": false,
  "telegramChatFeed": false
}
```

All settings are editable from **Settings → Cookie Code** inside the app.

---

## Project structure

```
src/
├── main/            Electron main process
│   ├── index.js         App bootstrap, window creation
│   ├── ipc.js           IPC handlers
│   ├── settings-store   User settings (cuckoo-settings.json)
│   ├── profile-manager  Per-window profiles
│   ├── session-store    Session ↔ project dir mapping
│   ├── mcp-client       MCP SDK integration
│   ├── skill-manager    Skills loading
│   ├── format-registry  Built-in formatters (prettier/biome/gofmt/ruff/...)
│   ├── formatter        Auto-format hook for write/edit
│   ├── window.js        Window registry
│   └── ...
├── preload/
│   ├── api.js           contextBridge → electronAPI
│   ├── index.js         Init & wiring
│   ├── dom/             DOM parsers & observers
│   │   ├── observer.js       Main reply observer
│   │   ├── tool-render.js    Inline tool blocks
│   │   ├── response-meta.js  ⏱ badge under replies
│   │   ├── settings-tab.js   Cookie Code tab in Settings
│   │   ├── background.js     Wallpaper & blur engine
│   │   └── ...
│   └── overlay/         Overlay panel UI
├── providers/
│   └── deepseek.js      Platform adapter
├── ui/
│   ├── backgrounds/     27 wallpapers + registry.json
│   └── logos/
tools/                 Tool implementations (run in main process)
└── cuckoo-tools.d.ts  Type declarations for the AI
botsrc/                Telegram bot integration (dependency-free)
├── telegram.js          Long-polling Telegram client
└── index.js             Settings, notifications, chat feed
```

---

## License

[MIT](LICENSE)
