import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AudioLinesIcon,
  ChevronRightIcon,
  EyeOffIcon,
  GithubIcon,
  KeyboardIcon,
  MicIcon,
  MoonIcon,
  PanelTopIcon,
  PowerIcon,
  ScanTextIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SunIcon,
  TypeIcon,
} from "lucide-react";
import logo from "@/assets/logo.svg";
import { useApp, useTheme } from "@/contexts";
import { getAllConversations } from "@/lib/database";
import type { ChatConversation } from "@/types";
import { providerLabel, relativeTime, REPO_URL, setUiStyle } from "@/lib/ui-style";
import { DEFAULT_SHORTCUT_ACTIONS } from "@/config";
import { formatHotkey } from "@/lib/onboarding";
import { getPlatform } from "@/lib/platform";

type Tab = "home" | "history" | "status";

interface PrivacyStatus {
  os: string;
  os_version: string;
  method: string;
  windows: { label: string; visible: boolean; method: string }[];
  notes?: string[];
}

const act = (action: string) => invoke("ck_panel_action", { action }).catch(() => {});

const IconButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={onClick}
    className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-[15px]"
  >
    {children}
  </button>
);

const Tile = ({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex flex-col items-start gap-2 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground"
  >
    {icon}
    <span className="text-[13px] font-medium leading-none">{label}</span>
    {hint ? <span className="text-[11px] leading-none text-muted-foreground">{hint}</span> : null}
  </button>
);

const Row = ({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] transition-colors hover:bg-accent/60"
  >
    <span className="text-muted-foreground">{label}</span>
    <span className="flex min-w-0 items-center gap-1 truncate font-medium">
      <span className="truncate">{value}</span>
      {onClick ? <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
    </span>
  </button>
);

const methodText: Record<string, string> = {
  exclude: "共享画面中不可见",
  monitor: "共享画面中显示为黑块",
  sharing_none: "已禁止被共享",
  none: "系统不支持防录屏",
};

const windowName: Record<string, string> = {
  main: "悬浮条",
  dashboard: "控制台",
  panel: "本面板",
};

const hotkey = (id: string) => {
  const a = DEFAULT_SHORTCUT_ACTIONS.find((x) => x.id === id);
  if (!a) return "";
  const os = getPlatform();
  return formatHotkey(a.defaultKey[os], os);
};

const PanelPage = () => {
  const { selectedAIProvider, selectedSttProvider } = useApp();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<Tab>("home");
  const [listening, setListening] = useState(false);
  const [recent, setRecent] = useState<ChatConversation[]>([]);
  const [privacy, setPrivacy] = useState<PrivacyStatus | null>(null);

  const refresh = useCallback(() => {
    invoke<boolean>("get_capture_status").then(setListening).catch(() => {});
    getAllConversations()
      .then((all) => setRecent(all.slice(0, 8)))
      .catch(() => setRecent([]));
    invoke<PrivacyStatus>("privacy_status").then(setPrivacy).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("ck-panel-root");
    refresh();
    let un: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload }) => payload && refresh())
      .then((f) => (un = f))
      .catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && invoke("ck_hide_panel").catch(() => {});
    window.addEventListener("keydown", onKey);
    return () => {
      un?.();
      window.removeEventListener("keydown", onKey);
    };
  }, [refresh]);

  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  const model = selectedAIProvider?.variables?.model || selectedAIProvider?.variables?.MODEL;
  const protectedCount = privacy?.windows.filter((w) => w.method !== "none").length ?? 0;

  return (
    <div className="ck-panel ck-enter flex h-screen w-screen flex-col overflow-hidden rounded-xl border bg-background text-foreground">
      <header className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <div className="flex items-center gap-2">
          <img src={logo} alt="" className="size-[22px] rounded-[6px]" />
          <span className="text-[15px] font-semibold tracking-tight">CK Pluely</span>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="一键隐藏全部窗口" onClick={() => act("hide_all")}>
            <EyeOffIcon />
          </IconButton>
          <IconButton label={isDark ? "切换为浅色" : "切换为深色"} onClick={() => setTheme(isDark ? "light" : "dark")}>
            {isDark ? <SunIcon /> : <MoonIcon />}
          </IconButton>
          <IconButton
            label="改用悬浮条"
            onClick={async () => {
              await setUiStyle("bar");
              act("show_bar");
            }}
          >
            <PanelTopIcon />
          </IconButton>
          <IconButton label="GitHub" onClick={() => openUrl(REPO_URL).catch(() => {})}>
            <GithubIcon />
          </IconButton>
        </div>
      </header>

      <nav className="mx-4 grid grid-cols-3 rounded-lg bg-muted p-0.5 text-[12px]">
        {(
          [
            ["home", "常用"],
            ["history", "记录"],
            ["status", "状态"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md py-1 font-medium transition-colors ${
              tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === "home" ? (
          <div className="flex flex-col gap-3">
            <section className="flex items-center justify-between rounded-lg border bg-card px-3 py-3">
              <div className="flex items-center gap-3">
                <span
                  className={`grid size-8 place-items-center rounded-full ${
                    listening ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <AudioLinesIcon className="size-4" />
                </span>
                <div className="leading-tight">
                  <div className="text-[13px] font-medium">会议实时转写</div>
                  <div className="text-[11px] text-muted-foreground">
                    {listening ? "正在收听系统声音" : `未开启 · ${hotkey("system_audio")}`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => act("system_audio")}
                className={`h-7 rounded-md px-3 text-[12px] font-medium transition-colors ${
                  listening
                    ? "border bg-card hover:bg-accent"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {listening ? "停止" : "开始"}
              </button>
            </section>

            <div className="grid grid-cols-3 gap-2">
              <Tile icon={<MicIcon />} label="语音提问" hint={hotkey("audio_recording")} onClick={() => act("audio_recording")} />
              <Tile icon={<ScanTextIcon />} label="截图提问" hint={hotkey("screenshot")} onClick={() => act("screenshot")} />
              <Tile icon={<TypeIcon />} label="文字提问" hint={hotkey("toggle_window")} onClick={() => act("show_bar")} />
            </div>

            <section className="overflow-hidden rounded-lg border bg-card divide-y">
              <Row
                label="对话模型"
                value={`${providerLabel(selectedAIProvider?.provider)}${model ? ` · ${model}` : ""}`}
                onClick={() => act("dashboard")}
              />
              <Row label="语音识别" value={providerLabel(selectedSttProvider?.provider)} onClick={() => act("dashboard")} />
            </section>

            {recent[0] ? (
              <section>
                <div className="mb-1.5 flex items-center justify-between text-[12px] text-muted-foreground">
                  <span>最近一次</span>
                  <span>{relativeTime(recent[0].updatedAt)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => act("dashboard")}
                  className="w-full rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
                >
                  <div className="truncate text-[13px] font-medium">{recent[0].title || "未命名对话"}</div>
                  <div className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                    {recent[0].messages.filter((m) => m.role === "assistant").slice(-1)[0]?.content ?? ""}
                  </div>
                </button>
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === "history" ? (
          recent.length ? (
            <ul className="overflow-hidden rounded-lg border bg-card divide-y">
              {recent.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => act("dashboard")}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{c.title || "未命名对话"}</span>
                      <span className="text-[11px] text-muted-foreground">{c.messages.length} 条消息</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(c.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 py-8 text-center text-[13px] text-muted-foreground">还没有记录。开始一次转写或提问后会出现在这里。</p>
          )
        ) : null}

        {tab === "status" ? (
          <div className="flex flex-col gap-3">
            <section className="rounded-lg border bg-card px-3 py-3">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <ShieldCheckIcon className="size-4 text-muted-foreground" />
                共享屏幕时的隐私
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                {privacy ? `${privacy.os_version} · ${protectedCount}/${privacy.windows.length} 个窗口受保护` : "正在检测"}
              </div>
              <ul className="mt-2 space-y-1">
                {privacy?.windows.map((w) => (
                  <li key={w.label} className="flex justify-between text-[12px]">
                    <span>{windowName[w.label] ?? w.label}</span>
                    <span className="text-muted-foreground">{methodText[w.method] ?? w.method}</span>
                  </li>
                ))}
              </ul>
              {privacy?.notes?.length ? (
                <p className="mt-2 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">{privacy.notes[0]}</p>
              ) : null}
            </section>
            <section className="rounded-lg border bg-card px-3 py-3">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <KeyboardIcon className="size-4 text-muted-foreground" />
                快捷键
              </div>
              <dl className="mt-2 space-y-1 text-[12px]">
                {[
                  ["一键隐藏", "hide_all"],
                  ["显示悬浮条", "toggle_window"],
                  ["打开控制台", "toggle_dashboard"],
                ].map(([l, id]) => (
                  <div key={id} className="flex justify-between">
                    <dt>{l}</dt>
                    <dd className="font-mono text-[11px] text-muted-foreground">{hotkey(id)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        ) : null}
      </main>

      <footer className="flex items-center justify-between border-t px-2 py-1.5 text-[12px]">
        <button
          type="button"
          onClick={() => act("dashboard")}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <SlidersHorizontalIcon className="size-3.5" />
          设置
        </button>
        <button
          type="button"
          onClick={() => act("quit")}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PowerIcon className="size-3.5" />
          退出
        </button>
      </footer>
    </div>
  );
};

export default PanelPage;
