import { AI_PROVIDERS } from "@/config/ai-providers.constants";
import { SPEECH_TO_TEXT_PROVIDERS } from "@/config/stt.constants";
import { STORAGE_KEYS } from "@/config/constants";

const SECRET = /(api[_-]?key|token|secret|password)/i;

type P = { id?: string; curl?: string };

/** Keychain accounts the app may have written: `${kind}:${provider}:${var}`. */
export function secretAccounts(ai: P[], stt: P[]): string[] {
  const out = new Set<string>();
  const add = (kind: "ai" | "stt", list: P[]) => {
    for (const p of list) {
      if (!p?.id || !p.curl) continue;
      for (const m of p.curl.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)) {
        const key = m[1].toLowerCase();
        if (SECRET.test(key)) out.add(`${kind}:${p.id}:${key}`);
      }
    }
  };
  add("ai", ai);
  add("stt", stt);
  return [...out].sort();
}

const readList = (key: string): P[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export function allSecretAccounts(): string[] {
  return secretAccounts(
    [...(AI_PROVIDERS as P[]), ...readList(STORAGE_KEYS.CUSTOM_AI_PROVIDERS)],
    [...(SPEECH_TO_TEXT_PROVIDERS as P[]), ...readList(STORAGE_KEYS.CUSTOM_SPEECH_PROVIDERS)]
  );
}
