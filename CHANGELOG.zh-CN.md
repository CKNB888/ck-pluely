# 更新日志

## v1.0.0 — CK Pluely 首个独立版本
- 更名为 CK Pluely（包标识 io.github.cknb6.ckpluely，可与上游共存），版本号 1.0.0
- 新增实时助手面板：回答模式（自动答问题 / 每段都答 / 手动）、面试/上课答疑/会议预设、简历笔记上下文
- 新增 AI 渠道：DeepSeek、通义千问 DashScope、Moonshot Kimi、智谱 GLM、豆包火山方舟、硅基流动、LM Studio；Groq 置顶并作为默认
- 新增语音识别：硅基流动 SenseVoice；Groq Whisper 改为自动识别语言
- 默认界面语言简体中文；关闭指向上游的自动更新
- macOS：中英双语权限说明、entitlements.plist、ad-hoc 签名、最低系统 10.15
- CI：产物与 Release 资源统一命名为 ck-pluely_*


## v0.1.9-zh.1（2026-10-25）

基于上游开源版 v0.1.9。

### 新增
- 多语言界面框架（i18next / react-i18next），内置 English 与简体中文，覆盖全部界面文字
- 设置 → 界面语言：跟随系统 / English / 简体中文，默认跟随系统语言
- 中文字体回退与长文本换行
- `npm run check:i18n` 翻译完整性检查
- GitHub Actions：Windows / macOS / Linux 三平台构建与 Release 发布
- 中文 README

### 修复
- 系统音频同一段语音被转录、回答两次（[#315](https://github.com/iamsrikanthnani/pluely/issues/315)）
- Windows 上切换窗口快捷键无法隐藏悬浮窗（[#287](https://github.com/iamsrikanthnani/pluely/issues/287)、[#292](https://github.com/iamsrikanthnani/pluely/issues/292)、[#310](https://github.com/iamsrikanthnani/pluely/issues/310)）
- 全局快捷键事件重复触发
- 截图监听器泄漏
- 框选截图遮罩可被录屏捕获、程序坞图标跳动
- 本地设置损坏导致启动白屏
- 窗口置顶 / 自动滚动开关提示文字相反

贡献者：[CKNB](https://github.com/cknb6)
