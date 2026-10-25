import { describe, it, expect } from "vitest";
import {
  buildSteps,
  stepState,
  shouldAutoAdvance,
  canContinue,
  settingsUrl,
  formatHotkey,
  nextIndex,
  prevIndex,
  PermissionSnapshot,
} from "@/lib/onboarding";

const snap = (p: Partial<PermissionSnapshot> = {}): PermissionSnapshot => ({
  microphone: "denied",
  screen: "denied",
  accessibility: "denied",
  hasOutputDevice: true,
  hasInputDevice: true,
  ...p,
});

describe("onboarding steps", () => {
  it("one step per permission, per OS", () => {
    expect(buildSteps("macos")).toEqual([
      "welcome", "privacy", "mic", "screen", "accessibility", "apikey", "hotkeys", "selfcheck", "done",
    ]);
    expect(buildSteps("windows")).toContain("audio");
    expect(buildSteps("windows")).not.toContain("screen");
    expect(buildSteps("linux")).toEqual([
      "welcome", "privacy", "audio", "apikey", "hotkeys", "selfcheck", "done",
    ]);
  });

  it("maps snapshot to step state", () => {
    expect(stepState("mic", snap({ microphone: "granted" }))).toBe("granted");
    expect(stepState("screen", snap())).toBe("denied");
    expect(stepState("audio", snap({ hasOutputDevice: false }))).toBe("denied");
    expect(stepState("welcome", snap())).toBe("granted");
  });

  it("auto-advances only on the transition to granted", () => {
    expect(shouldAutoAdvance("denied", "granted")).toBe(true);
    expect(shouldAutoAdvance("unknown", "granted")).toBe(true);
    expect(shouldAutoAdvance("granted", "granted")).toBe(false);
    expect(shouldAutoAdvance(null, "granted")).toBe(false); // already granted on arrival: user clicks next
    expect(shouldAutoAdvance("denied", "denied")).toBe(false);
  });

  it("blocks only required, denied permissions", () => {
    expect(canContinue("mic", "denied")).toBe(false);
    expect(canContinue("mic", "unknown")).toBe(true);
    expect(canContinue("accessibility", "denied")).toBe(true);
    expect(canContinue("audio", "denied")).toBe(true);
    expect(canContinue("apikey", "denied")).toBe(true);
  });

  it("clamps navigation", () => {
    expect(nextIndex(["welcome", "done"], 1)).toBe(1);
    expect(prevIndex(0)).toBe(0);
  });

  it("builds settings deep links", () => {
    expect(settingsUrl("macos", "screen")).toBe(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    );
    expect(settingsUrl("windows", "mic")).toBe("ms-settings:privacy-microphone");
    expect(settingsUrl("linux", "audio")).toBeNull();
  });

  it("formats hotkeys", () => {
    expect(formatHotkey("cmd+alt+shift+d", "macos")).toBe("⌘ ⌥ ⇧ D");
    expect(formatHotkey("ctrl+alt+backslash", "windows")).toBe("Ctrl + Alt + \\");
  });
});
