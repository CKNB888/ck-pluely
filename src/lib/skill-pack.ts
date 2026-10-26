/**
 * 技能包（提示词包）导入：纯文本，不执行任何代码、不联网。
 * 支持两种格式：
 *  1. JSON：{ "name": "...", "prompts": [{ "name": "...", "prompt": "..." }] }
 *  2. Agent Skills 风格的 SKILL.md：--- name/description --- 加正文
 */
export interface SkillPrompt {
  name: string;
  prompt: string;
}

export const SKILL_PACK_LIMITS = {
  fileBytes: 256 * 1024,
  prompts: 50,
  nameChars: 80,
  promptChars: 8000,
};

const clean = (s: unknown, max: number) =>
  typeof s === "string"
    ? s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max)
    : "";

function parseSkillMd(text: string, fallbackName: string): SkillPrompt[] {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  let name = fallbackName;
  let body = text;
  if (m) {
    const nameLine = m[1].match(/^name:\s*(.+)$/m);
    if (nameLine) name = nameLine[1].replace(/^["']|["']$/g, "");
    body = m[2];
  }
  const prompt = clean(body, SKILL_PACK_LIMITS.promptChars);
  const n = clean(name, SKILL_PACK_LIMITS.nameChars);
  return prompt && n ? [{ name: n, prompt }] : [];
}

export function parseSkillPack(text: string, fileName = "skill"): SkillPrompt[] {
  if (new Blob([text]).size > SKILL_PACK_LIMITS.fileBytes) {
    throw new Error("技能包太大（上限 256 KB）");
  }
  const base = fileName.replace(/\.(json|md|markdown|txt)$/i, "");
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    const out = parseSkillMd(trimmed, base);
    if (!out.length) throw new Error("没有找到可用的提示词");
    return out;
  }
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new Error("JSON 格式不正确");
  }
  const list = Array.isArray(data)
    ? data
    : (data as { prompts?: unknown })?.prompts;
  if (!Array.isArray(list)) throw new Error("缺少 prompts 列表");
  const out: SkillPrompt[] = [];
  for (const item of list.slice(0, SKILL_PACK_LIMITS.prompts)) {
    const it = item as Record<string, unknown>;
    const name = clean(it?.name ?? it?.title, SKILL_PACK_LIMITS.nameChars);
    const prompt = clean(it?.prompt ?? it?.content, SKILL_PACK_LIMITS.promptChars);
    if (name && prompt) out.push({ name, prompt });
  }
  if (!out.length) throw new Error("没有找到可用的提示词");
  return out;
}

export function exportSkillPack(name: string, prompts: SkillPrompt[]): string {
  return JSON.stringify({ name, version: 1, prompts }, null, 2);
}
