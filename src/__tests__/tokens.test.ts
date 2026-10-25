import { describe, it, expect } from "vitest";
import { shapeBody, readUsage, compactHistory, estimateTokens, mergeUsage } from "@/lib/tokens";

describe("shapeBody", () => {
  it("groq gpt-oss: caps max_completion_tokens, low reasoning, usage", () => {
    const b = shapeBody({ model: "openai/gpt-oss-120b", messages: [], max_completion_tokens: 8192, stream: true },
      "https://api.groq.com/openai/v1/chat/completions", 900, true);
    expect(b.max_completion_tokens).toBe(900);
    expect(b.reasoning_effort).toBe("low");
    expect(b.stream_options).toEqual({ include_usage: true });
  });
  it("keeps a lower template cap and explicit reasoning", () => {
    const b = shapeBody({ model: "gpt-oss-20b", messages: [], max_tokens: 300, reasoning_effort: "high" },
      "https://api.groq.com/x", 900, true);
    expect(b.max_tokens).toBe(300);
    expect(b.reasoning_effort).toBe("high");
  });
  it("unknown host: no stream_options", () => {
    const b = shapeBody({ model: "m", messages: [] }, "https://my.proxy/v1", 700, true);
    expect(b.stream_options).toBeUndefined();
    expect(b.max_tokens).toBe(700);
  });
  it("anthropic and gemini", () => {
    expect(shapeBody({ model: "c", messages: [], max_tokens: 1024 }, "https://api.anthropic.com/v1/messages", 700, true).max_tokens).toBe(700);
    expect(shapeBody({ contents: [] }, "https://generativelanguage.googleapis.com/x", 700, true).generationConfig.maxOutputTokens).toBe(700);
  });
});

describe("readUsage", () => {
  it("openai/groq with cache", () => {
    expect(readUsage({ usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 64 } } }))
      .toEqual({ input: 100, output: 20, cached: 64 });
  });
  it("deepseek, anthropic, gemini", () => {
    expect(readUsage({ usage: { prompt_tokens: 10, completion_tokens: 2, prompt_cache_hit_tokens: 8 } })?.cached).toBe(8);
    expect(readUsage({ type: "message_start", message: { usage: { input_tokens: 5, cache_read_input_tokens: 50, output_tokens: 1 } } }))
      .toEqual({ input: 55, output: 1, cached: 50 });
    expect(readUsage({ usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3 } })).toEqual({ input: 9, output: 3, cached: 0 });
    expect(readUsage({ choices: [] })).toBeNull();
  });
  it("merge keeps earlier input", () => {
    expect(mergeUsage({ input: 55, output: 1, cached: 50 }, { output: 40 })).toEqual({ input: 55, output: 40, cached: 50 });
  });
});

describe("compactHistory", () => {
  it("keeps recent verbatim and older conclusion lines", () => {
    const h = Array.from({ length: 16 }, (_, i) => ({
      role: (i % 2 ? "assistant" : "user") as "assistant" | "user",
      content: `**结论 ${i}**\n细节 ${"x".repeat(50)}`,
    }));
    const out = compactHistory(h);
    expect(out).toHaveLength(12);
    expect(out[0].content).toBe("**结论 4**");
    expect(out[11]).toBe(h[15]);
  });
  it("estimates", () => {
    expect(estimateTokens("你好abcd")).toBe(3);
  });
});
