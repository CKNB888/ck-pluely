// @vitest-environment jsdom
// ck-pluely v2.1.1: every control in the menu-bar panel does what it says.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";

const calls: { cmd: string; args?: any }[] = [];
const emitted: { ev: string; payload: any }[] = [];
const listeners: Record<string, ((e: any) => void)[]> = {};
const keychain: Record<string, string> = {};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    calls.push({ cmd, args });
    switch (cmd) {
      case "get_capture_status":
        return false;
      case "privacy_status":
        return { os: "macos", os_version: "macOS 15", method: "sharing_none", windows: [{ label: "panel", visible: true, method: "sharing_none" }, { label: "main", visible: false, method: "sharing_none" }] };
      case "ck_meeting_status":
        return { app: null, mode: "system" };
      case "ck_secret_get":
        return keychain[args.account] ?? null;
      case "ck_secret_set":
        keychain[args.account] = args.value;
        return null;
      case "ck_secret_delete":
        delete keychain[args.account];
        return null;
      default:
        return null;
    }
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async (ev: string, payload: any) => {
    emitted.push({ ev, payload });
    (listeners[ev] ?? []).forEach((f) => f({ payload }));
  }),
  listen: vi.fn(async (ev: string, f: any) => {
    (listeners[ev] ||= []).push(f);
    return () => {};
  }),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: (globalThis as any).__winLabel ?? "panel", onFocusChanged: async () => () => {}, listen: async () => () => {} }),
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({ enable: vi.fn(async () => {}), disable: vi.fn(async () => {}), isEnabled: vi.fn(async () => true) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async (u: string) => calls.push({ cmd: "openUrl", args: u })), revealItemInDir: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn(async () => new Response("{}")) }));
vi.mock("@/lib/database", () => ({
  getAllConversations: vi.fn(async () => [
    { id: "c1", title: "第一节课", updatedAt: Date.now(), messages: [{ role: "assistant", content: "答案" }] },
  ]),
}));

import { AppProvider, ThemeProvider, useApp } from "@/contexts";
import PanelPage from "@/pages/panel";
import { STORAGE_KEYS } from "@/config";

const actions = () => calls.filter((c) => c.cmd === "ck_panel_action").map((c) => c.args.action);

async function mount() {
  render(
    <ThemeProvider>
      <AppProvider>
        <PanelPage />
      </AppProvider>
    </ThemeProvider>
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

beforeEach(() => {
  cleanup();
  calls.length = 0;
  emitted.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  localStorage.clear();
  localStorage.setItem("ck_onboarding_done", "1");
  // Groq set up before, now on OpenAI: switching back must restore model + key.
  localStorage.setItem("ck_provider_memory", JSON.stringify({ ai: { groq: { variables: { model: "llama-3.3-70b-versatile", api_key: "" }, models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"], at: 1 } }, stt: {} }));
  keychain["ai:groq:api_key"] = "test-key-not-real";
  localStorage.setItem(STORAGE_KEYS.SELECTED_AI_PROVIDER, JSON.stringify({ provider: "openai", variables: { model: "gpt-4o-mini", api_key: "x" } }));
  (window as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});

describe("menu-bar panel controls", () => {
  it("header buttons: hide all, theme, bar mode, GitHub", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("一键隐藏全部窗口"));
    expect(actions()).toContain("hide_all");
    const themeBtn = screen.getByLabelText(/切换为/);
    const before = document.documentElement.classList.contains("dark");
    fireEvent.click(themeBtn);
    expect(document.documentElement.classList.contains("dark")).toBe(!before);
    expect(emitted.some((e) => e.ev === "ck-theme-changed")).toBe(true);
    fireEvent.click(screen.getByLabelText("改用悬浮条"));
    await waitFor(() => expect(actions()).toContain("show_bar"));
    fireEvent.click(screen.getByLabelText("GitHub"));
    expect(calls.some((c) => c.cmd === "openUrl")).toBe(true);
  });

  it("home: transcription toggle and the three ask tiles", async () => {
    await mount();
    fireEvent.click(screen.getByText("开始"));
    fireEvent.click(screen.getByText("语音提问"));
    fireEvent.click(screen.getByText("截图提问"));
    fireEvent.click(screen.getByText("文字提问"));
    expect(actions()).toEqual(expect.arrayContaining(["system_audio", "audio_recording", "screenshot", "show_bar"]));
  });

  it("model switching: provider + model change, persist, and are broadcast", async () => {
    await mount();
    fireEvent.click(screen.getByTestId("picker-ai-toggle"));
    fireEvent.click(screen.getByTestId("picker-ai-provider-groq"));
    await waitFor(() => expect(screen.getByTestId("picker-ai-value").textContent).toContain("llama-3.3-70b-versatile"));
    fireEvent.click(screen.getByTestId("picker-ai-model-openai/gpt-oss-120b"));
    await waitFor(() => expect(screen.getByTestId("picker-ai-value").textContent).toContain("gpt-oss-120b"));
    fireEvent.change(screen.getByTestId("picker-ai-model-input"), { target: { value: "qwen/qwen3-32b" } });
    fireEvent.submit(screen.getByTestId("picker-ai-model-input").closest("form")!);
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_AI_PROVIDER)!);
      expect(saved.provider).toBe("groq");
      expect(saved.variables.model).toBe("qwen/qwen3-32b");
    });
    // the key came back from the keychain, and is not written to localStorage
    expect(keychain["ai:groq:api_key"]).toBe("test-key-not-real");
    expect(localStorage.getItem(STORAGE_KEYS.SELECTED_AI_PROVIDER)).not.toContain("test-key-not-real");
    await waitFor(() => expect(emitted.some((e) => e.ev === "ck-settings-changed")).toBe(true), { timeout: 2000 });
  });

  it("tabs, history opens the conversation, settings and quit", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "记录" }));
    fireEvent.click(await screen.findByText("第一节课"));
    expect(localStorage.getItem("ck_pending_nav")).toBe("/chats/view/c1");
    expect(actions()).toContain("dashboard");
    fireEvent.click(screen.getByRole("tab", { name: "状态" }));
    expect(await screen.findByText(/个窗口受保护/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "提问" }));
    fireEvent.click(screen.getByText("设置"));
    expect(localStorage.getItem("ck_pending_nav")).toBe("/settings");
    fireEvent.click(screen.getByText("退出"));
    expect(actions()).toContain("quit");
  });
});

describe("other windows follow a panel switch", () => {
  it("main window reloads the provider/model used for its next request", async () => {
    (globalThis as any).__winLabel = "main";
    const Probe = () => {
      const { selectedAIProvider } = useApp();
      return <span data-testid="probe">{`${selectedAIProvider.provider}|${selectedAIProvider.variables?.model ?? ""}`}</span>;
    };
    render(<ThemeProvider><AppProvider><Probe /></AppProvider></ThemeProvider>);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("openai|gpt-4o-mini"));
    localStorage.setItem(STORAGE_KEYS.SELECTED_AI_PROVIDER, JSON.stringify({ provider: "groq", variables: { model: "qwen/qwen3-32b", api_key: "" }, __ckKeychain: true }));
    await act(async () => {
      (listeners["ck-settings-changed"] ?? []).forEach((f) => f({ payload: { from: "panel" } }));
      await new Promise((r) => setTimeout(r, 600));
    });
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("groq|qwen/qwen3-32b"));
    (globalThis as any).__winLabel = undefined;
  });
});
