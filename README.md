# CK Pluely

**简体中文** | [English](./README.en.md)

面试、上课答疑、会议时用的实时助手：采集对方的声音，实时转成文字，判断是否在提问，然后给出简短回答。窗口开启内容保护，屏幕共享时对方看不到（请先用自己的腾讯会议 / Zoom 自测）。

基于 Pluely 开源版 v0.1.9（Srikanth Nani，GPL-3.0）二次开发，维护者 CKNB，仓库 <https://github.com/CKNB888/ck-pluely>。包标识 `io.github.cknb6.ckpluely`，可与上游同时安装。

## v2.0.0 新功能

- **菜单栏 / 托盘面板**：点击菜单栏或托盘图标弹出面板，分为「常用 / 提问 / 记录 / 状态」四页；标题栏显示隐私状态（共享不可见 / 部分可见），点击查看详情。也可在设置里改回悬浮条
- **本地语音识别（离线）**：SenseVoice 小模型（约 240 MB，按需下载），中英粤日韩混说；断网或在线服务限流时自动切到本地，联网后优先在线。设置页按电脑配置（处理器指令集、内存、磁盘）给出是否适合开启的建议
- **声纹：只回答别人的问题**：首次引导可选录入自己的声音（约 28 MB 模型），之后自己说的话不会触发自动回答，记录中标为「我」
- **上课模式**：回答先给结论、最多三点、150 字以内；公式用 LaTeX 排版，代码带高亮；可选科目（数学、物理、化学、编程、英语、语文、历史、生物）让回答更贴合
- **提问列表**：自动收集课堂 / 面试中听到的问题，可标记已回答、复制，一键导出课堂纪要（Markdown）或纯文本；「新的一节课」清空重来
- **显示设置**：字号四档（小 / 标准 / 大 / 特大）；多显示器时可把面板移到鼠标所在屏、主屏或下一块屏幕
- **检查更新**：设置中手动检查本仓库的新版本，不会自动下载
- **完全卸载**：设置里一键删除全部数据与密钥；Windows 卸载程序、Linux 包卸载时同样清理；macOS 提供卸载脚本
- 所有界面文案去掉 emoji 与感叹号，中英文条目一一对应

更早版本的改动见 [CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md)。

## 界面截图

| | |
|---|---|
| <img src="docs/screenshots/v2/panel-home.webp" width="400"><br>面板：常用 | <img src="docs/screenshots/v2/panel-questions.webp" width="400"><br>面板：提问列表 |
| <img src="docs/screenshots/v2/panel-questions-dark.webp" width="400"><br>深色模式 | <img src="docs/screenshots/v2/settings-local-speech.webp" width="400"><br>本地语音识别与配置建议 |
| <img src="docs/screenshots/v2/settings-display.webp" width="400"><br>显示：字号、屏幕、检查更新 | <img src="docs/screenshots/v2/onboarding-voiceprint.webp" width="400"><br>首次引导：录入你的声音 |

## 安装

到 [Releases](https://github.com/CKNB888/ck-pluely/releases) 下载对应系统的安装包：

- **macOS**：Apple 芯片选 `aarch64`，Intel 选 `x64`，`.dmg` 或 `.pkg` 均可。应用未经公证，首次请右键 → 打开，或在终端执行 `xattr -cr "/Applications/CK Pluely.app"`；然后在「系统设置 → 隐私与安全性」授予麦克风、屏幕与系统录音权限
- **Windows**：`-setup.exe` 或 `.msi`；SmartScreen 提示时点「更多信息 → 仍要运行」
- **Linux**：`.deb` / `.rpm` / `.AppImage`

首次启动有引导：权限 → 填写 Groq Key 并测试 → 快捷键 → 录入声音（可跳过）→ 隐私自检。

## 卸载

- **应用内**：设置 → 完全卸载，删除记录、设置、模型和保存的密钥，然后退出
- **Windows**：在「设置 → 应用」卸载；卸载程序会询问是否同时删除数据
- **Linux**：`sudo apt purge ck-pluely` 或 `sudo dnf remove ck-pluely`（会清理各用户的数据目录）；AppImage 直接删除文件，再删除 `~/.local/share/io.github.cknb6.ckpluely` 与 `~/.config/io.github.cknb6.ckpluely`
- **macOS**：运行仓库中的 [`scripts/uninstall-macos.command`](scripts/uninstall-macos.command)，或先在应用内完全卸载，再把应用拖到废纸篓

## 快速上手

1. 首次引导里填入 console.groq.com 申请的 Key（对话与语音识别共用，只保存在本机）
2. 打开面板 →「常用」中开始会议转写；需要上课答疑时选择「上课」预设和科目
3. 对方提问时自动给出回答；「提问」页可回看所有问题并导出
4. 常用快捷键：显示 / 隐藏 `Ctrl+\`（macOS `⌘\`），截图提问 `Ctrl+Alt+Shift+S`，语音输入 `Ctrl+Alt+Shift+R`，系统声音 `Ctrl+Alt+Shift+M`，一键隐藏 `Ctrl+Alt+Shift+X`（macOS 为 ⌘⌥⇧ 组合，隐藏为 ⌘⌥⇧H）

## 从源码构建
```bash
npm ci
npm run tauri build          # 本机平台
npm run check:i18n           # 中英文条目一致性检查
```

## 赞助与广告合作 / Sponsorship & Ads
欢迎赞助本项目或洽谈广告合作，请添加微信 **1837620622**（请备注来意）。

## 许可证

GPL-3.0，见 [LICENSE](./LICENSE)。上游版权 © Srikanth Nani，修改部分 © CKNB。
