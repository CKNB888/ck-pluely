import { describe, it, expect } from "vitest";
import { DEFAULT_SHORTCUT_ACTIONS } from "@/config/shortcuts";
import { getAutoListen, setAutoListen } from "@/lib/auto-listen";

describe("default hotkeys", () => {
  for (const os of ["macos", "windows", "linux"] as const) {
    it(`have no duplicates on ${os}`, () => {
      const keys = DEFAULT_SHORTCUT_ACTIONS.map((a) => a.defaultKey[os]?.toLowerCase()).filter(Boolean);
      expect(new Set(keys).size).toBe(keys.length);
    });
  }
});

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

describe("auto-listen setting", () => {
  it("defaults to on and can be turned off", () => {
    localStorage.removeItem("ck_auto_listen");
    expect(getAutoListen()).toBe(true);
    setAutoListen(false);
    expect(getAutoListen()).toBe(false);
    setAutoListen(true);
    expect(getAutoListen()).toBe(true);
  });
});
