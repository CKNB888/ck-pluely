import { describe, it, expect } from "vitest";
import { capNewestFirst, diffUnsaved, LIVE_MAX_MESSAGES } from ".";

const msg = (i: number) => ({ id: `m${i}`, content: "x".repeat(200) });

describe("bounded live history", () => {
  it("keeps only the newest N (newest-first order)", () => {
    let list: { id: string; content: string }[] = [];
    for (let i = 0; i < 10_000; i++) list = capNewestFirst([msg(i), ...list]);
    expect(list.length).toBe(LIVE_MAX_MESSAGES);
    expect(list[0].id).toBe("m9999");
    expect(list[list.length - 1].id).toBe(`m${10_000 - LIVE_MAX_MESSAGES}`);
  });

  it("persists every message exactly once while memory stays bounded", () => {
    const db: string[] = [];
    let persisted = new Set<string>();
    let list: { id: string; content: string }[] = [];
    for (let i = 0; i < 5_000; i++) {
      list = capNewestFirst([msg(i), ...list]);
      if (i % 3 === 0) {
        const { fresh, prune } = diffUnsaved(list, persisted);
        db.push(...fresh.map((m) => m.id));
        persisted = prune(fresh);
        expect(persisted.size).toBeLessThanOrEqual(LIVE_MAX_MESSAGES);
      }
    }
    const { fresh } = diffUnsaved(list, persisted);
    db.push(...fresh.map((m) => m.id));
    expect(db.length).toBe(5_000);
    expect(new Set(db).size).toBe(5_000);
  });
});
