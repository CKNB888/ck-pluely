import { describe, it, expect, vi } from "vitest";
import {
  cleanTranscript,
  toSimplified,
  fixChinesePunctuation,
  wavStats,
  isSilentClip,
} from "@/lib/functions/stt-post";
import { splitApiKeys, maskKey, withKeyRotation, retryAfterMs } from "@/lib/functions/net";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

function wav(samples: Int16Array, rate = 16000): ArrayBuffer {
  const b = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(b);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, s, true));
  return b;
}

describe("STT post-processing (from live Groq results)", () => {
  it.each([
    "Thank you.", " you", " .", " Obrigado.", "谢谢观看", "请不吝点赞 订阅 转发 打赏支持明镜与点点栏目",
    "字幕由Amara.org社区提供", "Thanks for watching!",
  ])("drops hallucination %s", (s) => expect(cleanTranscript(s)).toBe(""));

  it("converts Traditional to Simplified", () => {
    expect(cleanTranscript("為什麼選擇我們公司你覺得你最大的優勢是什麼")).toBe(
      "为什么选择我们公司你觉得你最大的优势是什么"
    );
    expect(toSimplified("乾淨 頭髮 後面")).toBe("干净 头发 后面");
    expect(toSimplified("已经是简体")).toBe("已经是简体");
  });

  it("uses full-width punctuation in Chinese, keeps English", () => {
    expect(fixChinesePunctuation("你用过Kubernetes吗?能讲一下 React 和 Vue 的区别吗?")).toBe(
      "你用过Kubernetes吗？能讲一下 React 和 Vue 的区别吗？"
    );
    expect(cleanTranscript("Can you walk me through it?")).toBe("Can you walk me through it?");
    expect(fixChinesePunctuation("版本 1,000 个")).toBe("版本 1,000 个");
  });

  it("keeps real speech and removes a trailing credit", () => {
    expect(cleanTranscript("好")).toBe("好");
    expect(cleanTranscript("这道题怎么做？字幕由Amara.org社区提供")).toBe("这道题怎么做？");
  });

  it("detects silent / too-short WAV clips", () => {
    expect(isSilentClip(wavStats(wav(new Int16Array(16000 * 3))))).toBe(true);
    expect(isSilentClip(wavStats(wav(new Int16Array(3200).fill(8000))))).toBe(true); // 0.2 s
    expect(isSilentClip(wavStats(wav(new Int16Array(16000).fill(8000))))).toBe(false);
    expect(wavStats(new ArrayBuffer(10))).toBeNull();
  });
});

describe("multiple API keys", () => {
  it("splits and masks", () => {
    expect(splitApiKeys(" a1, b2\nc3;a1 ")).toEqual(["a1", "b2", "c3"]);
    expect(maskKey("gsk_abcdefgh1234")).toBe("gsk_****1234");
  });
  it("rotates on 429/401 and remembers the working key", async () => {
    const seen: string[] = [];
    const run = async (k: string) => {
      seen.push(k);
      return new Response("", { status: k === "k1" ? 429 : k === "k2" ? 401 : 200 });
    };
    const r = await withKeyRotation("t", "k1,k2,k3", run);
    expect(r.status).toBe(200);
    expect(seen).toEqual(["k1", "k2", "k3"]);
    seen.length = 0;
    await withKeyRotation("t", "k1,k2,k3", run);
    expect(seen).toEqual(["k3"]);
  });
  it("returns the last error when every key fails", async () => {
    const r = await withKeyRotation("u", "x,y", async () => new Response("", { status: 429 }));
    expect(r.status).toBe(429);
  });
  it("reads Retry-After", () => {
    expect(retryAfterMs(new Response("", { headers: { "retry-after": "2" } }), 500)).toBe(2000);
    expect(retryAfterMs(new Response("", { headers: { "retry-after": "999" } }), 500)).toBe(8000);
    expect(retryAfterMs(new Response(""), 500)).toBe(500);
  });
});
