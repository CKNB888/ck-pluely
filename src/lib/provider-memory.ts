// ck-pluely v2.1.1: remember each provider's settings (model etc.) so switching
// providers — in Settings or the menu-bar panel — keeps what you set before.
// Secret fields are never stored here; they stay in the OS keychain per provider.
import { safeLocalStorage } from "@/lib/storage/helper";
import { loadSelectedWithSecrets } from "@/lib/secrets";

export type Kind = "ai" | "stt";
type Vars = Record<string, string>;
type Memory = Record<Kind, Record<string, { variables: Vars; models?: string[]; at?: number }>>;

export const PROVIDER_MEMORY_KEY = "ck_provider_memory";
const SECRET = /(api[_-]?key|token|secret|password)/i;

function read(): Memory {
  try {
    const m = JSON.parse(safeLocalStorage.getItem(PROVIDER_MEMORY_KEY) || "{}");
    return { ai: m?.ai ?? {}, stt: m?.stt ?? {} };
  } catch {
    return { ai: {}, stt: {} };
  }
}

export function publicVars(v: Vars): Vars {
  const out: Vars = {};
  for (const [k, val] of Object.entries(v || {})) out[k] = SECRET.test(k) ? "" : val;
  return out;
}

export function rememberProvider(kind: Kind, provider: string, variables: Vars, now = Date.now()) {
  if (!provider) return;
  const m = read();
  const prev = m[kind][provider];
  const model = variables?.model || variables?.MODEL;
  const models = [...(model ? [model] : []), ...(prev?.models ?? []).filter((x) => x !== model)].slice(0, 8);
  m[kind][provider] = { variables: publicVars(variables), models, at: now };
  safeLocalStorage.setItem(PROVIDER_MEMORY_KEY, JSON.stringify(m));
}

/** Providers the user has configured before, most recent first. */
export function rememberedProviders(kind: Kind): { provider: string; models: string[]; variables: Vars }[] {
  return Object.entries(read()[kind])
    .sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0))
    .map(([provider, v]) => ({ provider, models: v.models ?? [], variables: v.variables ?? {} }));
}

/** Saved settings for a provider, with keys filled from the keychain. */
export async function recallProvider(kind: Kind, provider: string): Promise<Vars> {
  const mem = read()[kind][provider];
  if (!mem) return {};
  try {
    const full = await loadSelectedWithSecrets(kind, JSON.stringify({ provider, variables: mem.variables, __ckKeychain: true }));
    return full.variables;
  } catch {
    return { ...mem.variables };
  }
}
