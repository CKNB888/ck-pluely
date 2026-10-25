import { invoke } from "@tauri-apps/api/core";
import { safeLocalStorage } from "@/lib/storage/helper";

/**
 * ck-pluely: provider API keys live in the OS keychain (macOS Keychain,
 * Windows Credential Manager, Linux Secret Service). localStorage only keeps
 * the non-secret fields plus a marker. If the keychain is unavailable we fall
 * back to the old localStorage behaviour so the app keeps working.
 */
type Selected = { provider: string; variables: Record<string, string> };
type Kind = "ai" | "stt";

const MARKER = "__ckKeychain";
const SECRET_KEY = /(api[_-]?key|token|secret|password)/i;

const account = (kind: Kind, provider: string, key: string) =>
  `${kind}:${provider}:${key}`;

const isSecret = (key: string) => SECRET_KEY.test(key);

/** Read a saved selection and fill secret fields from the keychain. */
export async function loadSelectedWithSecrets(
  kind: Kind,
  raw: string
): Promise<Selected> {
  const parsed = JSON.parse(raw) as Selected & { [MARKER]?: boolean };
  const usesKeychain = parsed[MARKER] === true;
  delete parsed[MARKER];
  const variables = { ...(parsed.variables || {}) };
  if (usesKeychain && parsed.provider) {
    for (const key of Object.keys(variables)) {
      if (!isSecret(key) || variables[key]) continue;
      try {
        const v = await invoke<string | null>("ck_secret_get", {
          account: account(kind, parsed.provider, key),
        });
        if (v) variables[key] = v;
      } catch (e) {
        console.warn("keychain read failed:", e);
      }
    }
  }
  return { ...parsed, variables };
}

/**
 * Persist a selection: secrets go to the keychain, the rest to localStorage.
 * Plaintext keys from older versions are migrated the first time this runs.
 */
let saveQueue: Promise<void> = Promise.resolve();

export function saveSelectedWithSecrets(
  kind: Kind,
  storageKey: string,
  selected: Selected
): Promise<void> {
  // Serialise writes so fast typing cannot leave an older key in the keychain.
  saveQueue = saveQueue
    .then(() => doSave(kind, storageKey, selected))
    .catch((e) => console.warn("saving provider failed:", e));
  return saveQueue;
}

async function doSave(
  kind: Kind,
  storageKey: string,
  selected: Selected
): Promise<void> {
  const variables = { ...(selected.variables || {}) };
  let keychainOk = true;
  for (const [key, value] of Object.entries(variables)) {
    if (!isSecret(key)) continue;
    const acc = account(kind, selected.provider, key);
    try {
      if (value) {
        await invoke("ck_secret_set", { account: acc, value });
      } else {
        await invoke("ck_secret_delete", { account: acc });
      }
      variables[key] = "";
    } catch (e) {
      console.warn("keychain unavailable, keeping key in localStorage:", e);
      keychainOk = false;
      break;
    }
  }
  const toStore = keychainOk
    ? { ...selected, variables, [MARKER]: true }
    : selected;
  safeLocalStorage.setItem(storageKey, JSON.stringify(toStore));
}
