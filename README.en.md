# CK Pluely

[简体中文](./README.md) | **English**

A real-time assistant for interviews, classroom Q&A and meetings: it captures the other side's audio, transcribes it live, detects questions and answers briefly, conclusion first. Every window is content-protected so screen sharing does not show it. Fork of Pluely v0.1.9 (Srikanth Nani, GPL-3.0), maintained by CKNB — <https://github.com/CKNB888/ck-pluely>. Current version **v2.1.1** (macOS, Windows, Linux).

## Features
- Menu-bar / tray panel (Home, Questions, Notes, Status) or floating bar
- Live transcription with Groq whisper (key rotation, rate-limit fallback) or on-device SenseVoice
- Voiceprint: your own speech never triggers answers
- Classroom mode: bold conclusion line, at most 3 points, ==highlights==, 10 subject presets, LaTeX and code
- Question list with export; screenshot, voice and text questions; many chat providers
- **v2.1.1** multi-key rotation per provider; switch provider/model/transcription from the menu-bar panel; built-in prompt library and text-only skill-pack import (.json / SKILL.md, no scripts); glance layout (conclusion, 2–4 points, folded details); browser meeting detection; teacher-mic toggle; click-through hotkey (Cmd/Ctrl+Alt+Shift+T); signed in-app auto-update (launch + every 6 h, can be turned off, never installs while listening, data kept)
- **v2.1.0** pooled HTTP/2 client with prewarm (Groq median time-to-first-token 863 → 397 ms), per-mode output caps and low reasoning effort (output tokens per answer 410 → 184), usage badge
- **v2.1.0** auto-listen on launch with meeting-app detection (Tencent Meeting, DingTalk, Feishu, WeCom, Zoom, Teams…; per-process capture on macOS 14.4+ / Windows 10 2004+), panel shows the source; fixed "nothing happens on launch" (panel shows on launch/reopen, startup log + error dialogs)
- **v2.1.0** backup and restore: `.ckbak` with manifest and SHA-256 checksums, diff preview, safety backup and rollback, optional password-encrypted API keys, automatic backup before upgrades

## Install / upgrade
Download from [Releases](https://github.com/CKNB888/ck-pluely/releases): macOS `.dmg`/`.pkg` (`xattr -cr "/Applications/CK Pluely.app"` on first run), Windows `.exe`/`.msi`, Linux `.deb`/`.rpm`/`.AppImage`. Since v2.1.1 the app updates itself (signed, Settings → Display → install; can be turned off). Manual upgrades install over the old version; v2.1.0+ makes a pre-upgrade backup automatically (last 5 kept).

## Backup / uninstall
Settings → Backup & restore. Uninstall: Settings → Full uninstall; Windows uninstaller; `apt purge` / `dnf remove`; macOS `scripts/uninstall-macos.command`.

## Hotkeys
Toggle `Ctrl+Alt+\` (`⌘⌥\`) · Screenshot `Ctrl+Alt+Shift+S` · Voice `Ctrl+Alt+Shift+R` · System audio `Ctrl+Alt+Shift+M` · Hide all `Ctrl+Alt+Shift+X` (`⌘⌥⇧H`) · Dashboard `Ctrl+Alt+Shift+D` · Focus input `Ctrl+Alt+Shift+I` · Move `Ctrl+Alt+Shift+arrows`.

## Privacy
Audio goes only to the speech provider you configure (or nowhere with local STT); screenshots only when you ask; history, voiceprint stay local; keys in the OS keychain; no telemetry or auto-update.

## Changelog
See [CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md) (Chinese), v1.0.0 → v2.1.1.

## Sponsorship & Ads
WeChat **1837620622**.

## License
GPL-3.0.
