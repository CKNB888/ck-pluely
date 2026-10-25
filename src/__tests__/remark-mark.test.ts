import { describe, it, expect } from "vitest";
import { splitMarks } from "@/components/Markdown/remark-mark";
describe("==mark==", () => {
  it("splits", () => {
    const out = splitMarks("牛顿第二定律 ==F=ma== 和 ==加速度==。")!;
    expect(out.map((n) => n.type)).toEqual(["text", "mark", "text", "mark", "text"]);
    expect(out[3].children[0].value).toBe("加速度");
  });
  it("ignores plain and a==b", () => {
    expect(splitMarks("没有标记")).toBeNull();
    expect(splitMarks("if (a == b)")).toBeNull();
  });
});
