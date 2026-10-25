// ck-pluely: layered "is this a question worth answering?" detector for the
// live copilot. Pure, synchronous, no allocations of note — runs on every STT
// segment. Signals are weighted; the sensitivity picks the threshold.
//
// Layers (Chinese + English):
//  1. STT punctuation (？/?) — strongest signal when the engine emits it.
//  2. Clause-final particles 吗/么/呢/吧 (吧 only as a confirmation to 你/您).
//  3. Question words 什么/怎么/为什么/哪…/谁/几…/多少/是否 and A不A / 有没有.
//  4. Requests that expect an answer: 说说/讲一下/解释一下/介绍一下/谈谈/
//     你觉得/你认为/举个例子/比较一下 … (not when the speaker is 我/我们).
//  5. English wh-questions, auxiliary inversion, tag questions, imperatives
//     (tell me / walk me through / explain / describe).
// Negative filters: discourse fillers (对吧，/是吧，/好吧/你看/怎么说呢),
// indefinite uses (什么都/谁都/无论/不管/哪怕/多少有点), embedded or reported
// questions (我不知道为什么…/他问我为什么…/这就是为什么…/比如说…),
// quoted speech, first-person announcements, English clefts ("What I mean is").

export type QuestionSensitivity = "conservative" | "standard" | "sensitive";

export const QUESTION_THRESHOLDS: Record<QuestionSensitivity, number> = {
  conservative: 4,
  standard: 3,
  sensitive: 2,
};

export interface QuestionVerdict {
  isQuestion: boolean;
  score: number;
  reasons: string[];
}

const LEADING_FILLER =
  /^(?:嗯+|啊+|呃+|额+|哦+|唔+|那个|就是说?(?=[，,])|然后|所以说|那么|好|ok(?:ay)?|so|um+|uh+|well|and|alright)[\s,，、.。…]*/i;
const DISCOURSE_CLAUSE =
  /(?:^|[，,。！!；;\s])(?:对吧|是吧|好吧|行吧|你看|你知道吗|怎么说呢|其实呢|然后呢|那么呢|我想想)(?=[，,])/g;
