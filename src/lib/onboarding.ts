// 首次启动引导：纯逻辑（步骤、权限状态、自动前进、系统设置链接、快捷键显示），有单元测试。

export const ONBOARDING_DONE_KEY = "ck_onboarding_done_v1";
export const ONBOARDING_STEP_KEY = "ck_onboarding_step_v1";

export type OnboardingOs = "macos" | "windows" | "linux";
export type PermState = "granted" | "denied" | "unknown";

export type StepId =
  | "welcome"
  | "privacy"
  | "mic"
  | "screen"
  | "accessibility"
  | "audio"
  | "apikey"
  | "hotkeys"
  | "selfcheck"
  | "done";

export interface PermissionSnapshot {
  microphone: PermState;
  screen: PermState;
  accessibility: PermState;
  hasOutputDevice: boolean;
  hasInputDevice: boolean;
}

/** 按系统生成步骤：每个权限单独一步 */
export function buildSteps(os: OnboardingOs): StepId[] {
  const perms: StepId[] =
    os === "macos"
      ? ["mic", "screen", "accessibility"]
      : os === "windows"
      ? ["mic", "audio"]
      : ["audio"];
  return ["welcome", "privacy", ...perms, "apikey", "hotkeys", "selfcheck", "done"];
}

export const isPermissionStep = (s: StepId) =>
  s === "mic" || s === "screen" || s === "accessibility" || s === "audio";

/** 可以不授权直接下一步的步骤：辅助功能只在部分功能需要；没有播放设备只影响「系统声音」 */
export const isOptionalStep = (s: StepId) => s === "accessibility" || s === "audio";

/** 某个权限步骤当前状态 */
export function stepState(step: StepId, snap: PermissionSnapshot): PermState {
  switch (step) {
    case "mic":
      // Windows 读不到注册表时（unknown），有输入设备就当作可用，避免卡住
      return snap.microphone;
    case "screen":
      return snap.screen;
    case "accessibility":
      return snap.accessibility;
    case "audio":
      return snap.hasOutputDevice ? "granted" : "denied";
    default:
      return "granted";
  }
}

/** 轮询时：从「未授权」变成「已授权」的那一刻自动前进 */
export function shouldAutoAdvance(prev: PermState | null, next: PermState): boolean {
  return prev !== null && prev !== "granted" && next === "granted";
}

/** 是否允许点击「下一步」 */
export function canContinue(step: StepId, state: PermState): boolean {
  if (!isPermissionStep(step)) return true;
  if (isOptionalStep(step)) return true;
  // unknown（读不到状态）不阻塞，但界面会提示去系统设置确认
  return state !== "denied";
}

export function nextIndex(steps: StepId[], i: number): number {
  return Math.min(i + 1, steps.length - 1);
}
export function prevIndex(i: number): number {
  return Math.max(i - 1, 0);
}

/** 打开对应的系统设置页面 */
export function settingsUrl(os: OnboardingOs, step: StepId): string | null {
  if (os === "macos") {
    const anchor = {
      mic: "Privacy_Microphone",
      screen: "Privacy_ScreenCapture",
      accessibility: "Privacy_Accessibility",
    }[step as "mic" | "screen" | "accessibility"];
    // macOS 13+ 的「系统设置」仍接受这一旧格式并跳到对应隐私面板
    return anchor ? `x-apple.systempreferences:com.apple.preference.security?${anchor}` : null;
  }
  if (os === "windows") {
    if (step === "mic") return "ms-settings:privacy-microphone";
    if (step === "audio") return "ms-settings:sound";
  }
  return null;
}

/** "cmd+alt+shift+d" → mac: "⌘ ⌥ ⇧ D"；其它："Ctrl + Alt + Shift + D" */
export function formatHotkey(key: string, os: OnboardingOs): string {
  const mac: Record<string, string> = {
    cmd: "⌘",
    command: "⌘",
    alt: "⌥",
    option: "⌥",
    shift: "⇧",
    ctrl: "⌃",
    control: "⌃",
  };
  const pc: Record<string, string> = {
    cmd: "Win",
    ctrl: "Ctrl",
    control: "Ctrl",
    alt: "Alt",
    shift: "Shift",
  };
  const named: Record<string, string> = {
    backslash: "\\",
    space: "Space",
    enter: "Enter",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
  };
  const parts = key
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => (os === "macos" ? mac[p] : pc[p]) ?? named[p] ?? p.toUpperCase());
  return parts.join(os === "macos" ? " " : " + ");
}
