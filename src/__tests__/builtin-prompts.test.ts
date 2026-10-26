import { describe, it, expect, beforeEach } from "vitest";
const mem: Record<string, string> = {};
(globalThis as any).window ??= globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in mem ? mem[k] : null),
  setItem: (k: string, v: string) => { mem[k] = String(v); },
  removeItem: (k: string) => { delete mem[k]; },
  key: (i: number) => Object.keys(mem)[i] ?? null,
  get length() { return Object.keys(mem).length; },
};
import { BUILTIN_PROMPTS, builtinPromptText, saveBuiltinOverride, resetBuiltin, isBuiltinEdited } from "@/lib/builtin-prompts";

describe("built-in prompt library", () => {
  beforeEach(() => { for (const k of Object.keys(mem)) delete mem[k]; });
  it("has unique ids, covers the scenarios, and stays compact", () => {
    const ids = BUILTIN_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["class", "class-math", "meeting", "minutes", "interview", "translate", "summary"]) expect(ids).toContain(id);
    for (const p of BUILTIN_PROMPTS) expect(p.prompt.length).toBeLessThan(500);
  });
  it("edit overrides, persists in localStorage (so backups carry it), and resets", () => {
    saveBuiltinOverride("meeting", "我的版本");
    expect(builtinPromptText("meeting")).toBe("我的版本");
    expect(isBuiltinEdited("meeting")).toBe(true);
    expect(mem["ck_builtin_prompt_overrides"]).toContain("我的版本");
    resetBuiltin("meeting");
    expect(builtinPromptText("meeting")).toBe(BUILTIN_PROMPTS.find((p) => p.id === "meeting")!.prompt);
  });
});
