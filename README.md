# CK Pluely —— 中文优先的实时 AI 面试 / 上课答疑 / 会议助手

**简体中文** | [English](#english)

> **基于 [Pluely](https://github.com/iamsrikanthnani/pluely)（作者 Srikanth Nani，GPL-3.0）开源版 v0.1.9 二次开发。**
> 维护者：**CKNB**（[github.com/CKNB888](https://github.com/CKNB888)）。仓库：<https://github.com/CKNB888/ck-pluely>
> 与上游 Pluely 使用不同的包标识（`io.github.cknb6.ckpluely`），可以同时安装。

## 它能做什么

一个半透明悬浮窗：持续采集**对方的声音（系统音频）→ 实时语音转文字 → 自动判断是否在提问 → 流式生成简洁回答**。悬浮窗开启内容保护，屏幕共享时通常不可见（务必先用自己的腾讯会议 / Zoom 自测）。

### v1.0.0 新功能
- **实时助手面板**（系统音频界面）
  - 回答模式：`检测到问题自动回答`（默认）/ `每段都回答`（上游行为）/ `手动`（先攒着，点“立即回答”）
  - 中文场景预设：**面试 / 上课答疑 / 会议**，也可继续用你自己的系统提示词
  - **简历 / 笔记上下文**：粘贴简历、讲义、议程，每次回答都会带上
- **更多模型渠道（自带 Key，本地保存，不内置任何密钥）**：Groq（首次启动默认，对话 + whisper-large-v3 语音识别）、OpenAI、Anthropic Claude、Google Gemini、xAI Grok、Mistral、Cohere、Perplexity、OpenRouter、Ollama、**DeepSeek、通义千问（阿里百炼 DashScope）、Moonshot Kimi、智谱 GLM、豆包（火山方舟）、硅基流动 SiliconFlow、LM Studio**，以及自定义 OpenAI 兼容地址
- **语音识别渠道**：Groq Whisper（去掉写死的 `language=en`，中文可正常识别）、**硅基流动 SenseVoice**、OpenAI Whisper 及上游已有渠道
- **中文为第一语言**：系统语言无法识别时默认简体中文；设置里仍可切换 English（结构支持继续加语言）
- macOS 权限提示改为中英双语；ad-hoc 签名；独立 entitlements
- 关闭指向上游（已闭源 v1）的自动更新

### 修复的 Bug（继承自中文版）
#315 重复转录、#287/#292/#310 Windows 快捷键隐藏、快捷键事件触发两次、截图监听泄漏、截图遮罩暴露、设置损坏白屏、开关提示文字相反、多处硬编码英文报错等。详见 [CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md)。

## 下载与安装
到 [Releases](https://github.com/CKNB888/ck-pluely/releases) 下载 `ck-pluely_*`：
- macOS：`aarch64`（Apple Silicon）/ `x64`（Intel）的 `.dmg`。**未公证**：首次请右键 → 打开，或终端执行
  `xattr -cr "/Applications/CK Pluely.app"`；然后在 系统设置 → 隐私与安全性 中授予 **麦克风、屏幕与系统录音** 权限
- Windows：`-setup.exe`（NSIS）或 `.msi`；SmartScreen 点“更多信息 → 仍要运行”
- Linux：`.deb` / `.rpm` / `.AppImage`

## 快速上手（面试 / 上课）
1. 设置 → AI 服务商选 **groq**，填入你在 console.groq.com 申请的 Key 和模型（例如 `llama-3.3-70b-versatile`，以 Groq 文档为准）
2. 语音识别选 **groq**，模型填 `whisper-large-v3`
3. 打开系统音频 → 在“实时助手”中选预设（面试 / 上课答疑 / 会议），粘贴简历或讲义
4. 对方提问时自动出答案；不想自动就切到“手动”

## 从源码构建
```bash
npm ci
npm run tauri build          # 本机平台
npm run check:i18n           # 中英文条目一致性检查
```

## 许可证
GPL-3.0（见 [LICENSE](./LICENSE)）。Copyright © Srikanth Nani（上游 Pluely）；修改部分 © CKNB。

---

## English

**CK Pluely** is a Chinese-first fork of [Pluely](https://github.com/iamsrikanthnani/pluely) by Srikanth Nani (GPL-3.0, open-source v0.1.9), maintained by **CKNB** ([github.com/CKNB888](https://github.com/CKNB888)). It installs alongside upstream (`io.github.cknb6.ckpluely`).

New in 1.0.0: a real-time copilot panel (auto-answer detected questions / answer everything / manual), interview / class / meeting presets, resume & notes context, Groq as default channel, extra providers (DeepSeek, Qwen/DashScope, Kimi, GLM, Doubao/Ark, SiliconFlow, LM Studio, …), SiliconFlow SenseVoice STT, Groq STT language auto-detect, Chinese default UI with English available, upstream auto-update disabled. Unsigned builds: on macOS run `xattr -cr "/Applications/CK Pluely.app"`. Original upstream README: [README.en.md](./README.en.md).
