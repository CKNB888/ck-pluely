import fs from "fs";
/** Keys are read at runtime only and never printed. */
export function loadKeys(): string[] {
  const f = process.env.GROQ_KEYS_FILE;
  if (!f || !fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
export const mask = (k: string) => `gsk_****${k.slice(-4)}`;
