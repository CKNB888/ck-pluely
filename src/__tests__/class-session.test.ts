import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(() => Promise.resolve()), listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;
(globalThis as unknown as { window: unknown }).window ??= globalThis;

import {
  addEntry,
  answerLatestQuestion,
  fileStem,
  loadSession,
  MAX_ENTRIES,
  newSession,
  setSubject,
  toMarkdown,
  toText,
  updateEntry,
} from "@/lib/class-session";
import { speakerLabel, localSttMode, friendlyLocalError, ENROLL_PROMPTS } from "@/lib/local-engine";
import { buildCopilotPrompt, CLASS_SUBJECT_KEY, CLASS_SUBJECTS, classSubjectHint } from "@/lib/copilot";

const t0 = new Date(2026, 9, 25, 8, 5, 3).getTime();

describe("class session", () => {
  beforeEach(() => {
    store.clear();
    newSession("数学");
  });

  it("records entries and answers the latest open question", () => {
    addEntry({ at: t0, speaker: "me", label: "我", text: "今天讲二次函数", question: false });
    const q1 = addEntry({ at: t0 + 1000, speaker: "student", label: "学生1", text: "顶点怎么求？", question: true });
    addEntry({ at: t0 + 2000, speaker: "student", label: "学生2", text: "判别式是什么？", question: true });
    answerLatestQuestion("b²-4ac");
    let s = loadSession();
    expect(s.subject).toBe("数学");
    expect(s.entries[2].answer).toBe("b²-4ac");
    expect(s.entries[1].answer).toBeUndefined();
    updateEntry(q1.id, { answered: true });
    s = loadSession();
    expect(s.entries[1].answered).toBe(true);
  });

  it("caps the log", () => {
    for (let i = 0; i < MAX_ENTRIES + 25; i++) addEntry({ at: t0 + i, speaker: "unknown", label: "", text: `x${i}`, question: false });
    const s = loadSession();
    expect(s.entries.length).toBe(MAX_ENTRIES);
    expect(s.entries[0].text).toBe("x25");
  });

  it("survives corrupted storage", () => {
    store.set("ck_class_session", "{not json");
    expect(loadSession().entries).toEqual([]);
  });

  it("exports markdown and text", () => {
    setSubject("物理");
    addEntry({ at: t0, speaker: "student", label: "学生1", text: "为什么天是蓝的？", question: true, answered: true });
    const s = { ...loadSession(), startedAt: t0 };
    const md = toMarkdown(s);
    expect(md).toContain("# 课堂纪要 2026-10-25 · 物理");
    expect(md).toContain("1. [08:05:03] 学生1：为什么天是蓝的？（已回答）");
    expect(toText(s)).toContain("[08:05:03] 学生1：为什么天是蓝的？  [提问·已回答]");
    expect(fileStem(s)).toBe("课堂纪要-20261025-0805");
  });
});

describe("local engine helpers", () => {
  beforeEach(() => store.clear());
  it("labels speakers", () => {
    expect(speakerLabel({ kind: "me" })).toBe("我");
    expect(speakerLabel({ kind: "student", index: 2 })).toBe("学生2");
    expect(speakerLabel(null)).toBe("");
  });
  it("defaults to cloud speech", () => {
    expect(localSttMode()).toBe("cloud");
    store.set("ck_local_stt_mode", "local");
    expect(localSttMode()).toBe("local");
    store.set("ck_local_stt_mode", "x");
    expect(localSttMode()).toBe("cloud");
  });
  it("translates errors", () => {
    expect(friendlyLocalError(new Error("connection timed out"))).toMatch(/网络/);
    expect(friendlyLocalError("模型校验失败")).toBe("模型校验失败");
    expect(friendlyLocalError("")).toBe("本地引擎出错");
  });
  it("has about 15 s of enrollment text", () => {
    expect(ENROLL_PROMPTS.join("").length).toBeGreaterThan(60);
  });
});

describe("classroom subjects", () => {
  beforeEach(() => store.clear());
  it("adds the subject hint only in classroom mode", () => {
    store.set(CLASS_SUBJECT_KEY, "math");
    const p = buildCopilotPrompt("BASE", "class", "", "zh-CN");
    expect(p).toContain(classSubjectHint("math"));
    expect(p).toContain("BASE");
    expect(buildCopilotPrompt("BASE", "", "", "zh-CN")).not.toContain("学科：数学");
    expect(classSubjectHint("")).toBe("");
    expect(CLASS_SUBJECTS.every((s) => !/AI|!|！/.test(s.hint + s.label))).toBe(true);
  });
});
