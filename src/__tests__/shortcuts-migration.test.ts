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

describe("toggle_window default migration (v1.0.3)", () => {
  it("moves users on the old Ctrl+\\ default once", async () => {
    const { STORAGE_KEYS } = await import("@/config");
    const { getShortcutsConfig, updateShortcutBinding } = await import("@/lib/storage/shortcuts.storage");
    store.set(STORAGE_KEYS.SHORTCUTS, JSON.stringify({ bindings: { toggle_window: { action: "toggle_window", key: "ctrl+backslash", enabled: true } }, customActions: [] }));
    expect(getShortcutsConfig().bindings.toggle_window.key).toBe("ctrl+alt+backslash");
    // A user who deliberately picks Ctrl+\ again keeps it.
    updateShortcutBinding("toggle_window", "ctrl+backslash");
    expect(getShortcutsConfig().bindings.toggle_window.key).toBe("ctrl+backslash");
  });
  it("leaves custom keys alone", async () => {
    const { STORAGE_KEYS } = await import("@/config");
    const { getShortcutsConfig } = await import("@/lib/storage/shortcuts.storage");
    store.set(STORAGE_KEYS.SHORTCUTS, JSON.stringify({ bindings: { toggle_window: { action: "toggle_window", key: "ctrl+shift+k", enabled: true } }, customActions: [] }));
    expect(getShortcutsConfig().bindings.toggle_window.key).toBe("ctrl+shift+k");
  });
});
