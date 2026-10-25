import { VoiceprintStep } from "@/components/local/VoiceprintStep";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  EyeOffIcon,
  HeadphonesIcon,
  KeyboardIcon,
  KeyRoundIcon,
  Loader2Icon,
  MicIcon,
  MonitorIcon,
  MousePointerClickIcon,
  PartyPopperIcon,
  ShieldCheckIcon,
  PenLineIcon,
  AudioLinesIcon,
  XCircleIcon,
} from "lucide-react";
import { Button, Input } from "@/components";
import { useApp } from "@/contexts";
import { getPlatform } from "@/lib";
import { DEFAULT_SHORTCUT_ACTIONS } from "@/config/shortcuts";
import { AI_PROVIDERS, SPEECH_TO_TEXT_PROVIDERS } from "@/config";
import { checkProvider, ProviderCheckResult } from "@/lib/functions/provider-check";
import {
  buildSteps,
  canContinue,
  formatHotkey,
  isOptionalStep,
  isPermissionStep,
  nextIndex,
  ONBOARDING_DONE_KEY,
  ONBOARDING_STEP_KEY,
  OnboardingOs,
  PermissionSnapshot,
  PermState,
  prevIndex,
  settingsUrl,
  shouldAutoAdvance,
  StepId,
  stepState,
} from "@/lib/onboarding";

interface BackendStatus {
  os: string;
  os_version: string;
  microphone: PermState;
  has_output_device: boolean;
  has_input_device: boolean;
  protection: string;
}

const toOs = (p: string): OnboardingOs =>
  p === "macos" ? "macos" : p === "windows" ? "windows" : "linux";

async function macPerms() {
  try {
    const m = await import("tauri-plugin-macos-permissions-api");
    const [mic, screen, ax] = await Promise.all([
      m.checkMicrophonePermission(),
      m.checkScreenRecordingPermission(),
      m.checkAccessibilityPermission(),
    ]);
    const s = (b: boolean): PermState => (b ? "granted" : "denied");
    return { microphone: s(mic), screen: s(screen), accessibility: s(ax) };
  } catch {
    return null;
  }
}

async function requestMac(step: StepId) {
  try {
    const m = await import("tauri-plugin-macos-permissions-api");
    if (step === "mic") await m.requestMicrophonePermission();
    if (step === "screen") await m.requestScreenRecordingPermission();
    if (step === "accessibility") await m.requestAccessibilityPermission();
  } catch {
    /* 由「打开系统设置」兜底 */
  }
}

const STEP_META: Record<StepId, { icon: React.ElementType; title: string }> = {
  welcome: { icon: PenLineIcon, title: "欢迎使用 CK Pluely" },
  voiceprint: { icon: AudioLinesIcon, title: "录入你的声音（可选）" },
  privacy: { icon: EyeOffIcon, title: "默认对屏幕共享隐身" },
  mic: { icon: MicIcon, title: "允许使用麦克风" },
  screen: { icon: MonitorIcon, title: "允许屏幕与系统录音" },
  accessibility: { icon: MousePointerClickIcon, title: "辅助功能（可选）" },
  audio: { icon: HeadphonesIcon, title: "检查系统声音输出" },
  apikey: { icon: KeyRoundIcon, title: "填写 Groq API Key" },
  hotkeys: { icon: KeyboardIcon, title: "记住这几个快捷键" },
  selfcheck: { icon: ShieldCheckIcon, title: "隐私自检" },
  done: { icon: PartyPopperIcon, title: "一切就绪" },
};

const PERM_TEXT: Partial<Record<StepId, string>> = {
  mic: "用于实时转写你说的话。只在你开始录音时使用，音频不会保存到本地以外。",
  screen:
    "用于截图提问和收听系统声音（面试官 / 老师的声音）。macOS 授权后通常需要重启应用才会生效。",
  accessibility: "只有部分快捷操作需要。暂时不需要可以直接跳过，之后可在设置里再开。",
  audio: "收听电脑里播放的声音（会议、网课）需要一个可用的扬声器或耳机输出设备。",
};

