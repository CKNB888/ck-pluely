import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** "notch"（有刘海，贴顶显示）| "menubar"（菜单栏弹出）| "floating"（Windows/Linux） */
export type MacMode = "notch" | "menubar" | "floating";

export const useMacMode = (): MacMode => {
  const [mode, setMode] = useState<MacMode>("floating");
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    invoke<string>("ck_mac_mode")
      .then((m) => setMode(m as MacMode))
      .catch(() => {});
    listen<string>("ck-mac-mode", (e) => setMode(e.payload as MacMode))
      .then((u) => (unlisten = u))
      .catch(() => {});
    return () => unlisten?.();
  }, []);
  return mode;
};
