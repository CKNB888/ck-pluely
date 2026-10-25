# Pluely 中文版（多语言 + Bug 修复）

**简体中文** | [English](./README.en.md)

> 本仓库是 [iamsrikanthnani/pluely](https://github.com/iamsrikanthnani/pluely) 开源版（GPL-3.0，v0.1.9 源码）的分支，增加了多语言界面（简体中文为主）并修复了一批 bug。上游 v1 起已闭源，本分支基于仓库中最新的开源代码。

## 项目简介

Pluely 是一个基于 Tauri（Rust + React）的桌面 AI 助手：一个半透明悬浮窗，可以实时转录麦克风和系统音频、截图提问，并调用你自己的大模型和语音识别服务给出答案。悬浮窗开启了内容保护，共享屏幕和录屏时通常不可见（请务必先用自己的会议软件测试，例如腾讯会议）。

- 自带 API 密钥即可使用：通过 curl 模板接入 OpenAI 兼容接口，例如 DeepSeek、通义千问等，以及任意语音识别服务
- 系统音频实时转录 + 自动回答
- 截图 / 框选截图提问
- 全局快捷键，窗口置顶，程序坞/任务栏图标隐藏
- 聊天记录保存在本机 SQLite

## 新增功能

- **多语言界面**：基于 i18next / react-i18next，内置 English 和简体中文，覆盖全部界面文字（537 条）
- **界面语言设置**：设置 → 界面语言，可选“跟随系统 / English / 简体中文”，默认跟随系统语言，多窗口同步
- **中文排版**：CJK 字体回退（苹方、微软雅黑、思源黑体/Noto Sans CJK），长中文自动换行
- **翻译完整性检查**：`npm run check:i18n`
- **三平台 CI**：GitHub Actions 构建 Windows（msi/exe）、macOS（Apple Silicon / Intel dmg）、Linux（deb/rpm/AppImage）；推送 `v*-zh` 标签自动发布 Release

## 修复的 Bug

| 问题 | 修复 |
| --- | --- |
| [#315](https://github.com/iamsrikanthnani/pluely/issues/315) 转录结果出现两次 | `speech-detected` 监听器在异步注册完成前被清理时不会注销，导致同一段语音被转录、回答两次；同时清理 STT 超时定时器 |
| [#287](https://github.com/iamsrikanthnani/pluely/issues/287) / [#292](https://github.com/iamsrikanthnani/pluely/issues/292) / [#310](https://github.com/iamsrikanthnani/pluely/issues/310) Windows 上 Ctrl+\ 无法隐藏窗口 | 前端把后端发来的“隐藏”状态取反了，导致第一次按下只是聚焦；同时修复隐藏后弹出面板无法再打开 |
| 全局快捷键事件触发两次 | 多个异步初始化并发注册监听器，切换类快捷键（语音、系统音频）开了又立刻关；改为串行初始化 |
| 截图结果监听器泄漏 | `captured-selection` 监听器同样存在异步清理竞态 |
| 截图时暴露应用 | 框选截图遮罩没有开启内容保护，并且会让程序坞图标跳动/任务栏闪烁；已开启内容保护并去掉提醒 |
| 设置损坏导致白屏 | 本地存储中选中的服务商 JSON 损坏时启动崩溃；改为容错并清除坏值 |
| 开关提示文字相反 | “窗口置顶”“自动滚动”开关的 title 与 aria-label 描述相反 |

## 下载 / 构建

**下载**：到 [Releases](https://github.com/cknb6/pluely/releases) 下载对应系统的安装包。安装包**未签名**：

- macOS：首次打开如提示“已损坏/无法验证开发者”，执行 `xattr -cr /Applications/Pluely.app` 后再打开
- Windows：SmartScreen 提示时点“更多信息 → 仍要运行”

**从源码构建**（需要 Node.js 20+、Rust stable，Linux 另需 WebKitGTK 等依赖，见 [Tauri 环境要求](https://v2.tauri.app/start/prerequisites/)）：

```bash
npm ci
npm run tauri dev      # 开发运行
npm run tauri build    # 打包安装包
```

## 贡献者

- 原作者：[Srikanth Nani](https://github.com/iamsrikanthnani)
- 多语言支持、简体中文翻译与 Bug 修复：[CKNB](https://github.com/cknb6)

## 许可证

GPL-3.0，见 [LICENSE](./LICENSE)。更新日志见 [CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md)。
