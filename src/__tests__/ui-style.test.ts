import { describe, it, expect, beforeEach } from "vitest";
import { getUiStyle, providerLabel, relativeTime, UI_STYLE_KEY } from "@/lib/ui-style";

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

describe("ui style", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to the menu bar panel", () => {
    expect(getUiStyle()).toBe("panel");
    localStorage.setItem(UI_STYLE_KEY, "bar");
    expect(getUiStyle()).toBe("bar");
    localStorage.setItem(UI_STYLE_KEY, "junk");
    expect(getUiStyle()).toBe("panel");
  });
  it("labels providers", () => {
    expect(providerLabel("groq")).toBe("Groq");
    expect(providerLabel("my-local_model")).toBe("My Local Model");
    expect(providerLabel(undefined)).toBe("未设置");
  });
  it("formats relative time", () => {
    const now = 1_700_000_000_000;
    expect(relativeTime(now - 10_000, now)).toBe("刚刚");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 分钟前");
    expect(relativeTime(now - 3 * 3600_000, now)).toBe("3 小时前");
    expect(relativeTime(now - 2 * 86400_000, now)).toBe("2 天前");
  });
});
