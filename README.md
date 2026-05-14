# cool-buddy

一个面向服务器运维场景的桌面 SSH 工作台。

`cool-buddy` 把远程终端、日志追踪、文件浏览和基础机器状态放进同一个 Electron 应用里，减少来回切换终端、SFTP、监控面板和临时脚本的成本。

![cool-buddy 截图](./resources/readme-screenshot.png)

## 这是什么

`cool-buddy` 是一个基于 Electron + Vue 3 + TypeScript 构建的桌面应用，核心目标是把「连服务器以后最常做的几件事」收拢到同一块工作台里：

- 管理多个 SSH 会话
- 在应用内直接打开远程终端
- 对远程日志执行 `tail -f`
- 浏览、预览、上传和整理远程文件
- 查看远程主机的 CPU / 内存 / Docker 运行情况
- 预留 AI Agent 配置入口，方便后续接入模型能力

## 它想解决什么痛点

很多日常运维动作其实不复杂，麻烦的是上下文被切碎了：

- 连服务器用一个终端工具
- 看日志再开一个窗口
- 找文件要切到 SFTP 或者 VS Code Remote
- 想看机器状态，又要临时敲命令或者切去监控页

`cool-buddy` 想解决的不是“SSH 能不能连”，而是“排障和巡检时，能不能少切几次窗口、少丢几次上下文”。

适合它的典型场景：

- 登录云服务器排查线上问题
- 一边执行命令，一边盯日志输出
- 远程查看部署目录、配置文件和产物文件
- 快速确认 CPU、内存、Docker 状态是否异常

## 核心功能

- 多会话管理  
  支持按“生产环境 / 预发环境 / 本地”分组管理 SSH 会话，并保留打开中的标签页。

- 终端工作台  
  内置 `xterm` 终端，连接成功后可以直接在应用内执行远程命令。

- 实时日志面板  
  输入日志文件路径后即可启动日志流，适合看服务启动、报错和运行时输出。

- 远程文件浏览  
  支持浏览目录、预览文件、上传文件、新建目录、重命名和删除远程条目。

- 资源概览  
  连接 Linux 主机后，可以读取 CPU、内存、Docker 运行数等基础指标。

- 延迟与连接状态展示  
  顶部和底部会持续展示连接状态、延迟等信息，方便判断当前会话健康度。

- Agent 设置入口  
  已内置模型厂商、Base URL、API Key 的配置界面，为后续 AI 能力接入打基础。

## 使用方式

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动开发环境

```bash
pnpm dev
```

### 3. 打包应用

```bash
pnpm build
```

按平台打包：

```bash
pnpm build:win
pnpm build:mac  # macOS arm64 dmg

## GitHub Release

Push a version tag such as `v1.0.0` to trigger `.github/workflows/release.yml`.
The workflow builds:

- Windows installer (`*-setup.exe`)
- macOS Apple Silicon dmg (`*.dmg`)

Then it publishes both artifacts to the matching GitHub Release automatically.
pnpm build:linux
```

## 上手流程

1. 启动应用后，新建一个 SSH 会话。
2. 填写主机、端口、用户名和密码并保存。
3. 连接会话后，在主终端区域执行远程命令。
4. 需要看日志时，在“实时日志”区域输入日志文件路径并启动。
5. 需要找配置或上传文件时，直接在左下角文件浏览区域操作。
6. 需要快速判断机器状态时，看右侧资源概览即可。

## 技术栈

- Electron
- Vue 3
- TypeScript
- Pinia
- Vue Router
- xterm.js
- ssh2
- better-sqlite3

## 项目结构

```text
src/main       Electron 主进程、IPC、SSH 能力
src/preload    preload 桥接层
src/renderer   Vue 渲染层界面
resources      图标与 README 截图资源
scripts        构建辅助脚本
```

## 当前定位

这个项目现在更像一个“偏运维工作流”的 SSH 桌面控制台，而不是一个纯终端模拟器。  
如果你经常在服务器排障时同时做这些事情：

- 连 SSH
- 看日志
- 找文件
- 看资源占用

那它会比单独拼几个工具更顺手。

## License

[MIT](./LICENSE)
