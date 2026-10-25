/**
 * 密钥加密：PBKDF2-SHA256（31 万次）派生 AES-256-GCM 密钥。
 * 只在用户勾选「包含 API Key」并设置口令时使用；口令不保存。
 */
export const KDF_ITERATIONS = 310_000;

export interface EncryptedBlob {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iter: number;
  salt: string;
  iv: string;
  data: string;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iter: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSecrets(secrets: Record<string, string>, password: string, iter = KDF_ITERATIONS): Promise<string> {
  if (password.length < 6) throw new Error("口令至少 6 位");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt, iter);
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(JSON.stringify(secrets)))
  );
  const blob: EncryptedBlob = { v: 1, kdf: "PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv), data: b64(data) };
  return JSON.stringify(blob);
}

export async function decryptSecrets(blobJson: string, password: string): Promise<Record<string, string>> {
  let blob: EncryptedBlob;
  try {
    blob = JSON.parse(blobJson);
  } catch {
    throw new Error("密钥数据已损坏");
  }
  if (blob.v !== 1) throw new Error("密钥数据版本不受支持");
  const key = await derive(password, unb64(blob.salt), blob.iter);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv) as BufferSource }, key, unb64(blob.data) as BufferSource);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error("口令不正确");
  }
}
