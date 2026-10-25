// ck-pluely: speech-to-text pre/post processing shared by every STT provider.
//  - pre:  skip clips that are too short or digitally silent (saves quota and
//          avoids Whisper's silence hallucinations)
//  - post: drop known Whisper hallucinations, convert 繁体 → 简体, and use
//          full-width punctuation inside Chinese text.
import { T2S_FROM, T2S_TO } from "./zh-t2s.data";

let t2s: Map<string, string> | null = null;
function t2sMap() {
  if (!t2s) {
    t2s = new Map();
    for (let i = 0; i < T2S_FROM.length; i++) t2s.set(T2S_FROM[i], T2S_TO[i]);
  }
  return t2s;
}

/** Convert Traditional Chinese characters to Simplified (char by char). */
export function toSimplified(text: string): string {
  const m = t2sMap();
  let changed = false;
  let out = "";
  for (const ch of text) {
    const s = m.get(ch);
    if (s) { out += s; changed = true; } else out += ch;
  }
  return changed ? out : text;
}

const CJK = "\\u3400-\\u9fff";
/** Use full-width ，？！：； next to Chinese characters (Whisper emits ASCII). */
export function fixChinesePunctuation(text: string): string {
  const map: Record<string, string> = { ",": "，", "?": "？", "!": "！", ":": "：", ";": "；" };
  // No lookbehind: older macOS WebKit (Safari < 16.4) cannot parse it.
  return text.replace(
    new RegExp(`([${CJK}])\\s*([,?!:;])(?!\\d)\\s*`, "g"),
    (_m, c: string, p: string) => c + map[p]
  );
}

// Whisper produces these on silence / noise (YouTube-subtitle training data).
// Strong: any sentence containing one is dropped (real speech around it is kept).
const STRONG_HALLUCINATIONS = [
  /字幕(由|提供|志愿者|製作|制作)/,
  /(请|請)不吝(点赞|點贊)/,
  /(订阅|訂閱)(我的|频道|頻道)?.{0,6}(转发|轉發|打赏|打賞)/,
  /明镜与点点|明鏡與點點/,
  /amara\.org/i,
  /thanks? (you )?for watching/i,
  /please subscribe/i,
  /(优优|優優)独播剧场|YoYo Television/i,
];
// Weak: only when they are the entire transcript (never worth answering).
const WEAK_HALLUCINATIONS = new Set(
  [
    "you", "thank you", "thanks", "thank you very much", "bye", "bye bye",
    "obrigado", "gracias", "merci", "danke", "ご視聴ありがとうございました",
    "谢谢", "谢谢观看", "谢谢收看", "感谢观看", "嗯", "啊", "呃", "um", "uh",
    "music", "applause", "音乐",
  ].map((s) => s.toLowerCase())
);

export function isHallucination(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const bare = t.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
  if (!bare) return true; // ".", "...", "♪"
  return WEAK_HALLUCINATIONS.has(bare);
}

/** Clean one transcript; returns "" when it should be treated as silence. */
export function cleanTranscript(text: string): string {
  let t = (text || "").replace(/\s+/g, " ").trim();
  if (isHallucination(t)) return "";
  // Remove a hallucinated trailing sentence (e.g. real speech + "字幕由…").
  t = (t.match(/[^。！？!?]+(?:[。！？!?]+|$)|[。！？!?]+/g) || [t])
    .filter((s) => !STRONG_HALLUCINATIONS.some((r) => r.test(s)))
    .join("")
    .trim();
  if (!t) return "";
  if (/[\u3400-\u9fff]/.test(t)) t = fixChinesePunctuation(toSimplified(t));
  return t;
}

export interface WavStats {
  durationSec: number;
  peakDb: number;
}

/** Duration and peak level of a PCM16 WAV (what the app records). Null if not PCM16 WAV. */
export function wavStats(buf: ArrayBuffer): WavStats | null {
  if (buf.byteLength < 44) return null;
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let off = 12, channels = 1, rate = 0, bits = 0;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === "fmt ") {
      if (v.getUint16(body, true) !== 1) return null; // not PCM
      channels = v.getUint16(body + 2, true);
      rate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === "data") {
      if (bits !== 16 || !rate || !channels) return null;
      const end = Math.min(buf.byteLength, body + size);
      const n = Math.floor((end - body) / 2);
      let peak = 0;
      for (let i = 0; i < n; i++) {
        const s = Math.abs(v.getInt16(body + i * 2, true));
        if (s > peak) peak = s;
      }
      return {
        durationSec: n / channels / rate,
        peakDb: peak === 0 ? -Infinity : 20 * Math.log10(peak / 32768),
      };
    }
    off = body + size + (size % 2);
  }
  return null;
}

export const STT_MIN_DURATION_SEC = 0.3;
export const STT_SILENCE_PEAK_DB = -50;
/** Most hosted Whisper APIs (OpenAI, Groq free tier) reject files over 25 MB. */
export const STT_MAX_BYTES = 25 * 1024 * 1024;

/** True when a clip is too short or silent to be worth sending. */
export function isSilentClip(stats: WavStats | null): boolean {
  if (!stats) return false;
  return stats.durationSec < STT_MIN_DURATION_SEC || stats.peakDb < STT_SILENCE_PEAK_DB;
}
