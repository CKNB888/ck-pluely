import { Sidebar } from "@/components";
import { Navigate, Outlet } from "react-router-dom";
import { ONBOARDING_DONE_KEY } from "@/lib/onboarding";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "./ErrorLayout";

export const DashboardLayout = () => {
  // 首次启动：先走新手引导
  if (!localStorage.getItem(ONBOARDING_DONE_KEY)) {
    return <Navigate to="/onboarding" replace />;
  }
  return (
    <ErrorBoundary
      fallbackRender={() => {
        return <ErrorLayout />;
      }}
      resetKeys={["dashboard-error"]}
      onReset={() => {
        console.log("Reset");
      }}
    >
      <div className="relative flex h-screen w-screen overflow-hidden bg-background">
        {/* Draggable region */}
        <div
          className="absolute left-0 right-0 top-0 z-50 h-10 select-none"
          data-tauri-drag-region={true}
        />

        {/* Sidebar */}
        <Sidebar />
        {/* Main Content */}
        <main className="flex flex-1 flex-col overflow-hidden px-8">
          <Outlet />
        </main>
      </div>
    </ErrorBoundary>
  );
};
