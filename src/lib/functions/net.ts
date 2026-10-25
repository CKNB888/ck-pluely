// ck-pluely: one network path for AI/STT requests.
// Uses the Tauri HTTP plugin (Rust side, no CORS, honours HTTP(S)_PROXY env),
// validates the URL scheme, retries transient failures, and falls back to the
// WebView fetch only if the plugin itself fails to connect.
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { t } from "@/i18n";

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

export function assertHttpUrl(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(t("Invalid endpoint URL: {{v0}}", { v0: url }));
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error(t("Only http(s) endpoints are allowed: {{v0}}", { v0: url }));
  }
}

export function friendlyHttpError(status: number): string | null {
  if (status === 401 || status === 403)
    return t("Authentication failed (HTTP {{v0}}). Check your API key.", { v0: status });
  if (status === 400) return t("Bad request (HTTP 400). Check the model name and request parameters.");
  if (status === 404) return t("Endpoint or model not found (HTTP 404). Check the URL and model name.");
  if (status === 429) return t("Rate limited or out of quota (HTTP 429). Try again later.");
  if (status >= 500) return t("Provider server error (HTTP {{v0}}). Try again later.", { v0: status });
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds from a Retry-After header (delta or HTTP date), capped. */
export function retryAfterMs(res: Response, fallback: number, cap = 8000): number {
  const h = res.headers?.get?.("retry-after");
  if (!h) return fallback;
  const n = Number(h);
  const ms = Number.isFinite(n) ? n * 1000 : Date.parse(h) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, cap) : fallback;
}

export async function ckFetch(
  url: string,
  init: RequestInit & { signal?: AbortSignal | null },
  retries = 2,
  opts: { retryRateLimit?: boolean } = {}
): Promise<Response> {
  assertHttpUrl(url);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      let res: Response;
      try {
        res = await tauriFetch(url, { ...init, connectTimeout: 10000 } as any);
      } catch (e: any) {
        if (init.signal?.aborted || e?.name === "AbortError") throw e;
        // Plugin unavailable (e.g. browser dev) → WebView fetch.
        res = await fetch(url, init);
      }
      const retryable =
        RETRY_STATUS.has(res.status) &&
        !(res.status === 429 && opts.retryRateLimit === false);
      if (retryable && attempt < retries) {
        const wait = retryAfterMs(res, 800 * 2 ** attempt);
        res.body?.cancel().catch(() => {});
        await sleep(wait);
        continue;
      }
      return res;
    } catch (e: any) {
      if (init.signal?.aborted || e?.name === "AbortError") throw e;
      lastErr = e;
      if (attempt < retries) await sleep(800 * 2 ** attempt);
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(t("Network error: {{v0}}. Check your connection or proxy.", { v0: msg }));
}

/** Pull a human-readable message out of a provider error body (OpenAI/Groq/
 * DeepSeek `{error:{message}}`, Mistral `{detail}`, SiliconFlow/Cohere
 * `{message}`, Gemini `[{error:{message}}]`). Falls back to the raw text. */
export function extractProviderError(text: string): string {
  const raw = (text || "").trim();
  if (!raw) return "";
  try {
    let j: any = JSON.parse(raw);
    if (Array.isArray(j)) j = j[0];
    const m =
      (typeof j?.error === "string" ? j.error : j?.error?.message) ??
      j?.message ??
      (typeof j?.detail === "string" ? j.detail : j?.detail?.[0]?.msg);
    if (typeof m === "string" && m) return m;
  } catch {
    // not JSON
  }
  return raw.length > 300 ? raw.slice(0, 300) + "…" : raw;
}

// --- Multiple API keys per provider ----------------------------------------
// The API key field may hold several keys separated by commas, spaces or new
// lines. On 401/403/429 the next key is tried immediately; the key that last
// worked is remembered per provider so later requests start with it.

const keyCursor = new Map<string, number>();
const ROTATE_STATUS = new Set([401, 403, 429]);

export function splitApiKeys(value: string | undefined): string[] {
  const parts = (value || "").split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean);
  return Array.from(new Set(parts));
}

/** Mask a key for logs/UI: gsk_****abcd. */
export function maskKey(key: string): string {
  const m = key.match(/^([A-Za-z]+[-_])/);
  return `${m ? m[1] : ""}****${key.slice(-4)}`;
}

export async function withKeyRotation(
  scope: string,
  rawKey: string | undefined,
  run: (key: string, isLast: boolean) => Promise<Response>
): Promise<Response> {
  const keys = splitApiKeys(rawKey);
  if (keys.length <= 1) return run(keys[0] ?? rawKey ?? "", true);
  const start = (keyCursor.get(scope) ?? 0) % keys.length;
  let res: Response | undefined;
  for (let i = 0; i < keys.length; i++) {
    const idx = (start + i) % keys.length;
    const isLast = i === keys.length - 1;
    res = await run(keys[idx], isLast);
    if (!isLast && ROTATE_STATUS.has(res.status)) {
      res.body?.cancel().catch(() => {});
      keyCursor.set(scope, (idx + 1) % keys.length);
      continue;
    }
    keyCursor.set(scope, idx);
    return res;
  }
  return res as Response;
}
