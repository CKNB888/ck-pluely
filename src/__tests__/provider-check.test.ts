import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
import { modelsUrlFor, parseModelIds } from "@/lib/functions/provider-check";

describe("modelsUrlFor", () => {
  const cases: [string, string | null][] = [
    ["https://api.groq.com/openai/v1/chat/completions", "https://api.groq.com/openai/v1/models"],
    ["https://api.deepseek.com/chat/completions", "https://api.deepseek.com/models"],
    ["https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "https://dashscope.aliyuncs.com/compatible-mode/v1/models"],
    ["https://open.bigmodel.cn/api/paas/v4/chat/completions", "https://open.bigmodel.cn/api/paas/v4/models"],
    ["https://ark.cn-beijing.volces.com/api/v3/chat/completions", "https://ark.cn-beijing.volces.com/api/v3/models"],
    ["https://api.anthropic.com/v1/messages", "https://api.anthropic.com/v1/models"],
    ["https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "https://generativelanguage.googleapis.com/v1beta/openai/models"],
    ["http://localhost:11434/v1/chat/completions", "http://localhost:11434/v1/models"],
    ["https://api.siliconflow.cn/v1/audio/transcriptions", "https://api.siliconflow.cn/v1/models"],
    ["https://speech.googleapis.com/v1/speech:recognize", null],
  ];
  it.each(cases)("%s", (i, o) => expect(modelsUrlFor(i)).toBe(o));
});

describe("parseModelIds", () => {
  it("openai shape", () => expect(parseModelIds({ data: [{ id: "b" }, { id: "a" }, { id: "a" }] })).toEqual(["a", "b"]));
  it("gemini shape", () => expect(parseModelIds({ models: [{ name: "models/gemini-2.5-flash" }] })).toEqual(["gemini-2.5-flash"]));
  it("garbage", () => expect(parseModelIds({ x: 1 })).toEqual([]));
});
