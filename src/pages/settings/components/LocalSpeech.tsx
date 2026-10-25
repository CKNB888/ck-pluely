// ck-pluely v2: on-device speech recognition and voiceprint settings.
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button, Header, Switch } from "@/components";
import { VoiceprintEnroll, recordMic } from "@/components/local/VoiceprintEnroll";
import {
  blobToBase64,
  friendlyLocalError,
  localStatus,
  saveLocalSettings,
  type LocalSettings,
  type LocalStatus,
  type SttMode,
} from "@/lib/local-engine";
import { cn } from "@/lib/utils";

const MODES: { id: SttMode; label: string; hint: string }[] = [
  { id: "cloud", label: "在线", hint: "使用所选的语音识别服务" },
  { id: "auto", label: "自动", hint: "优先在线，断网或服务出错时改用本机" },
  { id: "local", label: "本机", hint: "全部在这台电脑上识别，不上传录音" },
];

const fmtMb = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`);

export const LocalSpeech = () => {
  const [st, setSt] = useState<LocalStatus | null>(null);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState<{ part: string; done: number; total: number } | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [testScore, setTestScore] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(() => {
    localStatus()
      .then(setSt)
      .catch((e) => setErr(friendlyLocalError(e)));
  }, []);

  useEffect(() => {
    refresh();
    let un: (() => void) | undefined;
    listen<{ part: string; done: number; total: number }>("local-download", (e) => setProgress(e.payload)).then(
      (f) => (un = f)
    );
    return () => un?.();
  }, [refresh]);

  const save = async (patch: Partial<LocalSettings>) => {
    if (!st) return;
    const settings = { ...st.settings, ...patch };
    setSt({ ...st, settings });
    try {
      await saveLocalSettings(settings);
    } catch (e) {
      setErr(friendlyLocalError(e));
    }
  };

  const download = async (part: "stt" | "voiceprint") => {
    setErr("");
    setProgress({ part, done: 0, total: 1 });
    try {
      await invoke("local_download", { part });
    } catch (e) {
      setErr(friendlyLocalError(e));
    }
    setProgress(null);
    refresh();
  };

  const remove = async (part: "stt" | "voiceprint") => {
    setErr("");
    try {
      await invoke("local_delete_models", { part });
      if (part === "stt" && st?.settings.stt !== "cloud") await save({ stt: "cloud" });
    } catch (e) {
      setErr(friendlyLocalError(e));
    }
    refresh();
  };

  const test = async () => {
    setTesting(true);
    setTestScore(null);
    try {
      const wav = await recordMic(4, () => {}, { stop: false });
      setTestScore(await invoke<number>("voiceprint_test", { wavB64: await blobToBase64(wav) }));
    } catch (e) {
      setErr(friendlyLocalError(e));
    }
    setTesting(false);
  };

  if (!st) {
    return (
      <div id="local-speech" className="space-y-2">
        <Header title="本机识别与声纹" description={err || "正在检测这台电脑"} isMainTitle />
      </div>
    );
  }

  if (!st.supported) {
    return (
      <div id="local-speech" className="space-y-2">
        <Header title="本机识别与声纹" description="当前系统架构暂不支持本机识别。" isMainTitle />
      </div>
    );
  }

  const m = st.machine;
  const busy = progress !== null || st.downloading !== null;
  const bar = (part: string) =>
    progress && progress.part === part ? (
      <div className="flex items-center gap-2">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="下载进度"
          aria-valuenow={Math.round((progress.done / Math.max(1, progress.total)) * 100)}
        >
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
          />
        </div>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {fmtMb(progress.done / 1e6)} / {fmtMb(progress.total / 1e6)}
        </span>
      </div>
    ) : null;

  return (
    <div id="local-speech" className="space-y-4">
      <Header
        title="本机识别与声纹"
        description="模型按需下载，校验后保存在本机；停止收听 2 分钟后自动释放内存。"
        isMainTitle
      />

      <p className="text-[12px] text-muted-foreground">
        {m.cpu || m.arch} · {m.cores} 核 · 内存 {m.memoryGb.toFixed(0)} GB · 可用磁盘 {m.freeDiskGb.toFixed(0)} GB · {m.simdName}
      </p>

      {/* 语音识别 */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium">离线语音识别</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              <span className={st.advice.localStt ? "" : "text-amber-600 dark:text-amber-400"}>
                {st.advice.localStt ? "推荐：" : "不推荐："}
                {st.advice.sttReason}
              </span>
            </p>
          </div>
          {st.stt.installed ? (
            <Button variant="outline" size="sm" onClick={() => remove("stt")} disabled={busy}>
              删除模型
            </Button>
          ) : (
            <Button size="sm" onClick={() => download("stt")} disabled={busy}>
              {st.stt.missingMb < st.stt.sizeMb ? "继续下载" : "下载"} {fmtMb(st.stt.missingMb)}
            </Button>
          )}
        </div>
        {bar("stt")}
        <div role="radiogroup" aria-label="识别方式" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5">
          {MODES.map((x) => {
            const disabled = x.id !== "cloud" && !st.stt.installed;
            return (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={st.settings.stt === x.id}
                disabled={disabled}
                title={disabled ? "先下载模型" : x.hint}
                onClick={() => save({ stt: x.id })}
                className={cn(
                  "rounded-md py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
                  st.settings.stt === x.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {x.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">{MODES.find((x) => x.id === st.settings.stt)?.hint}</p>
      </section>

      {/* 声纹 */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium">声纹识别</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              录入你的声音后，系统声音里出现你自己的声音（例如扬声器回声）不会被自动回答；其他人按出现顺序标为学生1、学生2。{st.advice.voiceprintReason}。
            </p>
          </div>
          {st.voiceprint.installed ? (
            <Switch
              checked={st.settings.voiceprint}
              onCheckedChange={(v) => save({ voiceprint: v })}
              aria-label="启用声纹识别"
            />
          ) : (
            <Button size="sm" onClick={() => download("voiceprint")} disabled={busy}>
              下载 {fmtMb(st.voiceprint.missingMb)}
            </Button>
          )}
        </div>
        {bar("voiceprint")}

        {st.voiceprint.installed ? (
          <>
            {st.enrolled && !enrolling ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px]">已录入我的声纹</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={test} disabled={testing}>
                    {testing ? "请说几句话" : "试一下"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEnrolling(true)}>
                    重新录入
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={async () => {
                      await invoke("voiceprint_delete").catch((e) => setErr(friendlyLocalError(e)));
                      setTestScore(null);
                      refresh();
                    }}
                  >
                    删除声纹
                  </Button>
                </div>
              </div>
            ) : (
              <VoiceprintEnroll
                onDone={() => {
                  setEnrolling(false);
                  refresh();
                }}
              />
            )}
            {testScore !== null ? (
              <p className="text-[12px]" aria-live="polite">
                相似度 {testScore.toFixed(2)}，{testScore >= st.settings.threshold ? "会被认作你本人" : "不会被认作你本人，可调低下面的阈值"}
              </p>
            ) : null}
            <label className="block space-y-1.5">
              <span className="flex justify-between text-[12px]">
                <span>判定为本人的阈值</span>
                <span className="font-mono tabular-nums text-muted-foreground">{st.settings.threshold.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0.3}
                max={0.8}
                step={0.01}
                value={st.settings.threshold}
                onChange={(e) => setSt({ ...st, settings: { ...st.settings, threshold: Number(e.target.value) } })}
                onPointerUp={() => save({})}
                onKeyUp={() => save({})}
                className="w-full accent-[hsl(var(--primary))]"
                aria-label="判定为本人的阈值"
              />
              <span className="block text-[11px] text-muted-foreground">
                越低越容易认作本人（回声也能识别），越高越不容易把学生误认成你。默认 0.50。
              </span>
            </label>
          </>
        ) : null}
      </section>

      {err ? (
        <p role="alert" className="text-[12px] text-destructive">
          {err}
        </p>
      ) : null}
    </div>
  );
};
