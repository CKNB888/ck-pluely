import { invoke } from "@tauri-apps/api/core";

const KEY = "ck_auto_update";
export const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const FIRST_CHECK_DELAY_MS = 60 * 1000;

/** 自动检查更新，默认开启 */
export const getAutoUpdate = () => localStorage.getItem(KEY) !== "0";
export const setAutoUpdate = (on: boolean) => localStorage.setItem(KEY, on ? "1" : "0");

/** 正在监听 / 会议中：不弹更新提示、不自动重启 */
export async function isBusy(): Promise<boolean> {
  try {
    const s = await invoke<{ mode?: string; app?: string | null }>("ck_meeting_status");
    return busyFromStatus(s);
  } catch {
    return false;
  }
}

export function busyFromStatus(s: { mode?: string; app?: string | null } | null | undefined): boolean {
  if (!s) return false;
  return s.mode === "process" || s.mode === "system";
}
