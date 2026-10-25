// ck-pluely v2.1：请求瘦身 + 用量统计。
// - 每种回答长度一个 max tokens 上限，按服务商协议写到对应字段
// - Groq / OpenAI 的推理模型（gpt-oss、o 系列）用低推理强度，省 token 也更快出首字
// - 流式请求带 stream_options.include_usage，拿到真实用量（含缓存命中）
// - 历史窗口：最近几轮原文，更早的只保留结论行；系统提示放最前面且不变，便于服务商前缀缓存
import type { Message } from "@/types";

export type LengthMode = "short" | "medium" | "auto" | "copilot";
export const MAX_TOKENS: Record<LengthMode, number> = {
  copilot: 900,
  short: 700,
  medium: 1400,
  auto: 3000,
};

const USAGE_HOSTS = [
  "api.groq.com",
  "api.openai.com",
  "api.deepseek.com",
  "openrouter.ai",
  "dashscope.aliyuncs.com",
  "api.siliconflow.cn",
  "api.moonshot.cn",
  "open.bigmodel.cn",
  "ark.cn-beijing.volces.com",
  "api.mistral.ai",
  "api.x.ai",
];

function host(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Mutates and returns `body`. Only fills fields the template did not set lower. */
export function shapeBody(body: any, url: string, maxTokens: number, streaming: boolean): any {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const h = host(url);
  const model = String(body.model ?? "");
  const cap = (k: string, obj: any = body) => {
    const cur = Number(obj[k]);
    obj[k] = Number.isFinite(cur) && cur > 0 ? Math.min(cur, maxTokens) : maxTokens;
  };
  if (Array.isArray(body.contents)) {
    // Gemini
    body.generationConfig = body.generationConfig || {};
    cap("maxOutputTokens", body.generationConfig);
    return body;
  }
  if (/anthropic\.com$/.test(h) || ("anthropic_version" in body)) {
    cap("max_tokens");
    return body;
  }
  if (!Array.isArray(body.messages)) return body;
  // OpenAI-compatible
  if ("max_completion_tokens" in body || h === "api.openai.com") {
    cap("max_completion_tokens");
    delete body.max_tokens;
  } else {
    cap("max_tokens");
  }
  const reasoning = /gpt-oss|^o\d|\/o\d|gpt-5/i.test(model);
  if (reasoning && (h === "api.groq.com" || h === "api.openai.com") && body.reasoning_effort == null) {
    body.reasoning_effort = "low";
  }
  if (streaming && USAGE_HOSTS.includes(h) && body.stream_options == null) {
    body.stream_options = { include_usage: true };
  }
  return body;
}

export interface Usage {
  input: number;
  output: number;
  cached: number;
}

/** Usage from one parsed stream event or a non-stream response (any provider). */
export function readUsage(ev: any): Partial<Usage> | null {
  if (!ev || typeof ev !== "object") return null;
  const u = ev.usage ?? ev.x_groq?.usage ?? ev.message?.usage ?? null;
  if (u) {
    const out: Partial<Usage> = {};
    const input = u.prompt_tokens ?? u.input_tokens;
    const output = u.completion_tokens ?? u.output_tokens;
    const cached =
      u.prompt_tokens_details?.cached_tokens ??
      u.prompt_cache_hit_tokens ??
      u.cache_read_input_tokens ??
      u.input_tokens_details?.cached_tokens;
    // Anthropic's input_tokens excludes cache reads; OpenAI-style prompt_tokens includes them.
    if (input != null) out.input = Number(input) + (u.prompt_tokens == null ? Number(u.cache_read_input_tokens ?? 0) : 0);
    if (output != null) out.output = Number(output);
    if (cached != null) out.cached = Number(cached);
    return Object.keys(out).length ? out : null;
  }
  const g = ev.usageMetadata;
  if (g) {
    return {
      input: g.promptTokenCount,
      output: (g.candidatesTokenCount ?? 0) + (g.thoughtsTokenCount ?? 0),
      cached: g.cachedContentTokenCount ?? 0,
    };
  }
  return null;
}

export function mergeUsage(a: Usage, b: Partial<Usage> | null): Usage {
  if (!b) return a;
  return {
    input: b.input ?? a.input,
    output: b.output ?? a.output,
    cached: b.cached ?? a.cached,
  };
}

/** Rough count when the provider sends no usage (CJK ≈ 1 token/char, else ≈ 4 chars). */
export function estimateTokens(s: string): number {
  const cjk = (s.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length;
  return Math.ceil(cjk + (s.length - cjk) / 4);
}

const textOf = (c: Message["content"]) =>
  typeof c === "string" ? c : (c || []).map((p) => p.text ?? "").join("\n");

/** First non-empty line, i.e. the conclusion line our prompts ask for. */
function headline(s: string, max = 160) {
  const line = s.split("\n").map((l) => l.trim()).find((l) => l && !/^#+\s*$/.test(l)) || "";
  return line.length > max ? line.slice(0, max) + "…" : line;
}

/**
 * Chronological history → what we actually send.
 * Last `keep` messages verbatim (each capped), older ones within `max`
 * reduced to their conclusion line; images in old turns are dropped.
 */
export function compactHistory(
  history: Message[],
  { keep = 6, max = 12, perMsgChars = 2400 }: { keep?: number; max?: number; perMsgChars?: number } = {}
): Message[] {
  const h = history.slice(-max);
  const cut = Math.max(0, h.length - keep);
  return h.map((m, i) => {
    const text = textOf(m.content);
    if (i < cut) {
      return { role: m.role, content: m.role === "assistant" ? headline(text) : headline(text, 240) };
    }
    if (typeof m.content === "string" && text.length > perMsgChars) {
      return { role: m.role, content: text.slice(0, perMsgChars) + "…" };
    }
    return m;
  });
}

// --- per-session counter (UI) ---------------------------------------------
type Listener = (u: SessionUsage) => void;
export interface SessionUsage extends Usage {
  requests: number;
  estimated: boolean;
  last?: Usage & { ttftMs?: number };
}
let session: SessionUsage = { input: 0, output: 0, cached: 0, requests: 0, estimated: false };
const listeners = new Set<Listener>();

export function recordUsage(u: Usage, opts: { estimated?: boolean; ttftMs?: number } = {}) {
  session = {
    input: session.input + u.input,
    output: session.output + u.output,
    cached: session.cached + u.cached,
    requests: session.requests + 1,
    estimated: session.estimated || !!opts.estimated,
    last: { ...u, ttftMs: opts.ttftMs },
  };
  listeners.forEach((l) => l(session));
}
export function getSessionUsage() {
  return session;
}
export function resetSessionUsage() {
  session = { input: 0, output: 0, cached: 0, requests: 0, estimated: false };
  listeners.forEach((l) => l(session));
}
export function onSessionUsage(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
