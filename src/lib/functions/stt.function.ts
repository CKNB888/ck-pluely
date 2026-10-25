import { t } from "@/i18n";
import {
  deepVariableReplacer,
  getByPath,
  blobToBase64,
} from "./common.function";
import { ckFetch, extractProviderError, friendlyHttpError, withKeyRotation } from "./net";
import { cleanTranscript, isSilentClip, wavStats, STT_MAX_BYTES } from "./stt-post";

const STT_TIMEOUT_MS = 30_000;
import { invoke } from "@tauri-apps/api/core";

import { TYPE_PROVIDER } from "@/types";
import curl2Json from "@bany/curl-to-json";
import { shouldUsePluelyAPI } from "./pluely.api";

// Pluely STT function
async function fetchPluelySTT(audio: File | Blob): Promise<string> {
  try {
    // Convert audio to base64
    const audioBase64 = await blobToBase64(audio);

    // Call Tauri command
    const response = await invoke<{
      success: boolean;
      transcription?: string;
      error?: string;
    }>("transcribe_audio", {
      audioBase64,
    });

    if (response.success && response.transcription) {
      return response.transcription;
    } else {
      return response.error || "Transcription failed";
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Pluely STT Error: ${errorMessage}`;
  }
}

export interface STTParams {
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  audio: File | Blob;
}

/**
 * Transcribes audio and returns either the transcription or an error/warning message as a single string.
 */
export async function fetchSTT(params: STTParams): Promise<string> {
  let warnings: string[] = [];

  try {
    const { provider, selectedProvider, audio } = params;

    // Check if we should use Pluely API instead
    const usePluelyAPI = await shouldUsePluelyAPI();
    if (usePluelyAPI) {
      return await fetchPluelySTT(audio);
    }

    if (!provider) throw new Error(t("Provider not provided"));
    if (!selectedProvider) throw new Error(t("Selected provider not provided"));
    if (!audio) throw new Error("Audio file is required");

    let curlJson: any;
    try {
      curlJson = curl2Json(provider.curl);
    } catch (error) {
      throw new Error(
        `Failed to parse curl: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    // Validate audio file
    const file = audio as File;
    if (file.size === 0) throw new Error(t("Audio file is empty"));

    // Build variable map
    const allVariables = {
      ...Object.fromEntries(
        Object.entries(selectedProvider.variables).map(([key, value]) => [
          key.toUpperCase(),
          value,
        ])
      ),
    };

    // ck-pluely: skip clips that are too short / silent (Whisper invents
    // "Thank you." or subtitle credits for them) and enforce the 25 MB limit.
    const audioBuf = await audio.arrayBuffer();
    if (audioBuf.byteLength > STT_MAX_BYTES) {
      throw new Error(
        t("Audio is too large ({{v0}} MB). The limit is 25 MB; shorten the maximum recording length.", {
          v0: (audioBuf.byteLength / 1048576).toFixed(1),
        })
      );
    }
    if (isSilentClip(wavStats(audioBuf))) return "";

    // Build the request for one API key (several keys rotate on 401/429).
    const build = (key: string | undefined) => {
      const vars: Record<string, string> = { ...allVariables };
      if (key !== undefined) vars.API_KEY = key;
      let url = deepVariableReplacer(curlJson.url || "", vars);
      const headers = deepVariableReplacer(curlJson.header || {}, vars);
      const rawParams = curlJson.params || {};
      const decodedParams = Object.fromEntries(
        Object.entries(rawParams).map(([k, value]) => [
          k,
          typeof value === "string" ? decodeURIComponent(value) : "",
        ])
      );
      const queryString = new URLSearchParams(
        deepVariableReplacer(decodedParams, vars)
      ).toString();
      if (queryString) url += (url.includes("?") ? "&" : "?") + queryString;
      return { url, headers, formData: deepVariableReplacer(curlJson.form || {}, vars), vars };
    };

    const isBinaryUpload = provider.curl.includes("--data-binary");
    const isForm =
      provider.curl.includes("-F ") || provider.curl.includes("--form");
    const ext = /webm/.test(audio.type)
      ? "webm"
      : /mp4|m4a|aac/.test(audio.type)
        ? "m4a"
        : /ogg/.test(audio.type)
          ? "ogg"
          : /mpeg|mp3/.test(audio.type)
            ? "mp3"
            : "wav";

    const makeBody = (
      headers: Record<string, string>,
      formData: Record<string, unknown>,
      vars: Record<string, string>,
      audioB64: string
    ): { body: FormData | string | Blob; headers: Record<string, string> } => {
      const finalHeaders = { ...headers };
      if (isForm) {
        const form = new FormData();
        form.append("file", new Blob([audioBuf], { type: audio.type }), `audio.${ext}`);
        const headerKeys = Object.keys(headers).map((k) =>
          k.toUpperCase().replace(/[-_]/g, "")
        );
        for (const [key, val] of Object.entries(formData)) {
          if (typeof val !== "string") {
            if (!val || headerKeys.includes(key.toUpperCase()) || key.toUpperCase() === "AUDIO")
              continue;
            form.append(key.toLowerCase(), val as string | Blob);
            continue;
          }
          // Numeric keys come from curl2json's array-like parsing of -F.
          if (!isNaN(parseInt(key, 10))) {
            const [formKey, ...formValueParts] = val.split("=");
            const formValue = formValueParts.join("=");
            if (formKey.toLowerCase() === "file") continue;
            if (!formValue || headerKeys.includes(formKey.toUpperCase().replace(/[-_]/g, "")))
              continue;
            form.append(formKey, formValue);
          } else {
            if (key.toLowerCase() === "file") continue;
            if (!val || headerKeys.includes(key.toUpperCase()) || key.toUpperCase() === "AUDIO")
              continue;
            form.append(key.toLowerCase(), val);
          }
        }
        delete finalHeaders["Content-Type"];
        return { body: form, headers: finalHeaders };
      }
      if (isBinaryUpload) {
        return { body: new Blob([audioBuf], { type: audio.type }), headers: finalHeaders };
      }
      // Google-style: JSON payload with base64
      const dataObj = curlJson.data ? { ...curlJson.data } : {};
      return {
        body: JSON.stringify(deepVariableReplacer(dataObj, { ...vars, AUDIO: audioB64 })),
        headers: finalHeaders,
      };
    };
    const audioB64 = !isForm && !isBinaryUpload ? await blobToBase64(audio) : "";

    // ck-pluely: the request itself times out (the caller's 30 s race used
    // to leave the upload running in the background).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
    const rawKey = allVariables.API_KEY;
    let response: Response;
    try {
      response = await withKeyRotation(
        `stt:${provider.id ?? selectedProvider.provider}`,
        rawKey,
        (key, isLast) => {
          const { url, headers, formData, vars } = build(rawKey === undefined ? undefined : key);
          const req = makeBody(headers, formData, vars, audioB64);
          return ckFetch(
            url,
            {
              method: curlJson.method || "POST",
              headers: req.headers,
              body: curlJson.method === "GET" ? undefined : req.body,
              signal: controller.signal,
            },
            2,
            { retryRateLimit: isLast }
          );
        }
      );
    } catch (e) {
      if (controller.signal.aborted) {
        throw new Error(t("Speech transcription timed out (30s)"));
      }
      throw new Error(
        t("Network error: {{v0}}. Check your connection or proxy.", {
          v0: e instanceof Error ? e.message : String(e),
        })
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let errText = "";
      try {
        errText = await response.text();
      } catch {}
      const errMsg = extractProviderError(errText) || response.statusText;
      const hint = friendlyHttpError(response.status);
      throw new Error(`${hint ? hint + " " : ""}HTTP ${response.status}: ${errMsg}`);
    }

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      return [...warnings, responseText.trim()].filter(Boolean).join("; ");
    }

    // Extract transcription
    const rawPath = provider.responseContentPath || "text";
    const path = rawPath.charAt(0).toLowerCase() + rawPath.slice(1);
    const transcription = cleanTranscript(String(getByPath(data, path) || ""));

    if (!transcription) {
      // Silence / no speech: return nothing so it is never treated as speech.
      return "";
    }

    // Return transcription with any warnings
    return [...warnings, transcription].filter(Boolean).join("; ");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg);
  }
}
