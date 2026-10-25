import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Header, Button } from "@/components";
import { t } from "@/i18n";

interface WindowPrivacy {
  label: string;
  visible: boolean;
  method: string;
}
interface PrivacyStatus {
  os: string;
  os_version: string;
  method: string;
  windows: WindowPrivacy[];
}

const methodText = (m: string) =>
  ({
    exclude: t("Excluded from capture (invisible to viewers)"),
    monitor: t("Shown as a black box to viewers (older Windows)"),
    sharing_none: t("Marked as not shareable (sharingType = none)"),
    none: t("No system-level protection"),
  })[m] ?? m;

const macMajor = (v: string) => parseInt(v.split(".")[0] || "0", 10);

export const PrivacyCheck = () => {
  const [status, setStatus] = useState<PrivacyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    try {
      setError(null);
      setStatus(await invoke<PrivacyStatus>("privacy_status"));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const notes: string[] = [];
  if (status?.os === "windows") {
    notes.push(
      status.method === "exclude"
        ? t("Windows 10 2004+ detected: Tencent Meeting / DingTalk screen share and recordings will not show Pluely windows, while you still see them.")
        : t("This Windows version does not support full exclusion; viewers see a black box where Pluely is. Use the hide-all hotkey before sharing.")
    );
  } else if (status?.os === "macos") {
    notes.push(
      t("macOS: windows are marked not shareable. On macOS 15+ Apple no longer guarantees this for ScreenCaptureKit-based full-screen sharing, so viewers may still see the window.")
    );
    if (macMajor(status.os_version) >= 15)
      notes.push(
        t("Recommended on this Mac: share a single window (e.g. the slides/browser window) instead of the whole screen, and keep the hide-all hotkey ready.")
      );
  } else if (status) {
    notes.push(
      t("Linux has no system API to hide windows from screen sharing. Share a single window instead of the whole screen, or use the hide-all hotkey.")
    );
  }
  notes.push(
    t("Pluely shows no system notifications, so AI content never appears in notification banners.")
  );
  notes.push(
    t("Hide-all hotkey (default Ctrl+Alt+Shift+H / Cmd+Option+Shift+H) hides every Pluely window instantly; press again to restore.")
  );

  return (
    <div id="privacy-check" className="space-y-2">
      <Header
        title={t("Privacy self-check")}
        description={t("What is protected from screen sharing on this system, and its limits")}
        isMainTitle
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {status && (
        <div className="space-y-2 text-xs">
          <p>
            {t("Operating system")}: {status.os} {status.os_version} · {methodText(status.method)}
          </p>
          <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
            {status.windows.map((w) => (
              <li key={w.label}>
                {w.label}: {methodText(w.method)}
              </li>
            ))}
          </ul>
          <ul className="list-disc pl-5 space-y-1">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={run}>
          {t("Re-check and re-apply protection")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => invoke("hide_all_windows")}>
          {t("Hide all windows now")}
        </Button>
      </div>
    </div>
  );
};
