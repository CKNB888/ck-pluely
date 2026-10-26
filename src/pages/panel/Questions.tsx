// ck-pluely v2: the student question queue for the current class, plus the
// 课堂纪要 export. Reads the shared class session and follows its changes.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { CheckIcon, CopyIcon, FileDownIcon, PlusIcon } from "lucide-react";
import {
  clock,
  fileStem,
  loadSession,
  newSession,
  onSessionChange,
  toMarkdown,
  toText,
  updateEntry,
  type ClassSession,
} from "@/lib/class-session";

export const Questions = () => {
  const [s, setS] = useState<ClassSession>(() => loadSession());
  const [showAll, setShowAll] = useState(false);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState("");
  const [copied, setCopied] = useState("");
  // Inline confirm: a native confirm() dialog is not capture-protected and would blur-hide the panel.
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    let un: (() => void) | undefined;
    onSessionChange(() => setS(loadSession())).then((f) => (un = f)).catch(() => {});
    return () => un?.();
  }, []);

  const qs = s.entries.filter((e) => e.question);
  const list = (showAll ? qs : qs.filter((e) => !e.answered)).slice().reverse();

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1200);
    } catch {
      setMsg("复制失败");
    }
  };

  const exportAs = async (kind: "md" | "txt") => {
    setMsg("");
    try {
      const path = await invoke<string>("ck_export_notes", {
        name: `${fileStem(s)}.${kind}`,
        content: kind === "md" ? toMarkdown(s) : toText(s),
      });
      setSaved(path);
      setMsg("已保存到“文稿/CK Pluely”");
    } catch (e) {
      setMsg(String(e));
    }
  };

  const btn =
    "flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[12px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
        <span>
          {s.subject ? `${s.subject} · ` : ""}
          {clock(s.startedAt)} 开始 · {qs.length} 个提问，{qs.filter((q) => !q.answered).length} 个待回答
        </span>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          含已回答
        </label>
      </div>

      {list.length ? (
        <ul className="overflow-hidden rounded-lg border bg-card divide-y" aria-label="提问列表">
          {list.map((q) => (
            <li key={q.id} className="flex items-start gap-2 px-3 py-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={q.answered}
                aria-label={q.answered ? "标为未回答" : "标为已回答"}
                onClick={() => updateEntry(q.id, { answered: !q.answered })}
                className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${
                  q.answered ? "bg-primary text-primary-foreground" : "bg-background"
                }`}
              >
                {q.answered ? <CheckIcon className="size-3" /> : null}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{clock(q.at)}</span>
                  <span>{q.label}</span>
                </div>
                <p className={`text-[13px] leading-snug ${q.answered ? "text-muted-foreground line-through" : ""}`}>{q.text}</p>
              </div>
              <button
                type="button"
                aria-label="复制"
                title="复制"
                onClick={() => copy(q.id, q.answer ? `${q.text}\n\n${q.answer}` : q.text)}
                className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {copied === q.id ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">
          {qs.length ? "提问都已回答。" : "开始会议实时转写后，学生的提问会按时间排在这里。"}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => exportAs("md")} disabled={!s.entries.length}>
          <FileDownIcon />
          导出课堂纪要
        </button>
        <button type="button" className={btn} onClick={() => exportAs("txt")} disabled={!s.entries.length}>
          纯文本
        </button>
        <button
          type="button"
          className={btn}
          data-testid="new-class"
          onClick={() => {
            if (!s.entries.length || confirmNew) {
              newSession(s.subject);
              setSaved("");
              setMsg("");
              setConfirmNew(false);
            } else {
              setConfirmNew(true);
              setMsg("当前记录会被清空（请先导出），再点一次「确认清空」开始新的一节课。");
            }
          }}
        >
          <PlusIcon />
          {confirmNew ? "确认清空" : "新的一节课"}
        </button>
      </div>
      {msg ? (
        <p className="text-[11px] text-muted-foreground" aria-live="polite">
          {msg}
          {saved ? (
            <button type="button" className="ml-2 underline" onClick={() => revealItemInDir(saved).catch(() => {})}>
              在文件夹中显示
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
};
