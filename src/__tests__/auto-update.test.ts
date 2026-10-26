// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import conf from "../../src-tauri/tauri.conf.json";
import { busyFromStatus, getAutoUpdate, setAutoUpdate } from "@/lib/auto-update";

describe("auto update", () => {
  it("is on by default and can be turned off", () => {
    localStorage.removeItem("ck_auto_update");
    expect(getAutoUpdate()).toBe(true);
    setAutoUpdate(false);
    expect(getAutoUpdate()).toBe(false);
    setAutoUpdate(true);
  });
  it("treats listening as busy", () => {
    expect(busyFromStatus({ mode: "process", app: "腾讯会议" })).toBe(true);
    expect(busyFromStatus({ mode: "system" })).toBe(true);
    expect(busyFromStatus({ mode: "idle", app: "微信" })).toBe(false);
    expect(busyFromStatus(null)).toBe(false);
  });
  it("points at our own signed latest.json", () => {
    const u = (conf as { plugins: { updater: { endpoints: string[]; pubkey: string } } }).plugins.updater;
    expect(u.endpoints[0]).toBe("https://github.com/CKNB888/ck-pluely/releases/latest/download/latest.json");
    expect(atob(u.pubkey)).toContain("minisign public key");
    expect((conf as { bundle: { createUpdaterArtifacts: boolean } }).bundle.createUpdaterArtifacts).toBe(true);
  });
});
