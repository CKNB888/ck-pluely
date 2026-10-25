import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// 内存优化（v2.1）：每个窗口只加载自己用到的页面代码。
// 主条、面板、控制台各是一个 WebView 进程，之前每个都解析并常驻全部页面（含设置、模型管理等）。
const App = lazy(() => import("@/pages/app"));
const Panel = lazy(() => import("@/pages/panel"));
const Onboarding = lazy(() => import("@/pages/onboarding"));
const DashboardLayout = lazy(() =>
  import("@/layouts").then((m) => ({ default: m.DashboardLayout }))
);
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Chats = lazy(() => import("@/pages/chats"));
const SystemPrompts = lazy(() => import("@/pages/system-prompts"));
const ViewChat = lazy(() => import("@/pages/chats/components/View"));
const Shortcuts = lazy(() => import("@/pages/shortcuts"));
const Screenshot = lazy(() => import("@/pages/screenshot"));
const Settings = lazy(() => import("@/pages/settings"));
const Audio = lazy(() => import("@/pages/audio"));
const Responses = lazy(() => import("@/pages/responses"));
const DevSpace = lazy(() => import("@/pages/dev"));

export default function AppRoutes() {
  return (
    <Router>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/panel" element={<Panel />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/chats" element={<Chats />} />
            <Route path="/system-prompts" element={<SystemPrompts />} />
            <Route path="/chats/view/:conversationId" element={<ViewChat />} />
            <Route path="/shortcuts" element={<Shortcuts />} />
            <Route path="/screenshot" element={<Screenshot />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/audio" element={<Audio />} />
            <Route path="/responses" element={<Responses />} />
            <Route path="/dev-space" element={<DevSpace />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}
