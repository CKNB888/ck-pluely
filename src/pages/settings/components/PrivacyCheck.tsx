import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Header, Button } from "@/components";
import { t } from "@/i18n";
import { ONBOARDING_DONE_KEY, ONBOARDING_STEP_KEY } from "@/lib/onboarding";

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
  notes?: string[];
}

const methodText = (m: string) =>
  ({
    exclude: t("Excluded from capture (invisible to viewers)"),
    monitor: t("Shown as a black box to viewers (older Windows)"),
    sharing_none: t("Marked as not shareable (sharingType = none)"),
    none: t("No system-level protection"),
  })[m] ?? m;

const osName = (os: string) =>
  ({ macos: "macOS", windows: "Windows", linux: "Linux" })[os] ?? os;

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

  // 按检测到的系统版本由后端给出的说明（诚实列出局限）
  const notes: string[] = [...(status?.notes ?? [])];
  notes.push(
    t("Pluely shows no system notifications, so AI content never appears in notification banners.")
  );
  notes.push(
    t("Hide-all hotkey (default Ctrl+Alt+Shift+X / Cmd+Option+Shift+H) hides every Pluely window instantly; press again to restore.")
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
            {t("Operating system")}: {osName(status.os)} {status.os_version} · {methodText(status.method)}
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            localStorage.removeItem(ONBOARDING_DONE_KEY);
            localStorage.removeItem(ONBOARDING_STEP_KEY);
            window.location.assign("/onboarding");
          }}
        >
          {t("Open the setup guide again")}
        </Button>
      </div>
    </div>
  );
};
