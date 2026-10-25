// ck-pluely v2: optional onboarding step that downloads the small speaker
// model and records about 15 s of the teacher's voice.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components";
import { friendlyLocalError, localStatus, type LocalStatus } from "@/lib/local-engine";
import { VoiceprintEnroll } from "./VoiceprintEnroll";

export const VoiceprintStep = () => {
  const [st, setSt] = useState<LocalStatus | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const refresh = () => localStatus().then(setSt).catch((e) => setErr(friendlyLocalError(e)));
  useEffect(() => {
    refresh();
    let un: (() => void) | undefined;
    listen<{ part: string; done: number; total: number }>("local-download", (e) => {
      if (e.payload.part === "voiceprint" && e.payload.total > 0) setPct(Math.round((e.payload.done / e.payload.total) * 100));
    })
      .then((f) => (un = f))
      .catch(() => {});
    return () => un?.();
  }, []);

  const download = async () => {
    setErr("");
    setPct(0);
    try {
      await invoke("local_download", { part: "voiceprint" });
    } catch (e) {
      setErr(friendlyLocalError(e));
    }
    setPct(null);
    refresh();
  };

  return (
    <>
      <p>录一段你的声音（约 15 秒），之后系统声音里你自己说的话会标记为“我”，不会被当作提问自动回答；学生会按声音区分为“学生1”“学生2”。</p>
      <p>声纹只保存在本机，可在设置里随时删除，卸载时一并清除。这一步可以跳过。</p>
      {!st ? (
        <p>正在检测</p>
      ) : !st.supported || !st.advice.voiceprint ? (
        <p>{st.advice.voiceprintReason || "这台电脑暂不支持声纹识别"}</p>
      ) : st.enrolled ? (
        <p className="text-foreground">已录入声纹。</p>
      ) : !st.voiceprint.installed ? (
        <div className="space-y-2">
          <Button size="sm" onClick={download} disabled={pct !== null}>
            {pct !== null ? `正在下载 ${pct}%` : `下载声纹模型（约 ${Math.max(1, Math.round(st.voiceprint.missingMb))} MB）`}
          </Button>
        </div>
      ) : (
        <VoiceprintEnroll compact onDone={refresh} />
      )}
      {err ? <p className="text-destructive" role="alert">{err}</p> : null}
    </>
  );
};
