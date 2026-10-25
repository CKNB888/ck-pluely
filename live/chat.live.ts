import "./mocks";
import "@/lib"; // load the barrel first (circular import order in Node SSR)
import { describe, it } from "vitest";
import fs from "fs";
import { fetchAIResponse } from "@/lib/functions/ai-response.function";
import { fetchSTT } from "@/lib/functions/stt.function";
import { detectQuestion } from "@/lib/question-detect";
import { AI_PROVIDERS, SPEECH_TO_TEXT_PROVIDERS } from "@/config";
import { loadKeys, mask } from "./keys";

const out = process.env.OUT || "/tmp/stt/chat.json";
const scrub = (s: string) => s.replace(/gsk_[A-Za-z0-9]+/g, "gsk_****");

async function run(key: string, model: string, msg: string, abortAfter?: number) {
  const provider = (AI_PROVIDERS as any[]).find((p) => p.id === "groq");
  const ac = new AbortController();
  const t0 = performance.now();
  let ttft = 0, text = "", chunks = 0;
  try {
    for await (const c of fetchAIResponse({
      provider, selectedProvider: { provider: "groq", variables: { api_key: key, model } },
      systemPrompt: "你是面试助手，用简体中文简洁回答。", userMessage: msg, signal: ac.signal,
    })) {
      if (!ttft) ttft = performance.now() - t0;
      text += c; chunks++;
      if (abortAfter && chunks >= abortAfter) ac.abort();
    }
  } catch (e: any) { text += "THROW:" + e?.message; }
  return { model, ttft: Math.round(ttft), total: Math.round(performance.now() - t0), chunks, text: scrub(text).slice(0, 160) };
}

describe("live chat via app code path", () => {
  it("runs", async () => {
    const keys = loadKeys();
    if (!keys.length) return;
    const all = keys.join(",");
    const rows: any[] = [];
    for (const m of ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"])
      rows.push({ case: "stream", ...(await run(all, m, "什么是哈希表？两句话。")) });
    rows.push({ case: "abort@3", ...(await run(all, "openai/gpt-oss-120b", "写一篇500字文章", 3)) });
    rows.push({ case: "bad model", ...(await run(all, "no-such-model", "hi")) });
    rows.push({ case: "bad key", ...(await run("gsk_invalidinvalidinvalid0000", "openai/gpt-oss-20b", "hi")) });
    rows.push({ case: "bad+good keys", ...(await run("gsk_invalidinvalidinvalid0000," + keys[0], "openai/gpt-oss-20b", "1+1=?")) });

    // Copilot loop: audio → STT → question detection → streamed answer.
    const stt = (SPEECH_TO_TEXT_PROVIDERS as any[]).find((p) => p.id === "groq");
    for (const f of ["zh2_16k.wav", "zh1_16k.wav", "mix1_16k.wav", "en1_16k.wav"]) {
      const audio = new Blob([fs.readFileSync("/tmp/stt/v/" + f)], { type: "audio/wav" });
      const t0 = performance.now();
      const tr = await fetchSTT({ provider: stt, selectedProvider: { provider: "groq", variables: { api_key: all, model: "whisper-large-v3-turbo" } }, audio });
      const t1 = performance.now();
      const q = detectQuestion(tr);
      const t2 = performance.now();
      const a = q ? await run(all, "openai/gpt-oss-120b", tr) : null;
      rows.push({ case: "copilot " + f, transcript: tr, question: !!q, sttMs: Math.round(t1 - t0), detectMs: +(t2 - t1).toFixed(2), ttft: a?.ttft, answerTotal: a?.total, e2eFirstToken: a ? Math.round(t1 - t0 + (t2 - t1) + a.ttft) : null, answer: a?.text.slice(0, 80) });
    }
    rows.push({ keys: keys.map(mask) });
    fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  }, 180000);
});
