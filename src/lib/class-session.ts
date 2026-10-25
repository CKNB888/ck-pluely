// ck-pluely v2: what was said in this class, who said it, and which student
// questions are still open. Shared across windows through localStorage plus
// a Tauri event, capped so it never grows without bound.
import { emit, listen } from "@tauri-apps/api/event";
import { safeLocalStorage } from "@/lib/storage";

export type SpeakerKind = "me" | "student" | "unknown";

export interface SessionEntry {
  id: string;
  at: number;
  speaker: SpeakerKind;
  /** 我 / 学生1 / 学生 */
  label: string;
  text: string;
  question: boolean;
  answered: boolean;
  answer?: string;
}

export interface ClassSession {
  startedAt: number;
  subject: string;
  entries: SessionEntry[];
}

const KEY = "ck_class_session";
export const SESSION_EVENT = "ck-class-session";
export const MAX_ENTRIES = 600;

export function loadSession(): ClassSession {
  try {
    const raw = safeLocalStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as ClassSession;
      if (Array.isArray(s.entries)) return s;
    }
  } catch {
    /* corrupted: start fresh */
  }
  return { startedAt: Date.now(), subject: "", entries: [] };
}

let pending: ReturnType<typeof setTimeout> | undefined;
function save(s: ClassSession) {
  safeLocalStorage.setItem(KEY, JSON.stringify(s));
  // coalesce bursts into one cross-window notification
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = undefined;
    emit(SESSION_EVENT).catch(() => {});
  }, 150);
}

export function addEntry(e: Omit<SessionEntry, "id" | "answered"> & { answered?: boolean }): SessionEntry {
  const s = loadSession();
  const entry: SessionEntry = {
    answered: false,
    ...e,
    id: `${e.at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  };
  s.entries.push(entry);
  if (s.entries.length > MAX_ENTRIES) s.entries.splice(0, s.entries.length - MAX_ENTRIES);
  save(s);
  return entry;
}

export function updateEntry(id: string, patch: Partial<SessionEntry>) {
  const s = loadSession();
  const e = s.entries.find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, patch);
  save(s);
}

/** Attach an answer to the most recent open student question. */
export function answerLatestQuestion(answer: string) {
  const s = loadSession();
  for (let i = s.entries.length - 1; i >= 0; i--) {
    const e = s.entries[i];
    if (e.question && !e.answer) {
      e.answer = answer;
      save(s);
      return;
    }
  }
}

export function newSession(subject = "") {
  save({ startedAt: Date.now(), subject, entries: [] });
}

export function setSubject(subject: string) {
  const s = loadSession();
  s.subject = subject;
  save(s);
}

export function onSessionChange(cb: () => void): Promise<() => void> {
  return listen(SESSION_EVENT, cb);
}

const pad = (n: number) => String(n).padStart(2, "0");
export const clock = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const day = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function fileStem(s: ClassSession): string {
  const d = new Date(s.startedAt);
  return `课堂纪要-${day(s.startedAt).replace(/-/g, "")}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function toMarkdown(s: ClassSession): string {
  const qs = s.entries.filter((e) => e.question);
  const out: string[] = [];
  out.push(`# 课堂纪要 ${day(s.startedAt)}${s.subject ? ` · ${s.subject}` : ""}`);
  out.push("");
  const end = s.entries.length ? s.entries[s.entries.length - 1].at : s.startedAt;
  out.push(`时间：${clock(s.startedAt)} - ${clock(end)}　学生提问：${qs.length} 个，已回答 ${qs.filter((q) => q.answered).length} 个`);
  out.push("");
  if (qs.length) {
    out.push("## 学生提问");
    out.push("");
    qs.forEach((q, i) => {
      out.push(`${i + 1}. [${clock(q.at)}] ${q.label}：${q.text}${q.answered ? "（已回答）" : ""}`);
      if (q.answer) {
        out.push("");
        out.push(q.answer.split("\n").map((l) => `   > ${l}`).join("\n"));
        out.push("");
      }
    });
    out.push("");
  }
  out.push("## 课堂记录");
  out.push("");
  for (const e of s.entries) out.push(`- [${clock(e.at)}] **${e.label || "未知"}**：${e.text}`);
  out.push("");
  return out.join("\n");
}

export function toText(s: ClassSession): string {
  const lines = [`课堂纪要 ${day(s.startedAt)}${s.subject ? ` ${s.subject}` : ""}`, ""];
  for (const e of s.entries) {
    lines.push(`[${clock(e.at)}] ${e.label || "未知"}：${e.text}${e.question ? (e.answered ? "  [提问·已回答]" : "  [提问]") : ""}`);
    if (e.answer) lines.push(`    参考回答：${e.answer.replace(/\n+/g, " ")}`);
  }
  return lines.join("\n") + "\n";
}
