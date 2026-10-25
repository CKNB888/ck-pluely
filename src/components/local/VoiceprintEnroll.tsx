// Records about 15 s of the teacher reading three short lines, then builds
// the voiceprint on this computer. Nothing is uploaded.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components";
import { floatArrayToWav } from "@/lib/utils";
import { blobToBase64, ENROLL_PROMPTS, friendlyLocalError } from "@/lib/local-engine";

const SECONDS = 15;

type Phase = "idle" | "recording" | "saving" | "done" | "error";

export async function recordMic(
  seconds: number,
  onTick: (elapsed: number, level: number) => void,
  signal: { stop: boolean }
): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let total = 0;
  const started = performance.now();
  await new Promise<void>((resolve) => {
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      total += d.length;
      let peak = 0;
      for (let i = 0; i < d.length; i += 16) peak = Math.max(peak, Math.abs(d[i]));
      const elapsed = (performance.now() - started) / 1000;
      onTick(elapsed, peak);
      if (elapsed >= seconds || signal.stop) resolve();
    };
    src.connect(proc);
    proc.connect(ctx.destination);
  });
  proc.disconnect();
  src.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  const rate = ctx.sampleRate;
  await ctx.close();
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return floatArrayToWav(all, rate, "wav");
}

export const VoiceprintEnroll = ({
  onDone,
  compact,
}: {
  onDone?: () => void;
  compact?: boolean;
}) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState("");
  const signal = useRef({ stop: false });

  useEffect(() => () => void (signal.current.stop = true), []);

  const start = async () => {
    signal.current = { stop: false };
    setPhase("recording");
    setMessage("");
    let last = 0;
    try {
      const wav = await recordMic(SECONDS, (e, l) => {
        // repaint at most ~8 times a second
        if (e - last > 0.12) {
          last = e;
          setElapsed(e);
          setLevel(l);
        }
      }, signal.current);
      setPhase("saving");
      const r = await invoke<{ windows: number; consistency: number }>("voiceprint_enroll", {
        wavB64: await blobToBase64(wav),
      });
      setPhase("done");
      setMessage(
        r.consistency < 0.6
          ? "已保存。录音中杂音较多，识别可能不稳定，可在安静环境重录。"
          : "已保存在本机，可随时删除。"
      );
      onDone?.();
    } catch (e) {
      setPhase("error");
      const m = friendlyLocalError(e);
      setMessage(/Permission|NotAllowed/i.test(m) ? "无法使用麦克风，请在系统设置中允许 CK Pluely 访问麦克风" : m);
    }
  };

  const line = Math.min(ENROLL_PROMPTS.length - 1, Math.floor((elapsed / SECONDS) * ENROLL_PROMPTS.length));

  return (
    <div className={compact ? "space-y-3" : "space-y-3 rounded-lg border p-4"}>
      {phase === "recording" ? (
        <>
          <p className="text-[12px] text-muted-foreground">请用平时上课的语速朗读：</p>
          <ol className="space-y-1.5 text-[14px] leading-relaxed">
            {ENROLL_PROMPTS.map((p, i) => (
              <li key={p} className={i === line ? "font-medium text-foreground" : "text-muted-foreground"}>
                {p}
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-3">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={SECONDS}
              aria-valuenow={Math.round(elapsed)}
              aria-label="录音进度"
            >
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.min(100, (elapsed / SECONDS) * 100)}%` }} />
            </div>
            <span className="w-10 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
              {Math.max(0, Math.ceil(SECONDS - elapsed))} 秒
            </span>
            <span
              aria-hidden
              className="size-2 rounded-full bg-primary"
              style={{ opacity: Math.min(1, 0.25 + level * 4) }}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => (signal.current.stop = true)}>
              提前结束
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground" aria-live="polite">
            {phase === "saving"
              ? "正在生成声纹"
              : message || `朗读三句话，约 ${SECONDS} 秒。声纹只保存在这台电脑上。`}
          </p>
          <Button size="sm" onClick={start} disabled={phase === "saving"}>
            {phase === "done" || phase === "error" ? "重新录入" : "开始录入"}
          </Button>
        </div>
      )}
    </div>
  );
};
