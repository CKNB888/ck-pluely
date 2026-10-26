import { describe, expect, it } from "vitest";
import { exportSkillPack, parseSkillPack, SKILL_PACK_LIMITS } from "@/lib/skill-pack";

describe("skill pack", () => {
  it("parses JSON packs and round-trips export", () => {
    const text = exportSkillPack("物理", [{ name: "力学", prompt: "解释受力" }]);
    expect(parseSkillPack(text)).toEqual([{ name: "力学", prompt: "解释受力" }]);
  });
  it("parses SKILL.md with frontmatter", () => {
    const md = "---\nname: 作文批改\ndescription: x\n---\n按评分标准批改";
    expect(parseSkillPack(md, "SKILL.md")).toEqual([{ name: "作文批改", prompt: "按评分标准批改" }]);
  });
  it("drops bad entries, caps counts and lengths", () => {
    const prompts = Array.from({ length: 80 }, (_, i) => ({ name: `p${i}`, prompt: i === 0 ? "x".repeat(9000) : "y" }));
    const out = parseSkillPack(JSON.stringify({ prompts: [{ name: "", prompt: "a" }, ...prompts] }));
    expect(out.length).toBe(SKILL_PACK_LIMITS.prompts - 1);
    expect(out[0].prompt.length).toBe(SKILL_PACK_LIMITS.promptChars);
  });
  it("rejects garbage and oversized files", () => {
    expect(() => parseSkillPack("{oops")).toThrow();
    expect(() => parseSkillPack(JSON.stringify({ prompts: [] }))).toThrow();
    expect(() => parseSkillPack("x".repeat(300 * 1024))).toThrow();
  });
});
