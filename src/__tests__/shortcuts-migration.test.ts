import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib", () => ({ getPlatform: () => "windows" }));

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

const b = (action: string, key: string) => ({ action, key, enabled: true });

describe("default hotkey migration", () => {
  it("moves bindings on old defaults once, keeps later re-selection", async () => {
    const { STORAGE_KEYS } = await import("@/config");
    const { getShortcutsConfig, updateShortcutBinding } = await import("@/lib/storage/shortcuts.storage");
    store.set(STORAGE_KEYS.SHORTCUTS, JSON.stringify({ bindings: {
      toggle_window: b("toggle_window", "ctrl+backslash"),
      audio_recording: b("audio_recording", "ctrl+shift+a"),
      screenshot: b("screenshot", "ctrl+shift+s"),
      hide_all: b("hide_all", "ctrl+alt+shift+h"),
    }, customActions: [] }));
    const c = getShortcutsConfig().bindings;
    expect(c.toggle_window.key).toBe("ctrl+alt+backslash");
    expect(c.audio_recording.key).toBe("ctrl+alt+shift+r");
    expect(c.screenshot.key).toBe("ctrl+alt+shift+s");
    expect(c.hide_all.key).toBe("ctrl+alt+shift+x");
    updateShortcutBinding("audio_recording", "ctrl+shift+a");
    expect(getShortcutsConfig().bindings.audio_recording.key).toBe("ctrl+shift+a");
  });
  it("leaves custom keys alone", async () => {
    const { STORAGE_KEYS } = await import("@/config");
    const { getShortcutsConfig } = await import("@/lib/storage/shortcuts.storage");
    store.set(STORAGE_KEYS.SHORTCUTS, JSON.stringify({ bindings: { toggle_window: b("toggle_window", "ctrl+shift+k") }, customActions: [] }));
    expect(getShortcutsConfig().bindings.toggle_window.key).toBe("ctrl+shift+k");
  });
  it("defaults have no duplicates and use three keys", async () => {
    const { DEFAULT_SHORTCUT_ACTIONS } = await import("@/config");
    for (const os of ["macos", "windows", "linux"] as const) {
      const keys = DEFAULT_SHORTCUT_ACTIONS.map((a) => a.defaultKey[os]).filter((k) => k.includes("+"));
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of keys) expect(k.split("+").length).toBeGreaterThanOrEqual(3);
    }
  });
});