export default function Onboarding() {
  const navigate = useNavigate();
  const os = toOs(getPlatform());
  const steps = useMemo(() => buildSteps(os), [os]);
  const [index, setIndex] = useState(() => {
    const saved = Number(localStorage.getItem(ONBOARDING_STEP_KEY) || 0);
    return Number.isFinite(saved) ? Math.min(Math.max(saved, 0), steps.length - 1) : 0;
  });
  const step = steps[index];
  const [backend, setBackend] = useState<BackendStatus | null>(null);
  const [snap, setSnap] = useState<PermissionSnapshot>({
    microphone: "unknown",
    screen: "unknown",
    accessibility: "unknown",
    hasOutputDevice: true,
    hasInputDevice: true,
  });
  const prevState = useRef<PermState | null>(null);

  useEffect(() => {
    localStorage.setItem(ONBOARDING_STEP_KEY, String(index));
    prevState.current = null;
  }, [index]);

  const poll = useCallback(async () => {
    const b = await invoke<BackendStatus>("ck_permission_status").catch(() => null);
    if (b) setBackend(b);
    const mac = os === "macos" ? await macPerms() : null;
    setSnap({
      microphone: mac?.microphone ?? b?.microphone ?? "unknown",
      screen: mac?.screen ?? "granted",
      accessibility: mac?.accessibility ?? "granted",
      hasOutputDevice: b?.has_output_device ?? true,
      hasInputDevice: b?.has_input_device ?? true,
    });
  }, [os]);

  // 权限步骤每秒轮询一次
  useEffect(() => {
    poll();
    if (!isPermissionStep(step)) return;
    const id = window.setInterval(poll, 1000);
    return () => window.clearInterval(id);
  }, [poll, step]);

  const state = stepState(step, snap);
  useEffect(() => {
    if (!isPermissionStep(step)) return;
    if (shouldAutoAdvance(prevState.current, state)) {
      const id = window.setTimeout(() => setIndex((i) => nextIndex(steps, i)), 700);
      prevState.current = state;
      return () => window.clearTimeout(id);
    }
    prevState.current = state;
  }, [state, step, steps]);

  const finish = () => {
    localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    localStorage.removeItem(ONBOARDING_STEP_KEY);
    navigate("/dashboard");
  };

  const Meta = STEP_META[step];
  const isLast = step === "done";

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 h-10 select-none" data-tauri-drag-region={true} />
      <div className="w-full max-w-[520px] px-6">
        {/* 进度 */}
        <div className="mb-8 flex items-center justify-center gap-1.5">
          {steps.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-primary" : i < index ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        <div key={step} className="ck-enter rounded-2xl border bg-card p-8 shadow-sm">
          <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Meta.icon className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {step === "privacy" && os === "linux" ? "共享屏幕时的隐私" : Meta.title}
          </h1>
          <div className="mt-2 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <StepBody step={step} os={os} state={state} backend={backend} />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={finish} className="text-muted-foreground">
            {isLast ? "" : "跳过引导"}
          </Button>
          <div className="flex gap-2">
            {index > 0 && !isLast ? (
              <Button variant="outline" onClick={() => setIndex(prevIndex(index))}>
                上一步
              </Button>
            ) : null}
            {isLast ? (
              <Button onClick={finish}>开始使用</Button>
            ) : (
              <Button
                onClick={() => setIndex(nextIndex(steps, index))}
                disabled={!canContinue(step, state)}
              >
                {isPermissionStep(step) && state !== "granted"
                  ? isOptionalStep(step) || state === "unknown"
                    ? "稍后再说"
                    : "等待授权…"
                  : "下一步"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const StatusLine = ({ state, pending, unknownText }: { state: PermState; pending?: string; unknownText?: string }) => (
  <div
    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-300 ${
      state === "granted"
        ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
        : state === "denied"
        ? "border-border bg-muted/40 text-foreground"
        : "border-border bg-muted/40 text-muted-foreground"
    }`}
  >
    {state === "granted" ? (
      <CheckCircle2Icon className="size-4" />
    ) : state === "denied" ? (
      <Loader2Icon className="size-4 animate-spin" />
    ) : (
      <CircleDashedIcon className="size-4" />
    )}
    {state === "granted"
      ? "已就绪"
      : state === "denied"
      ? pending ?? "尚未授权，授权后这里会自动变绿"
      : unknownText ?? "无法自动检测，请在系统设置中确认已开启"}
  </div>
);

function StepBody({
  step,
  os,
  state,
  backend,
}: {
  step: StepId;
  os: OnboardingOs;
  state: PermState;
  backend: BackendStatus | null;
}) {
  const osLabel = os === "macos" ? "macOS" : os === "windows" ? "Windows" : "Linux";
  switch (step) {
    case "welcome":
      return (
        <>
          <p>面试、上课、开会时的实时 AI 助手：听懂对方的问题，几秒内给出答案。</p>
          <p>接下来用一分钟完成几项设置，随时可以跳过，之后也能在「设置」里重新打开本引导。</p>
          {backend ? (
            <p className="text-xs">
              检测到系统：{osLabel} {backend.os_version}
            </p>
          ) : null}
        </>
      );
    case "privacy":
      return (
        <>
          <p>隐私模式默认开启：在腾讯会议、钉钉、飞书、Zoom、Teams、OBS、微信/QQ 截图里，对方看不到本应用的窗口，你自己照常可见。</p>
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
            {backend?.protection === "exclude"
              ? "本机使用 Windows 的「从捕获中排除」，整屏和窗口共享都不可见。"
              : backend?.protection === "monitor"
              ? "本机 Windows 版本较旧，共享画面中本应用会显示为黑块。建议共享前按一键隐藏。"
              : backend?.protection === "sharing_none"
              ? "本机使用 macOS「不可共享窗口」。macOS 15 及以上整屏共享不保证隐藏，建议只共享单个窗口。"
              : "Linux 没有系统级防录屏接口，建议只共享单个窗口，或共享前按一键隐藏。"}
          </p>
        </>
      );
    case "mic":
    case "screen":
    case "accessibility":
    case "audio":
      return <PermissionBody step={step} os={os} state={state} />;
    case "apikey":
      return <ApiKeyBody />;
    case "hotkeys":
      return <HotkeysBody os={os} />;
    case "voiceprint":
      return <VoiceprintStep />;
    case "selfcheck":
      return <SelfCheckBody />;
    case "done":
      return (
        <>
          <p>随时用「显示 / 隐藏主条」快捷键呼出主条，开始提问或开启实时转写。</p>
          <p>
            {os === "macos"
              ? "主条会出现在刘海处（有刘海的 Mac）或菜单栏图标下方。"
              : "主条会悬浮在屏幕顶部，可拖动到任意位置。"}
          </p>
        </>
      );
  }
}

function PermissionBody({ step, os, state }: { step: StepId; os: OnboardingOs; state: PermState }) {
  const url = settingsUrl(os, step);
  return (
    <>
      <p>{PERM_TEXT[step]}</p>
      <StatusLine
        state={state}
        pending={step === "audio" ? "未检测到播放设备，接上耳机或扬声器后这里会自动变绿" : undefined}
      />
      <div className="flex flex-wrap gap-2">
        {os === "macos" && step !== "audio" && state !== "granted" ? (
          <Button size="sm" onClick={() => requestMac(step)}>
            请求授权
          </Button>
        ) : null}
        {url && state !== "granted" ? (
          <Button size="sm" variant="outline" onClick={() => invoke("ck_open_settings", { url })}>
            打开系统设置
          </Button>
        ) : null}
        {os === "macos" && step === "screen" && state !== "granted" ? (
          <Button size="sm" variant="outline" onClick={() => invoke("ck_restart_app")}>
            已授权，重启应用
          </Button>
        ) : null}
      </div>
    </>
  );
}

function ApiKeyBody() {
  const { selectedAIProvider, onSetSelectedAIProvider, selectedSttProvider, onSetSelectedSttProvider } =
    useApp();
  const current =
    selectedAIProvider.provider === "groq" ? selectedAIProvider.variables?.api_key ?? "" : "";
  const [key, setKey] = useState(current);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProviderCheckResult | null>(null);
  const groq = AI_PROVIDERS.find((p) => p.id === "groq");
  const groqStt = SPEECH_TO_TEXT_PROVIDERS.find((p) => p.id === "groq");

  const save = (k: string) => {
    const aiModel =
      selectedAIProvider.provider === "groq" && selectedAIProvider.variables?.model
        ? selectedAIProvider.variables.model
        : groq?.modelHint ?? "";
    onSetSelectedAIProvider({ provider: "groq", variables: { model: aiModel, api_key: k } });
    const sttModel =
      selectedSttProvider.provider === "groq" && selectedSttProvider.variables?.model
        ? selectedSttProvider.variables.model
        : groqStt?.modelHint ?? "";
    onSetSelectedSttProvider({ provider: "groq", variables: { model: sttModel, api_key: k } });
  };

  const test = async () => {
    if (!groq?.curl || !key.trim()) return;
    save(key.trim());
    setBusy(true);
    setResult(null);
    try {
      setResult(await checkProvider(groq.curl, { api_key: key.trim() }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p>默认使用 Groq（速度快、有免费额度），同一个 Key 同时用于对话和语音转写。可在 console.groq.com 免费创建。也可以跳过，稍后在「开发者空间」里换成其它服务商。</p>
      <Input
        type="password"
        placeholder="gsk_…"
        value={key}
        onChange={(e) => {
          setKey(e.target.value);
          setResult(null);
        }}
        onBlur={() => key.trim() && save(key.trim())}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={test} disabled={busy || !key.trim()}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {busy ? "正在测试…" : "保存并测试连接"}
        </Button>
        {result ? (
          <span
            className={`flex items-center gap-1 text-xs ${
              result.ok ? "text-green-600 dark:text-green-400" : "text-destructive"
            }`}
          >
            {result.ok ? <CheckCircle2Icon className="size-3.5" /> : <XCircleIcon className="size-3.5" />}
            {result.ok ? "连接成功" : result.message}
          </span>
        ) : null}
      </div>
    </>
  );
}

const HOTKEY_IDS = ["toggle_window", "hide_all", "toggle_dashboard", "focus_input"];
const HOTKEY_LABEL: Record<string, string> = {
  toggle_window: "显示 / 隐藏主条",
  hide_all: "一键隐藏全部窗口",
  toggle_dashboard: "打开 / 关闭控制台",
  focus_input: "把光标放回输入框",
};

function HotkeysBody({ os }: { os: OnboardingOs }) {
  const rows = DEFAULT_SHORTCUT_ACTIONS.filter((a) => HOTKEY_IDS.includes(a.id));
  return (
    <>
      <p>这些是默认快捷键，可在「快捷键」页面修改。</p>
      <div className="divide-y rounded-lg border">
        {rows.map((a) => (
          <div key={a.id} className="flex items-center justify-between px-3 py-2">
            <span className="text-foreground">{HOTKEY_LABEL[a.id] ?? a.name}</span>
            <kbd className="shrink-0 whitespace-nowrap rounded-md border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
              {formatHotkey(a.defaultKey[os], os)}
            </kbd>
          </div>
        ))}
      </div>
    </>
  );
}

interface PrivacyStatus {
  os_version: string;
  method: string;
  windows: { label: string; method: string }[];
  notes?: string[];
}

function SelfCheckBody() {
  const [s, setS] = useState<PrivacyStatus | null>(null);
  useEffect(() => {
    invoke<PrivacyStatus>("privacy_status").then(setS).catch(() => {});
  }, []);
  if (!s) return <p>正在检测…</p>;
  const ok = s.method === "exclude" || s.method === "sharing_none";
  return (
    <>
      <StatusLine state={ok ? "granted" : "unknown"} unknownText="本系统没有系统级防录屏，请按下方说明操作" />
      <ul className="list-disc space-y-1 pl-5 text-xs">
        {(s.notes ?? []).map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <p className="text-xs">完整自检随时可在「设置 → 隐私自检」查看。</p>
    </>
  );
}
