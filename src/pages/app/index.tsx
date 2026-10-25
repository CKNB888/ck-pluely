import { Card, Updater, DragButton, Button } from "@/components";
import {
  SystemAudio,
  Completion,
  AudioVisualizer,
  StatusIndicator,
} from "./components";
import { useApp, useMacMode } from "@/hooks";
import { SparklesIcon } from "lucide-react";
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
          className={`ck-enter w-full flex flex-row items-center gap-2 p-2 ${
            macMode === "notch"
              ? "ck-notch rounded-t-none rounded-b-2xl border-t-0"
              : macMode === "menubar"
              ? "rounded-xl shadow-lg"
              : ""
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
              className="cursor-pointer"
              title={t("Open Dev Space")}
              onClick={openDashboard}
            >
              <SparklesIcon className="h-4 w-4" />
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
