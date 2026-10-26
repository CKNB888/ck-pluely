import { useState, useEffect } from "react";
import {
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Markdown,
} from "@/components";
import { check, Update } from "@tauri-apps/plugin-updater";
import { listen } from "@tauri-apps/api/event";
import {
  FIRST_CHECK_DELAY_MS,
  UPDATE_INTERVAL_MS,
  getAutoUpdate,
  isBusy,
} from "@/lib/auto-update";

// ck-pluely v2.1.1：签名的 latest.json 由 CKNB888/ck-pluely 的 Release 工作流生成。
const CK_UPDATER_ENABLED = true;
import { relaunch } from "@tauri-apps/plugin-process";
import { useWindowResize } from "@/hooks";

import { t } from "@/i18n";

type UpdateState =
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "ready"
  | "error"
  | "uptodate"
  | "failed";

interface DownloadProgress {
  downloaded: number;
  contentLength: number;
  percentage: number;
}

export const Updater = () => {
  const [updateState, setUpdateState] = useState<UpdateState>("uptodate");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<DownloadProgress>({
    downloaded: 0,
    contentLength: 0,
    percentage: 0,
  });

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [manualClose, setManualClose] = useState(false);
  const { resizeWindow } = useWindowResize();

  const checkForUpdates = async () => {
    try {
      setUpdateState("checking");

      // ck-pluely: the in-app updater stays off until CKNB888/ck-pluely
      // publishes a signed latest.json (and tauri.conf.json gets its pubkey).
      // This prevents silently "updating" to the upstream closed-source v1.
      if (!CK_UPDATER_ENABLED) {
        setUpdateState("uptodate");
        return;
      }
      const foundUpdate = await check();
      if (foundUpdate) {
        setUpdate(foundUpdate);
        setUpdateState("available");
      } else {
        setUpdateState("uptodate");
      }
    } catch (err) {
      console.error("Failed to check for updates:", err);
      setUpdateState("error");
      setIsPopoverOpen(false);
    }
  };

  const [busyWarn, setBusyWarn] = useState(false);

  const downloadAndInstall = async (force = false) => {
    if (!update) return;
    // 监听 / 会议中不安装（安装后要重启），除非老师明确点「仍然更新」
    if (!force && (await isBusy())) {
      setBusyWarn(true);
      return;
    }
    setBusyWarn(false);

    try {
      setUpdateState("downloading");
      setProgress({ downloaded: 0, contentLength: 0, percentage: 0 });

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setProgress((prev) => ({
              ...prev,
              contentLength: event.data.contentLength || 0,
            }));
            break;

          case "Progress":
            setProgress((prev) => {
              const downloaded = prev.downloaded + event.data.chunkLength;
              const percentage =
                prev.contentLength > 0
                  ? Math.round((downloaded / prev.contentLength) * 100)
                  : 0;

              return {
                downloaded,
                contentLength: prev.contentLength,
                percentage,
              };
            });
            break;

          case "Finished":
            setUpdateState("installing");
            break;
        }
      });

      setUpdateState("ready");

      // Auto-relaunch after a short delay to show success state
      setTimeout(async () => {
        await relaunch();
      }, 2000);
    } catch (err) {
      console.error("Failed to download/install update:", err);
      setUpdateState("failed");
      // Keep the popover open so user can try again
      setIsPopoverOpen(true);
    }
  };

  // 启动 1 分钟后检查一次，之后每 6 小时；设置里可关闭；设置页「检查更新」也会触发
  useEffect(() => {
    const run = () => {
      if (getAutoUpdate()) void checkForUpdates();
    };
    const first = setTimeout(run, FIRST_CHECK_DELAY_MS);
    const every = setInterval(run, UPDATE_INTERVAL_MS);
    const un = listen("ck-check-update", () => void checkForUpdates());
    return () => {
      clearTimeout(first);
      clearInterval(every);
      void un.then((f) => f());
    };
  }, []);

  // Handle window resizing when popover opens/closes
  useEffect(() => {
    resizeWindow(isPopoverOpen);
  }, [isPopoverOpen, resizeWindow]);

  // Helper functions for button state
  const getButtonContent = () => {
    switch (updateState) {
      case "downloading":
        return (
          <>
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            {t("Downloading...")} {progress.percentage}%
          </>
        );
      case "installing":
        return (
          <>
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            {t("Installing...")}
          </>
        );
      case "ready":
        return (
          <>
            <CheckCircle className="mr-2 h-4 w-4" />
            {t("Ready - Restarting...")}
          </>
        );
      case "error":
        return (
          <>
            <AlertCircle className="mr-2 h-4 w-4" />
            {t("Try Again")}
          </>
        );
      default:
        return (
          <>
            <Download className="mr-2 h-4 w-4" />
            {t("Download & Install Update")}
          </>
        );
    }
  };

  const getButtonDisabled = () => {
    return ["downloading", "installing", "ready"].includes(updateState);
  };

  const getButtonOnClick = () => {
    return updateState === "error" ? checkForUpdates : () => downloadAndInstall();
  };

  // Handle popover open/close with manual control
  const handlePopoverOpenChange = (open: boolean) => {
    // Prevent closing during active operations unless manually triggered
    const isActiveOperation = ["downloading", "installing", "ready"].includes(
      updateState
    );

    if (open) {
      setIsPopoverOpen(true);
      setManualClose(false);
    } else if (!isActiveOperation || manualClose) {
      setIsPopoverOpen(false);
      setManualClose(false);
    }
  };

  // Handle manual trigger click
  const handleTriggerClick = () => {
    setManualClose(!isPopoverOpen);
    setIsPopoverOpen(!isPopoverOpen);
  };

  // Only show updater when there's an update available or during active operations
  if (updateState === "uptodate" || updateState === "error") {
    return null;
  }

  return (
    <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          onClick={handleTriggerClick}
          className="cursor-pointer"
          disabled={updateState === "checking"}
          title={t("Update available: {{v0}}", {
            v0: update?.version,
          })}
          aria-label={t("Update available: {{v0}}", {
            v0: update?.version,
          })}
        >
          {updateState === "checking" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        className="select-none w-screen p-0 border overflow-hidden border-input/50"
        sideOffset={8}
      >
        <ScrollArea className="h-[calc(100vh-10rem)]">
          <div className="p-6 space-y-4">
            {/* Update Header */}
            <div className="border-b border-input/50 pb-2">
              <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {t("Update Available")}
              </h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("A new version (")}
                {update?.version}
                {t(") is available. Here's what's new:")}
              </p>
            </div>

            {/* Release Notes */}
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {update?.body ? (
                <Markdown>{update.body}</Markdown>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("Release notes not available for this version.")}
                </p>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Fixed Download Section */}
        <div className="border-t border-input/50 p-4 space-y-3">
          <Button
            onClick={getButtonOnClick()}
            disabled={getButtonDisabled()}
            className="w-full"
            variant={updateState === "failed" ? "destructive" : "default"}
          >
            {getButtonContent()}
          </Button>

          {busyWarn ? (
            <div className="space-y-2 text-center text-xs text-muted-foreground">
              <p>正在监听 / 上课中。更新需要重启，建议下课后再装，记录和设置都会保留。</p>
              <Button size="sm" variant="outline" onClick={() => downloadAndInstall(true)}>
                仍然现在更新
              </Button>
            </div>
          ) : null}
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {t("Having trouble downloading?")}{" "}
              <a
                href={"https://github.com/CKNB888/ck-pluely/releases/latest"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline inline-flex items-center gap-1"
              >
                {t("Download manually")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