const QUOTED = /[“「『"][^”」』"]{0,80}[”」』"]/g;

// --- Chinese ---------------------------------------------------------------
const ZH_WH =
  /什么|啥|怎么|怎样|如何|为什么|为何|哪(?:个|些|里|儿|种|位|年|天|部分|一|方面|家)|在哪|去哪|哪$|谁|几(?:个|种|点|年|次|天|位|岁|号|成|页|道|章|分)|多少|多久|多长|多大|多远|是否|能否|可否|有何/;
const ZH_A_NOT_A = /([\u4e00-\u9fa5])[不没]\1|有没有|是否/;
const ZH_ALT = /(?:是|选|用|要|去|做|喜欢|学).{0,14}还是/;
const ZH_INDEFINITE =
  /(?:什么|谁|哪儿|哪里|怎么|多少)(?:都|也)|无论|不管|不论|哪怕|多少有点|多少也|几乎|怎么说呢|没什么|不怎么|为什么不呢$/;
const ZH_EMBED =
  /(?:不知道|知道|不清楚|不明白|明白了|记得|忘了|问(?:了)?(?:我|他|她|你|大家)?|告诉(?:你|大家)|说明|看看|想想|这就是|就是因为|比如说?|例如)/;
const ZH_REQUEST =
  /^(?:请|麻烦)?(?:你|您)?(?:能|可以|能否|可否)?(?:给我们|给大家|跟我们|帮我们)?(?:再|先|简单|简要|具体|详细)?(?:地)?(?:说说|说一下|讲讲|讲一下|讲一讲|解释一下|解释下|介绍一下|介绍下|谈谈|谈一下|聊聊|聊一下|描述一下|分析一下|比较一下|对比一下|总结一下|展开说说|分享一下)/;
const ZH_OPINION = /^(?:那)?(?:你|您)(?:们)?(?:觉得|认为|怎么看|对.{1,20}怎么看|怎么想|有什么看法)/;
const ZH_EXAMPLE = /(?:请|你|能|可以|再)举(?:个|一个)?例子|举(?:个|一个)?例子(?:说明|解释|吗)/;
const ZH_FIRST_PERSON = /^(?:我|我们|咱们|下面|接下来|现在我|今天我|让我|大家)/;
const ZH_FILLER_ENDING = /^(?:好吧|行吧|算了吧|走吧|来吧|是吧|对吧)$/;

// --- English ---------------------------------------------------------------
const EN_WH_START = /^(what|why|how|when|where|who|which|whose|whom)('s|'re|'d)?\b(\s+\S+)?/i;
const EN_PRONOUN = /^(i|we|they|he|she|it)$/i;
const EN_AUX =
  /^(can|could|would|will|do|does|did|is|are|was|were|should|shall|have|has|had|may|might|am|isn't|aren't|don't|doesn't|didn't|won't|wouldn't|can't|couldn't|shouldn't|haven't|hasn't)\s+(you|we|i|they|he|she|it|there|this|that|these|those|your|our|anyone|anybody|everyone|someone|the|any)\b/i;
const EN_IMPERATIVE =
  /^(please\s+)?(tell (me|us)|walk (me|us) through|explain|describe|elaborate|talk (me|us) through|give (me|us) an example|compare|define|clarify|share (your|some))\b/i;
const EN_TAG =
  /[,，]\s*(right|correct|yeah|isn't it|aren't you|aren't they|don't you|didn't you|doesn't it|won't you|isn't that|no)\s*[?？]?$/i;
const EN_OPEN = /^(any (thoughts|questions|ideas|comments|updates)|what about|how about|thoughts on)\b/i;

function hasCjk(s: string) {
  return /[\u4e00-\u9fa5]/.test(s);
}

function normalize(text: string): string {
  let t = (text || "").replace(QUOTED, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 4; i++) {
    const n = t.replace(LEADING_FILLER, "").trim();
    if (n === t) break;
    t = n;
  }
  t = t.replace(DISCOURSE_CLAUSE, (m) => m.charAt(0).match(/[，,。！!；;\s]/) ? m.charAt(0) : "");
  return t.replace(/^[，,。、\s]+/, "").trim();
}

function scoreZhClause(clause: string, isLast: boolean, reasons: string[]): number {
  const c = clause.trim();
  if (!c) return 0;
  let s = 0;
  const firstPerson = ZH_FIRST_PERSON.test(c);
  if (isLast && !ZH_FILLER_ENDING.test(c)) {
    if (/[吗么][。！!…~]*$/.test(c)) { s = Math.max(s, 3); reasons.push("particle:吗"); }
    else if (/呢[。！!…~]*$/.test(c) && c.length > 2) { s = Math.max(s, 3); reasons.push("particle:呢"); }
    else if (/吧[。！!…~]*$/.test(c) && /你|您/.test(c) && !firstPerson) {
      const conf = /(应该|大概|可能|肯定|也|是|已经|会|没|过)/.test(c);
      s = Math.max(s, conf ? 3 : 2);
      reasons.push("particle:吧");
    }
  }
  const indefinite = ZH_INDEFINITE.test(c);
  const embedded = ZH_EMBED.test(c);
  if (ZH_WH.test(c) && !indefinite && !embedded) { s = Math.max(s, 3); reasons.push("wh"); }
  else if (ZH_WH.test(c) && embedded && !indefinite && /^(你|您)/.test(c)) { s = Math.max(s, 2); reasons.push("wh-embedded-2p"); }
  if (ZH_A_NOT_A.test(c) && !indefinite && !(embedded && !/^(你|您)/.test(c))) { s = Math.max(s, 3); reasons.push("A不A"); }
  if (ZH_ALT.test(c) && !firstPerson) { s = Math.max(s, 3); reasons.push("还是"); }
  if (!firstPerson && ZH_REQUEST.test(c)) { s = Math.max(s, 3); reasons.push("request"); }
  if (ZH_OPINION.test(c)) { s = Math.max(s, 3); reasons.push("opinion"); }
  if (ZH_EXAMPLE.test(c) && !/^我/.test(c)) { s = Math.max(s, 3); reasons.push("example"); }
  return s;
}

function scoreEnSentence(sentence: string, reasons: string[]): number {
  const t = normalize(sentence).replace(/[.!。！]+$/, "").trim();
  if (!t) return 0;
  let s = 0;
  const wh = t.match(EN_WH_START);
  if (wh) {
    const next = (wh[3] || "").trim();
    if (!(next && EN_PRONOUN.test(next) && !wh[2])) { s = Math.max(s, 3); reasons.push("en:wh"); }
  }
  if (EN_AUX.test(t)) { s = Math.max(s, 3); reasons.push("en:aux"); }
  if (EN_IMPERATIVE.test(t)) { s = Math.max(s, 3); reasons.push("en:imperative"); }
  if (EN_TAG.test(t)) { s = Math.max(s, 3); reasons.push("en:tag"); }
  if (EN_OPEN.test(t)) { s = Math.max(s, 3); reasons.push("en:open"); }
  if (/\b(i wonder|i'm curious|wondering)\b/i.test(t)) { s = Math.max(s, 1); reasons.push("en:wonder"); }
  return s;
}

/** Score one transcript chunk. Higher = more confident it is a question. */
export function scoreQuestion(text: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const raw = (text || "").trim();
  if (raw.replace(/[\s\p{P}]/gu, "").length < 2) return { score: 0, reasons };
  const t = normalize(raw);
  if (!t) return { score: 0, reasons };
  let best = 0;

  // Split into sentences; keep the terminator to read STT punctuation.
  const sentences = t.match(/[^。！!？?.]+[。！!？?.]*/g) || [t];
  sentences.forEach((sent, si) => {
    const isLastSentence = si === sentences.length - 1;
    const endQ = /[？?]\s*$/.test(sent);
    let s = 0;
    if (endQ) { s = 3; reasons.push("punct:?"); }
    if (hasCjk(sent)) {
      const clauses = sent.replace(/[。！!？?.]+$/, "").split(/[，,；;、]/).filter((c) => c.trim());
      clauses.forEach((c, ci) => {
        s = Math.max(s, scoreZhClause(c, ci === clauses.length - 1, reasons));
      });
      // English fragments inside mixed sentences ("So 你的 plan 是什么").
      if (/^[A-Za-z]/.test(sent.trim())) s = Math.max(s, scoreEnSentence(sent, reasons));
    } else {
      s = Math.max(s, scoreEnSentence(sent, reasons));
    }
    // Bonus: explicit end-of-question marks or a direct address make an
    // already-detected question more certain (used by "conservative").
    if (s >= 3) {
      const addressed = /你|您|老师|\byou\b|\byour\b/i.test(sent);
      const marked = endQ || /[吗么呢][。！!]?$/.test(sent.trim());
      const shaped = reasons.some((r) =>
        /^(A不A|还是|request|opinion|example|en:aux|en:imperative|en:tag|en:open)$/.test(r)
      );
      if (addressed || marked || shaped) s += 1;
    }
    // Questions usually close the turn; earlier sentences count a bit less.
    if (!isLastSentence && !endQ) s = Math.min(s, 3);
    best = Math.max(best, s);
  });
  return { score: best, reasons };
}

export function detectQuestion(
  text: string,
  sensitivity: QuestionSensitivity = "standard"
): QuestionVerdict {
  const { score, reasons } = scoreQuestion(text);
  const th = QUESTION_THRESHOLDS[sensitivity] ?? 3;
  return { isQuestion: score >= th, score, reasons };
}

// --- Utterance assembly, debounce and de-duplication -----------------------

/** Normalised key for "same question" comparisons. */
export function questionKey(text: string): string {
  return normalize(text)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .replace(/[吗呢吧么啊呀嘛]$/u, "");
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  if (s.length === 1) out.add(s);
  return out;
}

/** Dice similarity on character bigrams (works for CJK and Latin). */
export function similarity(a: string, b: string): number {
  const A = bigrams(questionKey(a));
  const B = bigrams(questionKey(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter++; });
  return (2 * inter) / (A.size + B.size);
}

export interface SegmentInput {
  text: string;
  /** ms timestamp when this segment ended (Date.now()). */
  at: number;
}

export interface TrackerOptions {
  sensitivity: QuestionSensitivity;
  /** Pause shorter than this joins two segments into one utterance. */
  mergeGapMs?: number;
  /** Same question within this window is not answered twice. */
  dedupeWindowMs?: number;
}

/**
 * Feeds STT segments in order. Merges fragments split by short pauses,
 * decides whether the latest utterance is a question, and suppresses
 * repeats of a question that was already answered recently.
 */
export class QuestionTracker {
  private lastSeg: SegmentInput | null = null;
  private answered: { key: string; text: string; at: number }[] = [];
  constructor(public opts: TrackerOptions) {}

  reset() {
    this.lastSeg = null;
    this.answered = [];
  }

  /** Returns the utterance to answer, or null when nothing should fire. */
  push(seg: SegmentInput): { utterance: string; verdict: QuestionVerdict } | null {
    const gap = this.opts.mergeGapMs ?? 2500;
    const text = seg.text.trim();
    if (!text) return null;
    const prev = this.lastSeg;
    const joined = prev && this.withinGap(prev, seg, gap)
      ? `${prev.text}${hasCjk(prev.text) ? "" : " "}${text}`
      : null;
    this.lastSeg = { text: joined ?? text, at: seg.at };

    let verdict = detectQuestion(text, this.opts.sensitivity);
    let utterance = text;
    if (joined) {
      const v2 = detectQuestion(joined, this.opts.sensitivity);
      if (v2.isQuestion && (!verdict.isQuestion || v2.score >= verdict.score)) {
        verdict = v2;
        utterance = joined;
      }
    }
    if (!verdict.isQuestion) return null;

    const now = seg.at;
    const win = this.opts.dedupeWindowMs ?? 45_000;
    this.answered = this.answered.filter((a) => now - a.at <= win);
    const key = questionKey(utterance);
    if (this.answered.some((a) => a.key === key || similarity(a.text, utterance) >= 0.8)) {
      return null;
    }
    this.answered.push({ key, text: utterance, at: now });
    this.lastSeg = null; // answered; next segment starts a new utterance
    return { utterance, verdict };
  }

  private withinGap(prev: SegmentInput, seg: SegmentInput, gap: number) {
    // Segments come from VAD: a new one is emitted only after silence, so the
    // time between two segment *ends* includes the new segment's speech. We
    // approximate speech length from text (≈4 CJK chars/s or 2.5 words/s).
    const t = seg.text.trim();
    const speechMs = hasCjk(t) ? (t.length / 4) * 1000 : (t.split(/\s+/).length / 2.5) * 1000;
    const delta = seg.at - prev.at;
    return delta >= 0 && delta - speechMs <= gap;
  }
}
