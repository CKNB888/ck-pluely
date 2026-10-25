# 更新日志

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
