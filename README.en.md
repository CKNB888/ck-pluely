# CK Pluely

A Chinese-first, privacy-focused real-time AI assistant for interviews, classes and meetings.

- Repository & downloads: <https://github.com/CKNB888/ck-pluely> · [Releases](https://github.com/CKNB888/ck-pluely/releases)
- Report a bug: <https://github.com/CKNB888/ck-pluely/issues>
- Chinese README (full docs): [README.md](./README.md)

## Highlights
- Floating bar on Windows/Linux; on macOS it lives in the notch (Dynamic-Island style) or, on Macs without a notch, in the menu bar.
- Invisible to screen sharing / recording by default (Windows 10 2004+: `WDA_EXCLUDEFROMCAPTURE`; macOS: `sharingType = none`), with an honest per-OS self-check.
- First-launch onboarding wizard for permissions, API key and hotkeys.
- Groq as the default channel, plus many OpenAI-compatible providers and STT engines.

## Build from source
```bash
npm install
npm run tauri build
```

## Sponsorship & Ads
Sponsorships and advertising partnerships are welcome — add WeChat **1837620622** (please mention your purpose).

## License
GPL-3.0 (see [LICENSE](./LICENSE)). Based on Pluely by Srikanth Nani; modifications © CKNB.
