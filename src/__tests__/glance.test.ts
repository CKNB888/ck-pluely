import { describe, expect, it } from "vitest";
import { splitGlance } from "@/lib/glance";

describe("glance layout", () => {
  const md = "**顶点在 x=-b/2a**\n\n- 配方得到 ==顶点式==\n- 开口向上取最小值\n- a<0 取最大值\n- 判别式决定交点\n- 第五条\n\n### 推导\n详细过程";
  it("keeps conclusion + up to 4 points, folds the rest", () => {
    const { head, detail } = splitGlance(md);
    expect(head.split("\n").filter((l) => l.startsWith("- ")).length).toBe(4);
    expect(head.startsWith("**顶点")).toBe(true);
    expect(detail.startsWith("- 第五条")).toBe(true);
  });
  it("head is a stable prefix while streaming", () => {
    const full = splitGlance(md).head;
    for (let n = 10; n < md.length; n += 7) {
      const h = splitGlance(md.slice(0, n)).head;
      expect(full.startsWith(h.trimEnd()) || h.startsWith(full)).toBe(true);
    }
  });
  it("short answers are not folded; open code fences are not split", () => {
    expect(splitGlance("一句话答案").detail).toBe("");
    expect(splitGlance("结论\n```py\nx=1\n").detail).toBe("");
  });
});
