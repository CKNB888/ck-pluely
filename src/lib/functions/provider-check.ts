// ck-pluely: "测试连接" + model-list fetch for any curl-defined provider.
// Uses GET {base}/models: costs no tokens, validates URL + auth headers.
import curl2Json from "@bany/curl-to-json";
import { t } from "@/i18n";
import { deepVariableReplacer } from "./common.function";
import { ckFetch, extractProviderError, friendlyHttpError } from "./net";

const SUFFIXES = [
  /\/chat\/completions\/?$/,
  /\/audio\/transcriptions\/?$/,
  /\/messages\/?$/,
  /\/chat\/?$/,
  /\/responses\/?$/,
];

/** Derive the `/models` URL from a request URL; null when it can't be guessed. */
export function modelsUrlFor(requestUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(requestUrl);
  } catch {
    return null;
  }
  u.search = "";
  for (const re of SUFFIXES) {
    if (re.test(u.pathname)) {
      u.pathname = u.pathname.replace(re, "") + "/models";
      return u.toString();
    }
  }
  return null;
}

/** Parse ids from OpenAI `{data:[{id}]}`, Gemini/Cohere `{models:[{name|id}]}`, Ollama. */
export function parseModelIds(json: any): string[] {
  const list: any[] = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.models)
      ? json.models
      : Array.isArray(json)
        ? json
        : [];
  const ids = list
    .map((m) => (typeof m === "string" ? m : m?.id ?? m?.name ?? m?.model))
    .filter((x): x is string => typeof x === "string" && !!x)
    .map((x) => x.replace(/^models\//, ""));
  return Array.from(new Set(ids)).sort();
}

export interface ProviderCheckResult {
  ok: boolean;
  message: string;
  models: string[];
}

export async function checkProvider(
  curl: string,
  variables: Record<string, string>,
  timeoutMs = 15000
): Promise<ProviderCheckResult> {
  const vars = Object.fromEntries(
    Object.entries(variables || {}).map(([k, v]) => [k.toUpperCase(), v])
  );
  let json: any;
  try {
    json = curl2Json(curl);
  } catch {
    return { ok: false, message: t("Invalid cURL command"), models: [] };
  }
  const url = deepVariableReplacer(json?.url || "", vars) as string;
  const modelsUrl = modelsUrlFor(url);
  if (!modelsUrl) {
    return {
      ok: false,
      message: t("This provider does not support connection test; enter the model name manually."),
      models: [],
    };
  }
  const headers: Record<string, string> = deepVariableReplacer(json?.header || {}, vars);
  delete headers["Content-Type"];
  delete headers["content-type"];
  // Gemini's OpenAI-compatible endpoint also accepts ?key=; keep Bearer.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await ckFetch(modelsUrl, { method: "GET", headers, signal: ctrl.signal }, 0);
    const text = await res.text();
    if (res.ok) {
      let models: string[] = [];
      try {
        models = parseModelIds(JSON.parse(text));
      } catch {
        /* not JSON */
      }
      return {
        ok: true,
        message: models.length
          ? t("Connected. {{v0}} models available.", { v0: models.length })
          : t("Connected."),
        models,
      };
    }
    if (res.status === 404 || res.status === 405) {
      return {
        ok: true,
        message: t("Endpoint reachable, but it has no model list; enter the model name manually."),
        models: [],
      };
    }
    const friendly = friendlyHttpError(res.status);
    const detail = extractProviderError(text);
    return {
      ok: false,
      message: [friendly ?? `HTTP ${res.status}`, detail].filter(Boolean).join(" — "),
      models: [],
    };
  } catch (e: any) {
    if (e?.name === "AbortError")
      return { ok: false, message: t("Connection timed out. Check your network or proxy."), models: [] };
    return { ok: false, message: e?.message || String(e), models: [] };
  } finally {
    clearTimeout(timer);
  }
}
