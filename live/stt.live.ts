import "./mocks";
import { describe, it } from "vitest";
import fs from "fs";
import path from "path";
import { fetchSTT } from "@/lib/functions/stt.function";
import { SPEECH_TO_TEXT_PROVIDERS } from "@/config";
import { loadKeys } from "./keys";

const dir = process.env.AUDIO_DIR || "/tmp/stt/v";
const out = process.env.OUT || "/tmp/stt/results.json";
const models = (process.env.MODELS || "whisper-large-v3-turbo,whisper-large-v3").split(",");
const mime: Record<string, string> = { ".wav": "audio/wav", ".webm": "audio/webm", ".m4a": "audio/mp4" };

describe("live STT via app code path", () => {
  it("transcribes the matrix", async () => {
    const keys = loadKeys();
    if (!keys.length) return;
    const provider = (SPEECH_TO_TEXT_PROVIDERS as any[]).find((p) => p.id === "groq");
    const files = fs.readdirSync(dir).filter((f) => mime[path.extname(f)]).sort();
    const rows: any[] = [];
    let k = 0;
    for (const model of models) {
      for (const f of files) {
        const buf = fs.readFileSync(path.join(dir, f));
        const audio = new Blob([buf], { type: mime[path.extname(f)] });
        const t0 = performance.now();
        let text = "", error = "";
        try {
          text = await fetchSTT({
            provider,
            selectedProvider: { provider: "groq", variables: { api_key: keys[k++ % keys.length], model } },
            audio,
          });
        } catch (e: any) {
          error = String(e?.message || e).replace(/gsk_[A-Za-z0-9]+/g, "gsk_****");
        }
        rows.push({ model, file: f, ms: Math.round(performance.now() - t0), text, error });
      }
    }
    fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  });
});
