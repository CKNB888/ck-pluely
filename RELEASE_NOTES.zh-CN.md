# CK Pluely v1.0.0 发布说明

首个独立发布版。基于 Pluely 开源版 v0.1.9（Srikanth Nani，GPL-3.0），维护者 CKNB（github.com/cknb6）。

## 新功能
- 实时助手：系统音频 → 实时转写 → 自动识别提问 → 流式回答；三种回答模式（自动答问题 / 每段都答 / 手动“立即回答”）
- 面试 / 上课答疑 / 会议 三套中文提示词预设（中英界面自动切换对应语言版本）
- 简历 / 笔记上下文，随每次回答发送
- Groq 为首次启动默认渠道（对话 + whisper-large-v3）
- 新增渠道：DeepSeek、通义千问（DashScope）、Moonshot Kimi、智谱 GLM、豆包（火山方舟）、硅基流动、LM Studio；语音识别新增硅基流动 SenseVoice
- 中文为默认界面语言，保留 English
- 侧边栏增加上游项目与维护者链接

## 修复
- Groq 语音识别写死 `language=en` 导致中文识别差 → 改为自动检测
- Groq 对话模板带 `reasoning_effort` 导致非推理模型报错 → 移除
- 自动更新指向上游闭源版 → 已关闭（待本仓库发布签名的 latest.json 后再开启）
- macOS 权限说明改为中英双语，新增 entitlements，ad-hoc 签名

## 安装
见 README「下载与安装」。macOS 未公证：`xattr -cr "/Applications/CK Pluely.app"`。
