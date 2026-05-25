# cool-buddy

[中文](#中文) | [English](#english)

![cool-buddy screenshot](./resources/readme-screenshot.png)

---

## 中文

`cool-buddy` 是一个面向服务器运维、远程排障和日常巡检的桌面工作台。它把 **SSH 终端**、**实时日志**、**远程文件浏览**、**资源指标**和**内置 AI 助手**放进同一个 Electron 应用里，减少在终端、SFTP、监控页和临时脚本之间来回切换的成本。

### 为什么做这个

很多线上处理工作并不难，难的是上下文总被拆散：

- 一个窗口连 SSH
- 一个窗口盯日志
- 一个工具传文件
- 另一个页面看 CPU、内存和 Docker
- 真要分析问题时，还要自己整理现场信息

`cool-buddy` 想解决的就是这件事：**把一台远程机器的排障视角尽量收拢到同一个界面里。**

### 适合谁

- 需要频繁登录 Linux 服务器的开发者和运维
- 经常处理部署、巡检、线上告警和日志排查的工程团队
- 想把 SSH、日志和文件操作集中到一个桌面工具里的个人用户

---

### 功能概览

#### 1. SSH 会话工作台

- **多会话管理**：保存主机、端口、用户名和认证信息，支持快速切换
- **顶部标签页**：支持关闭当前、关闭其他、关闭全部
- **会话分组**：生产 / 预发布 / 本地三组分类，支持图标类型区分（server / database / hardDrive）
- **多种认证方式**：
  - 密码登录
  - 系统 SSH Key（自动探测 `ssh-agent` 和默认私钥 `~/.ssh/id_*`）
  - 自定义私钥文件 + 可选 passphrase
- **智能默认值**：启动时自动检测本地 SSH 环境，优先推荐可用的认证方式
- **工作上下文恢复**：记住上次打开的标签页和活跃会话

#### 2. 内置远程终端

- 基于 `xterm.js` 的完整终端模拟，支持 256 色和自定义主题（暗色终端配色）
- 连接后在应用内直接执行远程命令，不再需要单独打开终端模拟器
- **自适应尺寸**：`FitAddon` 自动适配面板大小变化
- **剪贴板集成**：支持选中复制、右键粘贴
- **多行粘贴保护**：粘贴含换行的内容时弹出确认框，逐行发送避免误执行整段脚本
- 终端连接状态实时显示（连接中 / 已连接 / 错误 / 断开）

#### 3. 实时日志面板

- 在界面内直接对远程文件执行 `tail -f`，无需手动 SSH + tail 命令
- **多日志流**：支持同时打开多个日志文件流，每个独立控制启停
- **可配置行数**：设置初始加载和保留的日志行数上限（1-500 行）
- **独立弹出窗口**：日志流可弹出为独立窗口，方便多屏查看
- 路径错误、连接中断等场景下给出明确的状态反馈

#### 4. 远程文件浏览器

基于 SFTP 的完整远程文件管理体验：

- **目录浏览**：浏览远程目录结构，文件和目录自然排序（目录优先）
- **文件预览**：点击文本文件即时预览内容
- **文件上传**：支持拖拽上传和点击上传，文件带相对路径时自动在远端创建目录结构
  - 并发上传（默认 6 并发），流水线写入（4 段深度）
  - 4MB 分块传输，实时进度条
  - 拖拽上传同时支持文件和空目录
- **新建目录 / 新建文件**
- **重命名**文件和目录
- **删除**：支持单条或批量并发删除（8 并发），递归删除目录
- **显示 / 隐藏隐藏文件**
- 上传和删除操作支持**取消**

#### 5. 资源概览与巡检

- **实时指标**（每 2 秒刷新）：CPU 使用率、内存使用量 / 总量
- **完整指标**（每 15 秒刷新）：主机名、操作系统、内核版本、架构、系统运行时间、Docker 运行容器数
- **远程应用检测**：自动发现运行中的 systemd 服务和 Docker 容器（含镜像、端口等信息）
- **SSH 延迟监控**（每 5 秒）
- 支持刷新和展开更多细节（MetricsDetailModal）

#### 6. 内置 AI 助手（Harmless Agent）

基于 LangChain / LangGraph 的运维智能代理，深度集成到工作台：

- **24 个预置模型提供方**：OpenAI、Anthropic Claude、Google Gemini、DeepSeek、Qwen 通义千问、Zhipu GLM、Moonshot Kimi、百度千帆、SiliconFlow、Groq、Mistral、OpenRouter、Ollama（本地）、LM Studio（本地）、xAI Grok、Perplexity、Fireworks、Together AI、火山引擎 Ark、腾讯混元、MiniMax、302.AI，以及自定义兼容端点
- 支持手动输入模型名称或从提供方 API 拉取模型列表
- **对话式交互**：流式输出，支持 Markdown 渲染
- **内置系统提示词**，专注运维排障场景
- **12 个内置工具**：
  - `run_command` — 在远程主机执行 Shell 命令
  - `list_remote_directory` — 列出远程目录
  - `read_remote_file` — 读取远程文件
  - `write_remote_text_file` — 写入远程文件
  - `create_remote_directory` — 创建远程目录
  - `rename_remote_entry` — 重命名或移动
  - `delete_remote_entry` — 删除远程条目
  - `complete_remote_path` — Tab 补全远程路径
  - `get_system_metrics` — 获取完整系统指标
  - `get_live_system_metrics` — 获取实时 CPU/内存
  - `get_remote_apps` — 查询运行中的服务和容器
  - `read_recent_log_lines` — 读取日志末尾行
- **五级风险防控**：
  - **P0（高危）**：`systemctl stop/restart`、`docker stop/rm`、`kill -9`、`iptables` 等 — 需**双重确认**
  - **P1（危险）**：`apt/yum install`、`pip/npm install`、`sed -i` 等 — 需确认
  - **P2（文件写入）**：`mkdir`、`cp`、`mv`、`rm`、`docker run` 等 — 需确认
  - **P3（只读）**：`cat`、`tail`、`grep`、`ps`、`ls` 等 — 无需确认
  - **P4（安全）**：普通查询命令和空命令 — 无需确认
  - **绝对禁止**：`rm -rf /`、`mkfs`、`dd of=/dev/`、fork 炸弹、`shutdown` 等永久阻止
- **审批弹窗**展示风险等级、摘要、细节和待执行命令，P0 操作需点击两次确认
- **命令白名单**：支持 glob 模式匹配，白名单命令可跳过审批
- **上下文压缩**：长对话自动摘要压缩，避免超出模型上下文窗口（支持各模型自动识别 token 上限）
- 最多 8 轮工具调用，防止无限循环

#### 7. 国际化与桌面体验

- 顶栏语言切换（中文 / English）
- 完整的多语言文案框架（`src/renderer/src/i18n.ts`）
- 系统托盘图标和菜单
- 窗口状态管理（单实例锁、macOS dock 激活）
- 快捷键弹窗参考

#### 8. 自动更新

- 基于 `electron-updater` 的 generic provider
- GitHub Release 工作流自动构建并上传安装包、blockmap 和更新元数据至阿里云 OSS
- 客户端从 `ELECTRON_UPDATER_URL` 检查更新

---

### 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | Electron 39 |
| 前端 | Vue 3 + TypeScript + Pinia + Vue Router |
| 构建 | electron-vite + Vite 7 |
| 终端 | xterm.js 5 + @xterm/addon-fit |
| SSH | ssh2（自定义交互式 Shell 命令执行链） |
| SFTP | ssh2 SFTP 子系统 |
| 数据持久化 | better-sqlite3（会话、Agent 设置、白名单） |
| AI 编排 | LangChain + LangGraph（StateGraph + MemorySaver + interrupt） |
| UI 组件 | Element Plus + Lucide Vue Next |
| 样式 | SCSS |
| 自动更新 | electron-updater + 阿里云 OSS |
| 静态检查 | ESLint + Prettier + vue-tsc |

---

### 项目结构

```text
src/main/          Electron 主进程
  ├── data/         SQLite 持久化（会话、Agent 设置、白名单）
  ├── harmless/     AI Agent 运行时（LangGraph 编排、风险引擎、模型目录）
  ├── ipc/          IPC 处理器（会话、SSH、Agent、应用设置）
  ├── shared/       共享类型定义
  ├── ssh/          SSH 连接管理、SFTP、系统指标采集、远程应用探测
  ├── state/        窗口管理、语言、生命周期
  ├── tray/         系统托盘
  ├── updater/      自动更新
  └── workers/      Node.js Worker Thread（指标解析）
src/preload/       contextBridge 预加载
src/renderer/      Vue 3 渲染层
  ├── components/   UI 组件（终端、日志、文件浏览器、侧栏、AI 聊天、弹窗）
  ├── composables/  组合式函数
  ├── stores/       Pinia Store（核心状态管理）
  ├── types/        前端类型定义
  ├── views/        路由视图（主工作台、弹出式日志窗口）
  └── assets/       样式和静态资源
resources/         图标、截图
build/             打包图标和安装器配置
scripts/           构建和发布辅助脚本
```

---

### 本地开发

**环境要求**：Node.js 20+，pnpm 10+

```bash
# 安装依赖
pnpm install

# 启动开发环境（热更新）
pnpm dev

# 类型检查
pnpm typecheck

# 构建生产版本
pnpm build

# 按平台打包
pnpm build:win      # Windows (NSIS installer)
pnpm build:mac      # macOS ARM64 (DMG + ZIP)
pnpm build:linux    # Linux (AppImage + Snap + deb)
```

---

### 发布说明

GitHub Release 工作流会为当前项目构建并上传：

- **Windows**：`*-setup.exe`（NSIS 安装器，支持自定义安装路径）
- **macOS Apple Silicon**：`*.dmg`、`*.zip`
- **自动更新元数据**：`latest.yml`、`latest-mac.yml`

自动更新使用 `electron-updater` 的 generic provider。发布工作流将安装包、blockmap 和更新元数据同步到阿里云 OSS，客户端从 `ELECTRON_UPDATER_URL` 指向的 HTTPS 地址检查更新。

**GitHub Actions Secrets 配置**：

| Secret | 说明 |
|--------|------|
| `ELECTRON_UPDATER_URL` | 公开下载地址，如 `https://download.example.com/cool-buddy` |
| `ALIYUN_OSS_REGION` | OSS region，如 `oss-cn-hangzhou` |
| `ALIYUN_OSS_BUCKET` | OSS bucket 名称 |
| `ALIYUN_OSS_ACCESS_KEY_ID` | 有上传权限的 RAM AccessKey ID |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | 对应 AccessKey Secret |
| `ALIYUN_OSS_PREFIX` | OSS 对象前缀，默认 `cool-buddy` |

`ELECTRON_UPDATER_URL` 应与 OSS/CDN 公开地址加前缀保持一致。

---

### 设计理念

`cool-buddy` 不是一个单纯的终端模拟器，它更像一个**偏运维工作流的远程桌面控制台**：

- 连上服务器
- 打命令
- 看日志
- 找文件
- 查资源
- 让 AI 帮忙总结现场或辅助判断

**Harmless AI 设计原则**：

AI 助手默认只具备**只读能力**（查看系统状态、读取文件、浏览目录）。任何写操作或高风险命令都需要经过分级确认，P0 级别操作需要双重确认。攻击性命令（如 `rm -rf /`）被永久拦截，不可绕过。这套机制保证了 AI 在运维场景中的**可控性和安全性**。

---

### License

[MIT](./LICENSE)

---

## English

`cool-buddy` is a desktop workspace for server operations, remote troubleshooting, and day-to-day infrastructure checks. It brings **SSH terminal access**, **live log tailing**, **remote file browsing**, **host metrics**, and an **embedded AI assistant** into one Electron app — so you spend less time bouncing between terminal windows, SFTP tools, monitoring tabs, and scratch notes.

### Why it exists

Most production tasks aren't difficult because of a single command. They get messy because the context is fragmented:

- one window for SSH
- another one for logs
- another tool for file transfer
- another page for CPU, memory, and Docker
- and then manual reasoning on top of all of that

`cool-buddy` is built to **keep that operational context in one place.**

### Who it's for

- developers and operators who regularly log into Linux hosts
- teams handling deployments, incident response, and routine health checks
- anyone who wants a tighter desktop workflow around SSH-based operations

---

### Features

#### 1. SSH Session Workspace

- **Multi-session management** with saved hosts, ports, usernames, and auth details
- **Tabbed interface** with close-current, close-others, and close-all actions
- **Session grouping** into production / staging / local with icon types (server, database, hard drive)
- **Multiple authentication methods**:
  - Password authentication
  - System SSH keys (auto-detects `ssh-agent` and `~/.ssh/id_*` default keys)
  - Custom private key file with optional passphrase
- **Smart defaults**: automatically detects local SSH capabilities and recommends the best auth method
- **Context restoration**: remembers last open tabs and active session

#### 2. Built-in Remote Terminal

- Full terminal emulation via `xterm.js` with 256-color support and custom dark theme
- Execute remote commands directly inside the app — no separate terminal emulator needed
- **Adaptive sizing**: `FitAddon` auto-resizes to panel dimensions
- **Clipboard integration**: select-to-copy, right-click paste
- **Multi-line paste protection**: confirmation dialog before pasting content with newlines, with option to send line-by-line
- Real-time connection status display (connecting / connected / error / disconnected)

#### 3. Live Log Panel

- Run remote `tail -f` without leaving the app — no manual SSH + tail required
- **Multiple log streams** with independent start/stop control
- **Configurable line limits** (1–500 lines) for initial load and rolling retention
- **Pop-out windows**: detach log streams into independent windows for multi-monitor setups
- Clear feedback for invalid paths, disconnects, and stream errors

#### 4. Remote File Explorer

Full SFTP-based remote file management:

- **Directory browsing** with natural sort (directories first)
- **File preview**: click a text file to preview its contents
- **File upload**: drag-and-drop or click to upload, with automatic remote directory tree creation for files with relative paths
  - Concurrent uploads (6 parallel), pipeline writes (4 deep)
  - 4MB chunked transfer with real-time progress bar
  - Supports both files and empty directories via drag-and-drop
- **Create directory / create file**
- **Rename** files and directories
- **Delete**: single or batch concurrent deletion (8 parallel), recursive directory removal
- **Toggle hidden files**
- Upload and delete operations are **cancelable**

#### 5. Host Metrics & Inspection

- **Live metrics** (every 2s): CPU usage, memory used/total
- **Full metrics** (every 15s): hostname, OS name, kernel version, architecture, uptime, running Docker container count
- **Remote app detection**: auto-discovers running systemd services and Docker containers (with image, port, and description info)
- **SSH latency monitoring** (every 5s)
- Expandable details modal for deeper inspection

#### 6. Embedded AI Assistant (Harmless Agent)

LangChain / LangGraph-powered operations agent, deeply integrated into the workbench:

- **24 preset model providers**: OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Qwen, Zhipu GLM, Moonshot Kimi, Baidu Qianfan, SiliconFlow, Groq, Mistral, OpenRouter, Ollama (local), LM Studio (local), xAI Grok, Perplexity, Fireworks, Together AI, Volcengine Ark, Tencent Hunyuan, MiniMax, 302.AI, plus a custom endpoint option
- Manual model name input or fetch model list from provider API
- **Conversational interaction** with streaming output and Markdown rendering
- **Built-in system prompt** focused on ops and troubleshooting
- **12 built-in tools**:
  - `run_command` — execute shell commands on the remote host
  - `list_remote_directory` — list remote directory contents
  - `read_remote_file` — read remote file contents
  - `write_remote_text_file` — write a remote text file
  - `create_remote_directory` — create a remote directory
  - `rename_remote_entry` — rename or move a remote entry
  - `delete_remote_entry` — delete a remote file or directory
  - `complete_remote_path` — tab-complete remote filesystem paths
  - `get_system_metrics` — get full system metrics snapshot
  - `get_live_system_metrics` — get live CPU/memory
  - `get_remote_apps` — query running services and containers
  - `read_recent_log_lines` — read recent lines from a log file
- **Five-tier risk control**:
  - **P0 (critical)**: `systemctl stop/restart`, `docker stop/rm`, `kill -9`, `iptables`, etc. — requires **double confirmation**
  - **P1 (dangerous)**: `apt/yum install`, `pip/npm install`, `sed -i`, etc. — requires confirmation
  - **P2 (filesystem write)**: `mkdir`, `cp`, `mv`, `rm`, `docker run`, etc. — requires confirmation
  - **P3 (read-only)**: `cat`, `tail`, `grep`, `ps`, `ls`, etc. — auto-approved
  - **P4 (safe)**: normal queries and empty commands — auto-approved
  - **Absolute bans**: `rm -rf /`, `mkfs`, `dd of=/dev/`, fork bombs, `shutdown` — permanently blocked
- **Approval dialogs** display risk level, summary, details, and the pending command; P0 operations require two clicks to confirm
- **Command whitelist**: glob-pattern matching — whitelisted commands bypass approval
- **Context compression**: automatic conversation summarization to stay within model context windows (auto-detects per-provider token limits)
- Maximum 8 tool call turns to prevent infinite loops

#### 7. Internationalization & Desktop Polish

- Language switcher in the top bar (中文 / English)
- Full i18n framework with locale-aware copy
- System tray icon and context menu
- Window state management (single-instance lock, macOS dock activation)
- Keyboard shortcuts reference modal

#### 8. Auto Updates

- `electron-updater` generic provider
- GitHub Release workflow builds and uploads installers, blockmaps, and update metadata to Aliyun OSS
- The app checks `ELECTRON_UPDATER_URL` for updates

---

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Electron 39 |
| Frontend | Vue 3 + TypeScript + Pinia + Vue Router |
| Build | electron-vite + Vite 7 |
| Terminal | xterm.js 5 + @xterm/addon-fit |
| SSH | ssh2 (custom interactive shell command execution chain) |
| SFTP | ssh2 SFTP subsystem |
| Persistence | better-sqlite3 (sessions, agent settings, whitelist) |
| AI Orchestration | LangChain + LangGraph (StateGraph + MemorySaver + interrupt) |
| UI Components | Element Plus + Lucide Vue Next |
| Styling | SCSS |
| Auto-update | electron-updater + Aliyun OSS |
| Linting | ESLint + Prettier + vue-tsc |

---

### Project Structure

```text
src/main/          Electron main process
  ├── data/         SQLite persistence (sessions, agent settings, whitelist)
  ├── harmless/     AI agent runtime (LangGraph orchestration, risk engine, model catalog)
  ├── ipc/          IPC handlers (sessions, SSH, agent, app settings)
  ├── shared/       Shared type definitions
  ├── ssh/          SSH connection, SFTP, system metrics, remote app detection
  ├── state/        Window management, locale, lifecycle
  ├── tray/         System tray
  ├── updater/      Auto-update logic
  └── workers/      Node.js Worker Threads (metrics parsing)
src/preload/       contextBridge preload layer
src/renderer/      Vue 3 renderer
  ├── components/   UI components (terminal, log, file explorer, sidebar, AI chat, modals)
  ├── composables/  Composition functions
  ├── stores/       Pinia store (core state management)
  ├── types/        Frontend type definitions
  ├── views/        Route views (main workbench, pop-out log window)
  └── assets/       Styles and static resources
resources/         Icons, screenshots
build/             Packaging icons and installer config
scripts/           Build and release helper scripts
```

---

### Local Development

**Requirements**: Node.js 20+, pnpm 10+

```bash
# Install dependencies
pnpm install

# Start dev environment (hot reload)
pnpm dev

# Type check
pnpm typecheck

# Build for production
pnpm build

# Package per platform
pnpm build:win      # Windows (NSIS installer)
pnpm build:mac      # macOS ARM64 (DMG + ZIP)
pnpm build:linux    # Linux (AppImage + Snap + deb)
```

---

### Releases

The GitHub Release workflow builds and uploads:

- **Windows**: `*-setup.exe` (NSIS installer, customizable install path)
- **macOS Apple Silicon**: `*.dmg`, `*.zip`
- **Auto-update metadata**: `latest.yml`, `latest-mac.yml`

Configure these GitHub Actions secrets:

| Secret | Description |
|--------|-------------|
| `ELECTRON_UPDATER_URL` | Public download URL, e.g. `https://download.example.com/cool-buddy` |
| `ALIYUN_OSS_REGION` | OSS region, e.g. `oss-cn-hangzhou` |
| `ALIYUN_OSS_BUCKET` | OSS bucket name |
| `ALIYUN_OSS_ACCESS_KEY_ID` | RAM AccessKey ID with upload permission |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | Matching AccessKey Secret |
| `ALIYUN_OSS_PREFIX` | OSS object prefix, defaults to `cool-buddy` |

`ELECTRON_UPDATER_URL` must match the public OSS/CDN URL plus the prefix.

---

### Design Philosophy

`cool-buddy` is not just a terminal emulator — it's closer to an **operations-oriented remote workstation**:

- connect to a host
- run commands
- inspect logs
- browse files
- check machine health
- let AI help summarize the situation

**Harmless AI Design Principle**:

The AI assistant starts with **read-only capabilities** by default (inspecting system state, reading files, browsing directories). Any write operation or high-risk command requires tiered explicit approval — P0 operations require double confirmation. Destructive commands (like `rm -rf /`) are permanently blocked and cannot be bypassed. This mechanism ensures **controllability and safety** for AI in operations scenarios.

---

### License

[MIT](./LICENSE)
