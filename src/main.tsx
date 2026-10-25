import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { AppProvider, ThemeProvider } from "./contexts";
import "./global.css";
import "./i18n";
import { I18nRoot } from "./i18n/I18nRoot";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";
import { ErrorBoundary } from "react-error-boundary";
import { RootErrorFallback } from "./components/RootErrorFallback";
import { getVersion } from "@tauri-apps/api/app";
import { autoBackupOnUpgrade } from "./lib/backup";

/** 升级后首次启动：在新版本改写任何设置之前先做一份自动备份（最多等 3 秒）。 */
async function preUpgradeBackup() {
  try {
    const v = await getVersion();
    await Promise.race([autoBackupOnUpgrade(v), new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    /* 备份失败不影响启动 */
  }
}

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

// Render different components based on window label
if (windowLabel.startsWith("capture-overlay-")) {
  const monitorIndex = parseInt(windowLabel.split("-")[2], 10) || 0;
  // Render overlay without providers
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <I18nRoot>
        <ErrorBoundary FallbackComponent={RootErrorFallback}>
          <Overlay monitorIndex={monitorIndex} />
        </ErrorBoundary>
      </I18nRoot>
    </React.StrictMode>
  );
} else {
  const render = () => ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <I18nRoot>
        <ThemeProvider>
          <AppProvider>
            <ErrorBoundary FallbackComponent={RootErrorFallback}>
              <AppRoutes />
            </ErrorBoundary>
          </AppProvider>
        </ThemeProvider>
      </I18nRoot>
    </React.StrictMode>
  );
  if (windowLabel === "main") preUpgradeBackup().finally(render);
  else render();
}
