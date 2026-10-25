import { ShortcutAction } from "@/types";

export const DEFAULT_SHORTCUT_ACTIONS: ShortcutAction[] = [
  {
    id: "toggle_dashboard",
    name: "Toggle Dashboard",
    description: "Open/Close the dashboard window",
    defaultKey: {
      macos: "cmd+alt+shift+d",
      windows: "ctrl+alt+shift+d",
      linux: "ctrl+alt+shift+d",
    },
  },
  {
    id: "toggle_window",
    name: "Toggle Window",
    description: "Show/Hide the main window",
    defaultKey: {
      // v1.0.3: was Ctrl+\ / ⌘\, which DingTalk uses to toggle its sidebar.
      macos: "cmd+alt+backslash",
      windows: "ctrl+alt+backslash",
      linux: "ctrl+alt+backslash",
    },
  },
  {
    id: "hide_all",
    name: "Hide All Windows",
    description: "Instantly hide/restore every Pluely window (screen-share panic key)",
    defaultKey: {
      macos: "cmd+alt+shift+h",
      windows: "ctrl+alt+shift+x",
      linux: "ctrl+alt+shift+x",
    },
  },
  {
    id: "focus_input",
    name: "Refocus Input Box",
    description: "Bring Pluely forward and place the cursor in the input area",
    defaultKey: {
      macos: "cmd+alt+shift+i",
      windows: "ctrl+alt+shift+i",
      linux: "ctrl+alt+shift+i",
    },
  },
  {
    id: "move_window",
    name: "Move Window",
    description: "Move overlay with arrow keys (hold to move continuously)",
    defaultKey: {
      macos: "cmd",
      windows: "ctrl",
      linux: "ctrl",
    },
  },
  {
    id: "system_audio",
    name: "System Audio",
    description: "Toggle system audio capture",
    defaultKey: {
      macos: "cmd+alt+shift+m",
      windows: "ctrl+alt+shift+m",
      linux: "ctrl+alt+shift+m",
    },
  },
  {
    id: "audio_recording",
    name: "Voice Input",
    description: "Start voice recording",
    defaultKey: {
      macos: "cmd+alt+shift+r",
      windows: "ctrl+alt+shift+r",
      linux: "ctrl+alt+shift+r",
    },
  },
  {
    id: "screenshot",
    name: "Screenshot",
    description: "Capture screenshot",
    defaultKey: {
      macos: "cmd+alt+shift+s",
      windows: "ctrl+alt+shift+s",
      linux: "ctrl+alt+shift+s",
    },
  },
];

/*
 * v1.0.4 default audit (global hotkeys fire in every app, so two-modifier
 * combos collided with meeting/chat apps):
 *   ⌘⇧A / Ctrl+Shift+A  Zoom mac mute, 腾讯会议 mac mic, 飞书 screenshot, Zoom Phone answer
 *   ⌘⇧S / Ctrl+Shift+S  Zoom mac share screen, "Save As" in most editors
 *   ⌘⇧M / Ctrl+Shift+M  Zoom mac minimize, Teams / Zoom Phone mute
 *   ⌘⇧D / Ctrl+Shift+D  Zoom mac dual monitor, Zoom Phone reject call
 *   ⌘⇧I / Ctrl+Shift+I  Zoom mac copy invite, browser DevTools (Windows)
 *   Ctrl+Alt+Shift+H    Zoom Windows show/hide floating meeting controls
 *   Ctrl+\ / ⌘\        钉钉 sidebar (v1.0.3)
 * Defaults now use three modifiers (⌘⌥⇧ / Ctrl+Alt+Shift), which 腾讯会议,
 * 钉钉, 飞书, 微信 (Alt+A, ⌃⌘A), QQ (Ctrl+Alt+A) and macOS do not use.
 * Caveat: on European layouts AltGr = Ctrl+Alt, so AltGr+Shift+letter typing
 * (e.g. Polish Ś) can trigger these; such users should rebind.
 */

/** Old built-in defaults; a binding still on one of these is moved to the
 *  current default once (users who customised keep their choice). */
export const LEGACY_DEFAULT_KEYS: Record<string, string[]> = {
  toggle_window: ["ctrl+backslash", "cmd+backslash"],
  toggle_dashboard: ["ctrl+shift+d", "cmd+shift+d"],
  hide_all: ["ctrl+alt+shift+h"],
  focus_input: ["ctrl+shift+i", "cmd+shift+i"],
  system_audio: ["ctrl+shift+m", "cmd+shift+m"],
  audio_recording: ["ctrl+shift+a", "cmd+shift+a"],
  screenshot: ["ctrl+shift+s", "cmd+shift+s"],
};
export const SHORTCUTS_MIGRATION_KEY = "ck_shortcuts_migrated_v104";
