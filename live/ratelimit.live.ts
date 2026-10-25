import "./mocks";
import { it } from "vitest";
import fs from "fs";
import { fetchSTT } from "@/lib/functions/stt.function";
import { SPEECH_TO_TEXT_PROVIDERS } from "@/config";
import { loadKeys } from "./keys";

// Burst whisper-large-v3 until Groq returns 429; compare one key vs rotation.
it("429 burst", async () => {
  const keys = loadKeys();
  if (!keys.length) return;
  const provider = (SPEECH_TO_TEXT_PROVIDERS as any[]).find((p) => p.id === "groq");
  const buf = fs.readFileSync("/tmp/stt/v/short_16k.wav");
  const N = Number(process.env.N || 30);
  const res: any = {};
  for (const [name, key] of [["single", keys[0]], ["rotate", keys.join(",")]] as const) {
    const t0 = performance.now();
    const r = await Promise.all(Array.from({ length: N }, () =>
      fetchSTT({ provider, selectedProvider: { provider: "groq", variables: { api_key: key, model: "whisper-large-v3" } }, audio: new Blob([buf], { type: "audio/wav" }) })
        .then(() => "ok", (e) => String(e?.message || e).replace(/gsk_[A-Za-z0-9]+/g, "gsk_****").slice(0, 90))));
    const c: Record<string, number> = {};
    r.forEach((x) => (c[x] = (c[x] || 0) + 1));
    res[name] = { ms: Math.round(performance.now() - t0), c };
  }
  fs.writeFileSync("/tmp/stt/rl.json", JSON.stringify(res, null, 1));
}, 300000);
