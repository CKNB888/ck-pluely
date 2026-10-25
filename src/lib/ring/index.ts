/**
 * Bounded in-memory history for long live sessions (system audio can run for
 * hours). Messages are stored newest-first; only the newest `max` are kept in
 * React state. Persistence is append-only (see appendConversationMessages), so
 * trimming memory never deletes saved history.
 */
export const LIVE_MAX_MESSAGES = 200;

export function capNewestFirst<T>(items: T[], max = LIVE_MAX_MESSAGES): T[] {
  return items.length > max ? items.slice(0, max) : items;
}

/** Ids not yet persisted, and the persisted-id set pruned to what is still in
 *  memory (keeps the set bounded too). */
export function diffUnsaved<T extends { id: string }>(
  items: T[],
  persisted: Set<string>
): { fresh: T[]; prune: (saved: T[]) => Set<string> } {
  const fresh = items.filter((m) => !persisted.has(m.id));
  return {
    fresh,
    prune: (saved) => {
      const live = new Set(items.map((m) => m.id));
      const next = new Set<string>();
      for (const id of persisted) if (live.has(id)) next.add(id);
      for (const m of saved) next.add(m.id);
      return next;
    },
  };
}
