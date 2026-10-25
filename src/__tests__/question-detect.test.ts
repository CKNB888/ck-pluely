import { describe, it, expect } from "vitest";
import { detectQuestion, QuestionTracker, type QuestionSensitivity } from "@/lib/question-detect";
import { QUESTIONS, NON_QUESTIONS } from "./question-dataset";
import { HOLDOUT_Q, HOLDOUT_N } from "./question-holdout";

// v1.0.1 detector, kept verbatim for the before/after comparison.
const OLD_ZH = /[？?]|吗[。！!]?$|吗[，,]|呢[？?。]?$|什么|怎么|怎样|如何|为什么|为何|哪(个|些|里|儿|种|位|年|天)|几(个|种|点|年|次|天|位|岁|号)|多少|多久|多长|是否|能否|可否|可不可以|能不能|会不会|是不是|有没有|请问|介绍一下|讲一下|讲讲|说一下|谈谈|聊聊|请(你)?解释|解释一下(你|您)|举个例子/;
const OLD_EN = /\?|^(what|why|how|when|where|who|which|whose|tell me|describe|explain|walk me through)\b|^(can|could|would|will|do|does|did|is|are|was|were|should|have|has)\s+(you|we|i|they|he|she|it|there|this|that|your)\b/i;
function oldDetect(text: string) {
  const t = (text || "").trim();
  if (t.length < 2) return false;
  if (OLD_ZH.test(t)) return true;
  return t.split(/(?<=[.!?。！？])\s+/).some((s) => OLD_EN.test(s.trim()));
}

function metrics(fn: (s: string) => boolean, QS = QUESTIONS, NS = NON_QUESTIONS) {
  const fn_: string[] = [], fp: string[] = [];
  let tp = 0;
  for (const q of QS) fn(q) ? tp++ : fn_.push(q);
  for (const n of NS) if (fn(n)) fp.push(n);
  const precision = tp / (tp + fp.length);
  const recall = tp / QS.length;
  return { tp, fp, fn: fn_, precision, recall, f1: (2 * precision * recall) / (precision + recall) };
}

describe("question detection dataset", () => {
  it("has 150+ labelled utterances", () => {
    expect(QUESTIONS.length + NON_QUESTIONS.length).toBeGreaterThanOrEqual(150);
  });

  it("beats the v1.0.1 detector", () => {
    const before = metrics(oldDetect);
    const rows: Record<string, ReturnType<typeof metrics>> = { "v1.0.1": before };
    for (const s of ["conservative", "standard", "sensitive"] as QuestionSensitivity[]) {
      rows[s] = metrics((t) => detectQuestion(t, s).isQuestion);
    }
    if (process.env.QD_REPORT) {
      for (const [k, m] of Object.entries(rows)) {
        console.log(`${k}: P=${(m.precision * 100).toFixed(1)}% R=${(m.recall * 100).toFixed(1)}% F1=${(m.f1 * 100).toFixed(1)}% FP=${m.fp.length} FN=${m.fn.length}`);
        console.log("  FP:", JSON.stringify(m.fp));
        console.log("  FN:", JSON.stringify(m.fn));
      }
    }
    const std = rows.standard;
    expect(std.precision).toBeGreaterThanOrEqual(0.95);
    expect(std.recall).toBeGreaterThanOrEqual(0.9);
    expect(std.f1).toBeGreaterThan(before.f1);
    expect(rows.conservative.precision).toBeGreaterThanOrEqual(std.precision);
    expect(rows.sensitive.recall).toBeGreaterThanOrEqual(std.recall);
  });
});

describe("question detection holdout", () => {
  it("generalises to unseen utterances", () => {
    const before = metrics(oldDetect, HOLDOUT_Q, HOLDOUT_N);
    const rows: Record<string, ReturnType<typeof metrics>> = { "v1.0.1": before };
    for (const s of ["conservative", "standard", "sensitive"] as QuestionSensitivity[]) {
      rows[s] = metrics((t) => detectQuestion(t, s).isQuestion, HOLDOUT_Q, HOLDOUT_N);
    }
    if (process.env.QD_REPORT) {
      for (const [k, m] of Object.entries(rows)) {
        console.log(`holdout ${k}: P=${(m.precision * 100).toFixed(1)}% R=${(m.recall * 100).toFixed(1)}% F1=${(m.f1 * 100).toFixed(1)}% FP=${JSON.stringify(m.fp)} FN=${JSON.stringify(m.fn)}`);
      }
    }
    expect(rows.standard.f1).toBeGreaterThan(before.f1);
  });
});

describe("question tracker", () => {
  it("merges a question split by a short pause", () => {
    const tr = new QuestionTracker({ sensitivity: "standard" });
    expect(tr.push({ text: "那如果数组", at: 1000 })).toBeNull();
    const r = tr.push({ text: "是空的呢", at: 3000 });
    expect(r?.utterance).toBe("那如果数组是空的呢");
  });
  it("does not merge across a long silence", () => {
    const tr = new QuestionTracker({ sensitivity: "standard" });
    tr.push({ text: "我们来看第三题", at: 0 });
    const r = tr.push({ text: "为什么选 B", at: 20_000 });
    expect(r?.utterance).toBe("为什么选 B");
  });
  it("does not answer the same question twice", () => {
    const tr = new QuestionTracker({ sensitivity: "standard" });
    expect(tr.push({ text: "什么是闭包？", at: 0 })).not.toBeNull();
    expect(tr.push({ text: "什么是闭包", at: 8000 })).toBeNull();
    expect(tr.push({ text: "什么是闭包呢", at: 60_000 })).not.toBeNull();
  });
  it("ignores statements", () => {
    const tr = new QuestionTracker({ sensitivity: "standard" });
    expect(tr.push({ text: "好吧，那就这样", at: 0 })).toBeNull();
  });
});
