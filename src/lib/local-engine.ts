// ck-pluely v2: on-device speech recognition and voiceprint (Rust side in
// src-tauri/src/local). Models are optional downloads.
import { invoke } from "@tauri-apps/api/core";
import { safeLocalStorage } from "@/lib/storage";

export type SttMode = "cloud" | "auto" | "local";

export interface LocalSettings {
  stt: SttMode;
  voiceprint: boolean;
  threshold: number;
  language: string;
  idleUnloadSecs: number;
}

export interface LocalPart {
  id: "stt" | "voiceprint";
  installed: boolean;
  sizeMb: number;
  missingMb: number;
}

export interface LocalStatus {
  machine: {
    arch: string;
    cpu: string;
    cores: number;
    memoryGb: number;
    freeDiskGb: number;
    simd: boolean;
    simdName: string;
  };
  advice: {
    localStt: boolean;
    sttReason: string;
    voiceprint: boolean;
    voiceprintReason: string;
    threads: number;
  };
  settings: LocalSettings;
  stt: LocalPart;
  voiceprint: LocalPart;
  enrolled: boolean;
  sttLoaded: boolean;
  voiceprintLoaded: boolean;
  downloading: string | null;
  supported: boolean;
}

export type SpeakerTag = { kind: "me" } | { kind: "student"; index: number };

export interface SpeechText {
  text: string;
  speaker: SpeakerTag | null;
  score: number;
  ms: number;
}

const MODE_KEY = "ck_local_stt_mode";
const READY_KEY = "ck_local_stt_ready";

/** Cached so the hot STT path needs no IPC round trip. */
export function localSttMode(): SttMode {
  const v = safeLocalStorage.getItem(MODE_KEY);
  return v === "local" || v === "auto" ? v : "cloud";
}

export async function localSttReady(): Promise<boolean> {
  if (safeLocalStorage.getItem(READY_KEY) === "1") return true;
  try {
    const s = await localStatus();
    return s.stt.installed;
  } catch {
    return false;
  }
}

export async function localStatus(): Promise<LocalStatus> {
  const s = await invoke<LocalStatus>("local_status");
  safeLocalStorage.setItem(MODE_KEY, s.settings.stt);
  safeLocalStorage.setItem(READY_KEY, s.stt.installed ? "1" : "0");
  return s;
}

export async function saveLocalSettings(settings: LocalSettings): Promise<void> {
  await invoke("local_set_settings", { settings });
  safeLocalStorage.setItem(MODE_KEY, settings.stt);
}

export async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

export async function localTranscribe(audio: Blob): Promise<string> {
  const wavB64 = await blobToBase64(audio);
  return invoke<string>("local_transcribe", { wavB64 });
}

export function speakerLabel(s: SpeakerTag | null | undefined): string {
  if (!s) return "";
  return s.kind === "me" ? "我" : `学生${s.index}`;
}

/** Chinese copy for errors coming back from the Rust side. */
export function friendlyLocalError(e: unknown): string {
  const m = String((e as any)?.message ?? e ?? "");
  if (/运行库|模型|声纹|磁盘|下载|校验|录音/.test(m)) return m;
  if (/timed out|timeout|connect|dns|network/i.test(m)) return "网络连接失败，已保留下载进度，稍后可继续";
  return m || "本地引擎出错";
}

/** Prompts read aloud during voiceprint enrollment (about 15 s total). */
export const ENROLL_PROMPTS = [
  "同学们好，今天我们继续上一节课的内容，先回顾一下关键概念。",
  "请大家打开课本第三十二页，看一下这道例题的第二个步骤。",
  "如果有不明白的地方，可以随时举手提问，我们一起讨论。",
];
