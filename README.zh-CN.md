# Pluely v1 🚀

[English](./README.md) | **简体中文**

_一个悬浮窗，不开标签页，不留痕迹。_

<a href="https://pluely.com/">
  <img src="/images/pluely-v1-cover.png" alt="Pluely：Listen 悬浮窗显示实时转录和答案，Ask 悬浮窗显示截图和代码答案" width="100%" />
</a>

<p align="center"><i>Listen 与 Ask 模式下的真实悬浮窗，共享屏幕时不可见。</i></p>

---

[![Website](https://img.shields.io/badge/Website-pluely.com-blue)](https://pluely.com/)
[![Docs](https://img.shields.io/badge/Docs-docs.pluely.com-blue)](https://docs.pluely.com)
[![Tauri](https://img.shields.io/badge/Built%20with-Tauri-orange)](https://tauri.app/)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-blue)](https://reactjs.org/)

> **覆盖在一切之上的隐形 AI。** 随时询问屏幕上的任何内容；聆听任何对话，在你需要之前就准备好答案。一个悬浮窗，不开标签页，不留痕迹。共享屏幕时不可见，也不会有机器人加入你的会议。

📖 所有功能文档见 **[docs.pluely.com](https://docs.pluely.com)**：[5 分钟快速上手](https://docs.pluely.com/docs/getting-started/quickstart)、[实时转录](https://docs.pluely.com/docs/features/listen-mode)、[自动回复](https://docs.pluely.com/docs/features/auto-responses)、[全部快捷键](https://docs.pluely.com/docs/guides/overlay-shortcuts)。

### 🔒 为什么 Pluely 现在闭源？

开源的 Pluely 代码多年来不断被二次打包售卖，许可证和投诉都无法阻止。因此 v1 以签名的二进制形式发布，核心功能依然免费。详见[下文](#为什么-pluely-v1-闭源)。

---

## 📥 下载 Pluely

[![macOS](https://img.shields.io/badge/Download%20for-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://pluely.com/download/macos) &nbsp; [![Linux](https://img.shields.io/badge/Download%20for-Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://pluely.com/download/linux) &nbsp; [![Windows](https://img.shields.io/badge/Download%20for-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://pluely.com/download/windows)

**安装包格式：** `.dmg`（macOS）• `.msi` / `.exe`（Windows）• `.deb` / `.rpm` / `.AppImage`（Linux）

**永久免费套餐** · 无需注册即可开始 · 自动更新

---

## ✨ Pluely v1 是什么？

Pluely v1 是一次彻底重写：一个半透明悬浮窗，包含 **Ask（提问）** 和 **Listen（聆听）** 两种模式，另有完整的控制台管理聊天、会议、文件、提示词和设置。适用于面试、销售电话、站会、讲课、现场调试等不方便切换到浏览器的场景。

| 🪶 **轻量** | 🕶️ **隐形** | ⚡ **迅速** |
| :---: | :---: | :---: |
| 安装包仅 **9–16 MB** | 共享屏幕和录屏中不可见 | 100 毫秒内启动，一键作答 |
| 远小于 Electron 同类应用 | 没有会议机器人，不留痕迹 | 全局快捷键，任何应用中都能唤出 |
| 实时运行时 CPU 和内存占用极低 | 还可以从程序坞和任务栏隐藏 | 流式回答，实时转录 |

## 💬 Ask 模式

<img src="/images/pluely-v1-ask.gif" alt="Ask 模式" width="100%" />

输入问题、按住说话，或者让 Pluely 看你的屏幕：截图、框选区域、附加文件，或开启 **Use image** 让每条消息都附带最新截图。文档会经过内置 OCR 并保留在上下文中。答案以 Markdown 流式输出，所有内容都保存在本地，可搜索、导出或删除。

## 🎧 Listen 模式

<img src="/images/pluely-v1-listen.gif" alt="Listen 模式" width="100%" />

点击开始，Pluely 会实时转录麦克风和系统音频，支持说话人标注和语言选择。有人提问、每次停顿后或你点击 Suggest 时会自动给出回答，并根据对话生成追问建议。每次会话都会保存为带完整转录的会议记录。

## 🧰 更多功能

- **Pro 套餐提供 200+ 托管模型**：GPT、Gemini、Claude、Llama 等，对话中可随时切换，无需管理 API 密钥。
- **自带密钥永久免费**：通过 curl 模板接入任意大模型或语音识别服务，或者接入你已有的 AI CLI（Claude Code、Gemini CLI、Codex、Qwen Code、Ollama）。
- **真正的隐身**：不出现在屏幕捕获、录屏和截图中，不抢占当前应用焦点，[图标可从程序坞或任务栏隐藏](https://docs.pluely.com/docs/settings/app-icon-stealth)。详见[隐身与隐私](https://docs.pluely.com/docs/features/stealth-privacy)。
- **键盘优先**：全局快捷键唤出、截图和聆听。完整列表见[悬浮窗快捷键](https://docs.pluely.com/docs/guides/overlay-shortcuts)。
- **架构级隐私**：聊天、会议、转录和文件都保存在本机 SQLite 数据库中，你的密钥只存在本地，对话不会用于训练。
- **带知识文件的自定义提示词**、文档库、套餐与用量统计，macOS、Windows、Linux 同版构建。

## 🌐 多语言界面

开源版（GPL-3）界面支持 **English** 和 **简体中文**，默认跟随系统语言，可在 **设置 → 界面语言** 中切换。

---

## 为什么 Pluely v1 闭源

Pluely 最初完全开源，先是 MIT，后来改为 GPL-3。但代码几乎从第一天起就被搬走、换皮售卖，改用 GPL-3 也没有改变任何事。因此从完全重写的 v1 开始，Pluely 只发布签名的二进制文件。旧的 GPL-3 代码仍按其许可证保留在本仓库历史中。

不变的是：免费套餐依旧免费，版本在这里发布，[issue](https://github.com/iamsrikanthnani/pluely/issues) 继续开放用于报告问题，你的数据留在你的设备上。

---

## 📋 运行要求

Linux 需要 Tauri 应用使用的 WebKitGTK 运行库，见 [Tauri 环境要求](https://v2.tauri.app/start/prerequisites/)。macOS 和 Windows 无需额外安装，首次运行时授予[屏幕和麦克风权限](https://docs.pluely.com/docs/getting-started/permissions-macos)即可。

## 🐛 反馈与问题报告

发现问题或有想法？请提交 [GitHub issue](https://github.com/iamsrikanthnani/pluely/issues) 或访问 [pluely.com/feedback](https://pluely.com/feedback)。账号或许可证问题请联系 [support@pluely.com](mailto:support@pluely.com)。

## 📄 许可证

Pluely v1 及以后版本为闭源专有软件。此前以 GPL-3 发布的版本仍按该许可证保留在本仓库历史中。

## 🙏 致谢

- **[Tauri](https://tauri.app/)**、**[tauri-nspanel](https://github.com/ahkohd/tauri-nspanel)**、**[shadcn/ui](https://ui.shadcn.com/)**
- 简体中文翻译与多语言支持：[CKNB](https://github.com/cknb6)

---

**由 [Srikanth Nani](https://www.srikanthnani.com/) 用 ❤️ 打造**
