import { Card, Updater, DragButton, Button } from "@/components";
import {
  SystemAudio,
  Completion,
  AudioVisualizer,
  StatusIndicator,
} from "./components";
import { useApp, useMacMode } from "@/hooks";
import { SlidersHorizontalIcon } from "lucide-react";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { BAR_POS_KEY, getUiStyle, setUiStyle } from "@/lib/ui-style";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "@/layouts";
import { useEffect } from "react";
import { ONBOARDING_DONE_KEY } from "@/lib/onboarding";

import { t } from "@/i18n";

const App = () => {
  const { isHidden, systemAudio } = useApp();
  const macMode = useMacMode();

  // 首次启动自动打开控制台里的新手引导
  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_DONE_KEY)) {
      invoke("open_dashboard").catch(() => {});
    }
  }, []);

  // 界面样式：默认托盘面板；选了悬浮条就直接显示主条。悬浮条位置会被记住。
  useEffect(() => {
    const style = getUiStyle();
    const win = getCurrentWindow();
    const saved = localStorage.getItem(BAR_POS_KEY);
    (async () => {
      if (saved) {
        try {
          const { x, y } = JSON.parse(saved);
          await win.setPosition(new PhysicalPosition(x, y));
        } catch {
          localStorage.removeItem(BAR_POS_KEY);
        }
      }
      await invoke("ck_set_ui_style", { style, savedPos: !!saved }).catch(() => {});
      await setUiStyle(style);
      if (style === "bar") invoke("ck_panel_action", { action: "show_bar" }).catch(() => {});
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let un: (() => void) | undefined;
    win
      .onMoved(({ payload }) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          localStorage.setItem(BAR_POS_KEY, JSON.stringify({ x: payload.x, y: payload.y }));
          invoke("ck_set_ui_style", { style: getUiStyle(), savedPos: true }).catch(() => {});
        }, 400);
      })
      .then((f) => (un = f))
      .catch(() => {});
    return () => {
      clearTimeout(timer);
      un?.();
    };
  }, []);

  const openDashboard = async () => {
    try {
      await invoke("open_dashboard");
    } catch (error) {
      console.error("Failed to open dashboard:", error);
    }
  };

  return (
    <ErrorBoundary
      fallbackRender={() => {
        return <ErrorLayout isCompact />;
      }}
      resetKeys={["app-error"]}
      onReset={() => {
        console.log("Reset");
      }}
    >
      <div
        className={`w-screen h-screen flex overflow-hidden justify-center items-start ${
          isHidden ? "hidden pointer-events-none" : ""
        }`}
      >
        <Card
          data-tauri-drag-region
          className={`ck-enter w-full flex flex-row items-center gap-2 p-2 ${
            macMode === "notch"
              ? "ck-notch rounded-t-none rounded-b-2xl border-t-0"
              : macMode === "menubar"
              ? "ck-bar"
              : "ck-bar"
          }`}
        >
          <SystemAudio {...systemAudio} />
          {systemAudio?.capturing ? (
            <div className="flex flex-row items-center gap-2 justify-between w-full">
              <div className="flex flex-1 items-center gap-2">
                <AudioVisualizer isRecording={systemAudio?.capturing} />
              </div>
              <div className="flex !w-fit items-center gap-2">
                <StatusIndicator
                  setupRequired={systemAudio.setupRequired}
                  error={systemAudio.error}
                  isProcessing={systemAudio.isProcessing}
                  isAIProcessing={systemAudio.isAIProcessing}
                  capturing={systemAudio.capturing}
                />
              </div>
            </div>
          ) : null}

          <div
            className={`${
              systemAudio?.capturing
                ? "hidden w-full fade-out transition-all duration-300"
                : "w-full flex flex-row gap-2 items-center"
            }`}
          >
            <Completion isHidden={isHidden} />
            <Button
              size={"icon"}
              variant="ghost"
              className="size-8 text-muted-foreground"
              title={t("Open Dev Space")}
              onClick={openDashboard}
            >
              <SlidersHorizontalIcon className="size-4" />
            </Button>
          </div>

          <Updater />
          <DragButton />
        </Card>
      </div>
    </ErrorBoundary>
  );
};

export default App;
