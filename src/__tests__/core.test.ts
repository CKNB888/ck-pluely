import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("@/i18n", () => ({ t: (k: string) => k }));
import { getStreamingContent, splitSseData } from "@/lib/functions/common.function";
import { extractProviderError, friendlyHttpError } from "@/lib/functions/net";
import { isLikelyQuestion } from "@/lib/copilot";
import { AI_PROVIDERS } from "@/config/ai-providers.constants";

describe("SSE", () => {
  it("splits data lines, skips [DONE], keeps remainder, handles CRLF", () => {
    const r = splitSseData('data: {"a":1}\r\n\r\ndata: [DONE]\ndata: {"b"');
    expect(r.payloads).toEqual(['{"a":1}']);
    expect(r.rest).toBe('data: {"b"');
    expect(splitSseData('data: {"c":2}', true).payloads).toEqual(['{"c":2}']);
  });
  it("reads OpenAI/Claude/Gemini deltas, ignores reasoning-only chunks", () => {
    const p = "choices[0].message.content";
    expect(getStreamingContent({ choices: [{ delta: { content: "你好" } }] }, p)).toBe("你好");
    expect(getStreamingContent({ choices: [{ delta: { reasoning_content: "x", content: "" } }] }, p)).toBeNull();
    expect(getStreamingContent({ delta: { text: "hi" } }, "content[0].text")).toBe("hi");
    expect(getStreamingContent({ candidates: [{ content: { parts: [{ text: "g" }] } }] }, "")).toBe("g");
  });
});

describe("provider errors", () => {
  it("extracts messages from real error shapes", () => {
    expect(extractProviderError('{"error":{"message":"Invalid API Key"}}')).toBe("Invalid API Key");
    expect(extractProviderError('{"detail":"Invalid API Key"}')).toBe("Invalid API Key");
    expect(extractProviderError('{"code":30014,"message":"Token is invalid."}')).toBe("Token is invalid.");
    expect(extractProviderError('[{"error":{"code":400,"message":"model is not specified"}}]')).toBe("model is not specified");
    expect(extractProviderError('{"code":"400","error":"Bad data"}')).toBe("Bad data");
    expect(extractProviderError("plain")).toBe("plain");
  });
  it("maps status codes", () => {
    for (const s of [400, 401, 403, 404, 429, 500, 503]) expect(friendlyHttpError(s)).toBeTruthy();
    expect(friendlyHttpError(200)).toBeNull();
  });
});

describe("question detection", () => {
  it.each(["你能介绍一下你自己吗", "为什么选择我们公司？", "What is a closure", "Can you explain React hooks", "你做过几个项目"])(
    "question: %s", (q) => expect(isLikelyQuestion(q)).toBe(true));
  it.each(["我几乎每天都写代码。", "好的，谢谢。", "I think so."])(
    "not a question: %s", (q) => expect(isLikelyQuestion(q)).toBe(false));
});

describe("provider configs", () => {
  it("every built-in provider has an http(s) URL and content path", () => {
    for (const p of AI_PROVIDERS as any[]) {
      expect(p.curl).toMatch(/https?:\/\//);
      expect(p.responseContentPath).toBeTruthy();
    }
  });
});
