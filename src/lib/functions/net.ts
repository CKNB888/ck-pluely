// ck-pluely: one network path for AI/STT requests.
// Uses the Tauri HTTP plugin (Rust side, no CORS, honours HTTP(S)_PROXY env),
// validates the URL scheme, retries transient failures, and falls back to the
// WebView fetch only if the plugin itself fails to connect.
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke, Channel } from "@tauri-apps/api/core";
import { t } from "@/i18n";

// --- Pooled native transport (src-tauri/src/net.rs) -------------------------
// One shared HTTP/2 keep-alive client on the Rust side instead of a fresh
// connection per request; the body streams back over a Channel.
let nextId = 1;
const isTauri = () => typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

async function bodyToPayload(init: RequestInit): Promise<{ text?: string; bytes?: Uint8Array; contentType?: string }> {
  const b = init.body;
  if (b == null) return {};
  if (typeof b === "string") return { text: b };
  // FormData / Blob / URLSearchParams / ArrayBuffer → bytes (+ multipart boundary)
  const r = new Request("http://x/", { method: "POST", body: b as BodyInit });
  return { bytes: new Uint8Array(await r.arrayBuffer()), contentType: r.headers.get("content-type") || undefined };
}

export async function nativeFetch(url: string, init: RequestInit & { signal?: AbortSignal | null; timeoutMs?: number }): Promise<Response> {
  const id = nextId++;
  const headers: [string, string][] = [];
  new Headers(init.headers || {}).forEach((v, k) => headers.push([k, v]));
  const p = await bodyToPayload(init);
  if (p.contentType && !headers.some(([k]) => k === "content-type")) headers.push(["content-type", p.contentType]);
  if (p.bytes) await invoke("ck_http_body", p.bytes, { headers: { "x-ck-id": String(id) } });
  return new Promise<Response>((resolve, reject) => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    let headDone = false;
    const stream = new ReadableStream<Uint8Array>({
      start: (c) => { ctrl = c; },
      cancel: () => { invoke("ck_http_abort", { id }).catch(() => {}); },
    });
    const onAbort = () => {
      invoke("ck_http_abort", { id }).catch(() => {});
      const e = new DOMException("Aborted", "AbortError");
      if (!headDone) reject(e); else try { ctrl.error(e); } catch { /* closed */ }
    };
    init.signal?.addEventListener("abort", onAbort, { once: true });
    const ch = new Channel<any>();
    ch.onmessage = (m: any) => {
      if (m instanceof ArrayBuffer || ArrayBuffer.isView(m)) {
        try { ctrl.enqueue(m instanceof ArrayBuffer ? new Uint8Array(m) : new Uint8Array((m as any).buffer)); } catch { /* closed */ }
        return;
      }
      const ev = typeof m === "string" ? JSON.parse(m) : m;
      if (ev.type === "Head") {
        headDone = true;
        const nullBody = ev.status === 204 || ev.status === 304 || (init.method || "GET").toUpperCase() === "HEAD";
        resolve(new Response(nullBody ? null : stream, { status: ev.status, statusText: ev.statusText, headers: ev.headers }));
      } else if (ev.type === "End") {
        init.signal?.removeEventListener("abort", onAbort);
        try { ctrl.close(); } catch { /* closed */ }
      } else if (ev.type === "Error") {
        init.signal?.removeEventListener("abort", onAbort);
        const err = new Error(ev.message);
        if (!headDone) reject(err); else try { ctrl.error(err); } catch { /* closed */ }
      }
    };
    invoke("ck_http_fetch", {
      req: { id, url, method: init.method || "GET", headers, body: p.text, rawBody: !!p.bytes, timeoutMs: init.timeoutMs },
      onEvent: ch,
    }).catch(reject);
  });
}

/** Open connections to provider hosts ahead of the first question. */
export function prewarm(urls: (string | undefined)[]) {
  const list = Array.from(new Set(urls.filter((u): u is string => !!u && /^https?:/i.test(u))));
  if (!list.length || !isTauri()) return;
  invoke("ck_http_prewarm", { urls: list }).catch(() => {});
}

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
        res = isTauri() ? await nativeFetch(url, init) : await fetch(url, init);
      } catch (e: any) {
        if (init.signal?.aborted || e?.name === "AbortError") throw e;
        // Pooled path failed to start → plugin path, then WebView fetch.
        try {
          res = await tauriFetch(url, { ...init, connectTimeout: 10000 } as any);
        } catch (e2: any) {
          if (init.signal?.aborted || e2?.name === "AbortError") throw e2;
          res = await fetch(url, init);
        }
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

/** First http(s) URL in a provider curl template, with {{VARS}} filled. */
export function urlFromCurl(curl: string | undefined, vars: Record<string, string> = {}): string | undefined {
  const m = (curl || "").match(/https?:\/\/[^\s"'\\]+/);
  if (!m) return undefined;
  const u = m[0].replace(/\{\{\s*([A-Z_0-9]+)\s*\}\}/gi, (_, k) => vars[k] ?? vars[k.toLowerCase()] ?? "x");
  try { return new URL(u).origin + "/"; } catch { return undefined; }
}

let lastWarm = 0;
let warmUrls: string[] = [];
/** Remember the selected providers' hosts and warm them (throttled to 20 s). */
export function prewarmProviders(urls?: (string | undefined)[], force = false) {
  if (urls) warmUrls = urls.filter((u): u is string => !!u);
  if (!force && Date.now() - lastWarm < 20000) return;
  lastWarm = Date.now();
  prewarm(warmUrls);
}
