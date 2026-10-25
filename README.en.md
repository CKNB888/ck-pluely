# CK Pluely

[简体中文](./README.md) | **English**

A real-time assistant for interviews, classes and meetings: it captures the other side's audio, transcribes it, detects questions and drafts short answers. Its windows use content protection so they stay hidden during screen sharing (test with your own meeting app first).

Fork of Pluely v0.1.9 by Srikanth Nani (GPL-3.0), maintained by CKNB — <https://github.com/CKNB888/ck-pluely>. Bundle id `io.github.cknb6.ckpluely`; installs alongside upstream.

## New in v2.0.0

- **Menu bar / tray panel** with four tabs (Home, Questions, Notes, Status) and a privacy badge in the header. The floating bar is still available in Settings.
- **Offline speech recognition**: SenseVoice small model (about 240 MB, downloaded on demand). Used automatically when offline or rate limited; online recognition stays the first choice. Settings show whether your CPU, memory and disk are a good fit.
- **Voiceprint**: optionally enroll your voice during onboarding (about 28 MB model). Your own speech no longer triggers answers and is labelled "Me".
- **Class mode**: conclusion first, at most three points, under 150 characters; formulas rendered with LaTeX, code highlighted; optional subject hints.
- **Question list**: questions heard in class or an interview are collected, can be marked answered, copied, and exported as Markdown notes or plain text.
- **Display**: four font sizes; move the panel between monitors.
- **Update check** against this repository (manual, never auto-downloads).
- **Full uninstall** in Settings, in the Windows uninstaller and Linux package removal; a script for macOS.

## Screenshots

| | |
|---|---|
| <img src="docs/screenshots/v2/panel-home.webp" width="400"> | <img src="docs/screenshots/v2/panel-questions.webp" width="400"> |
| <img src="docs/screenshots/v2/settings-local-speech.webp" width="400"> | <img src="docs/screenshots/v2/onboarding-voiceprint.webp" width="400"> |

## Install

Download from [Releases](https://github.com/CKNB888/ck-pluely/releases): macOS `.dmg`/`.pkg` (`aarch64` or `x64`), Windows `-setup.exe`/`.msi`, Linux `.deb`/`.rpm`/`.AppImage`. Builds are not notarized: on macOS run `xattr -cr "/Applications/CK Pluely.app"` once.

## Uninstall

Settings → Full uninstall; or the Windows uninstaller ("delete app data"); `apt purge` / `dnf remove` on Linux; `scripts/uninstall-macos.command` on macOS.

## License

GPL-3.0, see [LICENSE](./LICENSE). Upstream © Srikanth Nani; modifications © CKNB.
