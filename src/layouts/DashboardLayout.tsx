import { Sidebar } from "@/components";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { PENDING_NAV_KEY } from "@/lib/ui-style";
import { ONBOARDING_DONE_KEY } from "@/lib/onboarding";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "./ErrorLayout";

export const DashboardLayout = () => {
  const navigate = useNavigate();
  // ck-pluely v2.1.1: the menu-bar panel opens a specific page / conversation here.
  useEffect(() => {
    const go = () => {
      const p = localStorage.getItem(PENDING_NAV_KEY);
      if (p) {
        localStorage.removeItem(PENDING_NAV_KEY);
        navigate(p);
      }
    };
    go();
    const un = listen("ck-navigate", go);
    return () => {
      un.then((f) => f()).catch(() => {});
    };
  }, [navigate]);
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
