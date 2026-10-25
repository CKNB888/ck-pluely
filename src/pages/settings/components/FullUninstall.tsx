import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Header } from "@/components";
import { allSecretAccounts } from "@/lib/uninstall";
import { getPlatform } from "@/lib/platform";

export const FullUninstall = () => {
  const [open, setOpen] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const os = getPlatform();

  useEffect(() => {
    if (open) invoke<string[]>("ck_uninstall_paths").then(setPaths).catch(() => setPaths([]));
  }, [open]);

  const run = async () => {
    setBusy(true);
    try {
      localStorage.clear();
      await invoke("ck_full_uninstall", { accounts: allSecretAccounts() });
    } catch {
      setBusy(false);
    }
  };

  const tail =
    os === "macos"
      ? "完成后应用会被移到废纸篓并退出。"
      : os === "windows"
        ? "完成后会退出并打开系统卸载程序，按提示移除应用本体。"
        : "完成后会退出。应用本体请用包管理器移除，例如 sudo apt remove ck-pluely。";

  return (
    <div id="full-uninstall" className="space-y-3">
      <Header
        title="完全卸载"
        description="删除聊天记录、设置、缓存、WebView 数据、钥匙串中的 API Key 和开机启动项。"
        isMainTitle
      />
      {!open ? (
        <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
          完全卸载…
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-[13px]">将删除以下位置，此操作无法撤销。{tail}</p>
          <ul className="max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-5 text-muted-foreground">
            {paths.map((p) => (
              <li key={p} className="truncate" title={p}>{p}</li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>取消</Button>
            <Button variant="destructive" onClick={run} disabled={busy}>
              {busy ? "正在删除" : "确认完全卸载"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
