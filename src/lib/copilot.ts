// ck-pluely: interview / class / meeting copilot helpers.
import { safeLocalStorage } from "@/lib/storage";

export const COPILOT_KEYS = {
  AUTO_ANSWER: "ck_copilot_auto_answer",
  PRESET: "ck_copilot_preset",
  NOTES: "ck_copilot_notes",
};

export type CopilotPresetId = "interview" | "class" | "meeting" | "none";

export const COPILOT_PRESETS: Record<
  Exclude<CopilotPresetId, "none">,
  { zh: string; en: string }
> = {
  interview: {
    zh: "你是我的实时面试助手。对方（面试官）刚刚说的话会以转写文本给你。请判断其中的问题，用第一人称、口语化的简体中文直接给出我可以照着说的回答：先一句话结论，再 2-4 个要点，结合我的简历/笔记中的真实经历，不要编造经历，不要寒暄，总长度控制在 150 字以内。",
    en: "You are my real-time interview copilot. The interviewer's words are given as a transcript. Identify the question and answer in first person, conversationally: one-sentence answer first, then 2-4 bullet points grounded in my resume/notes. Never invent experience. Keep it under 120 words.",
  },
  class: {
    zh: "你是我的课堂答疑助手，我是老师。学生的提问会以转写文本给你。请用适合讲给学生听的简体中文，先给出准确简洁的答案，再用一个通俗例子解释；如涉及公式或步骤请分步列出。总长度控制在 200 字以内。",
    en: "You are my classroom Q&A assistant; I am the teacher. Students' questions arrive as a transcript. Give an accurate, concise answer I can say to students, then one simple example. Use steps for formulas or procedures. Under 150 words.",
  },
  meeting: {
    zh: "你是我的会议助手。参会者的发言会以转写文本给你。如果其中有向我提出的问题，请用简体中文给出简洁、专业、可直接说出口的回答（3 句以内）；如果没有问题，用一句话总结要点并提示我可以如何回应。",
    en: "You are my meeting copilot. Participants' speech arrives as a transcript. If someone asks me a question, give a concise, professional answer I can say aloud (max 3 sentences). Otherwise summarize the point in one sentence and suggest a reply.",
  },
};

const ZH_QUESTION =
  /[？?]|吗|呢[？?。]?$|什么|怎么|怎样|如何|为什么|为何|哪|几|多少|是否|能否|可否|可不可以|能不能|会不会|是不是|有没有|请问|介绍一下|讲一下|说一下|说说|谈谈|聊聊|解释|举个例子/;
const EN_QUESTION =
  /\?|^(what|why|how|when|where|who|which|whose|can|could|would|will|do|does|did|is|are|was|were|should|have|has|tell me|describe|explain|walk me through)\b/i;

/** Heuristic: does this transcript chunk contain a question worth answering? */
export function isLikelyQuestion(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < 2) return false;
  if (ZH_QUESTION.test(t)) return true;
  return t
    .split(/(?<=[.!?。！？])\s+/)
    .some((s) => EN_QUESTION.test(s.trim()));
}

export function loadBool(key: string, fallback: boolean): boolean {
  const v = safeLocalStorage.getItem(key);
  return v === null ? fallback : v === "true";
}

export function presetPrompt(id: string, lang: string): string {
  const p = (COPILOT_PRESETS as any)[id];
  if (!p) return "";
  return lang?.toLowerCase().startsWith("zh") ? p.zh : p.en;
}

/** Final system prompt = preset (or base) + user's resume/notes context. */
export function buildCopilotPrompt(
  base: string,
  presetId: string,
  notes: string,
  lang: string
): string {
  const preset = presetPrompt(presetId, lang);
  let out = preset ? `${preset}\n\n${base}` : base;
  if (notes.trim()) {
    out += `\n\n## 我的简历 / 笔记 (My resume / notes)\n${notes.trim()}`;
  }
  return out;
}
