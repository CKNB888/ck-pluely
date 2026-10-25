import { invoke } from "@tauri-apps/api/core";
import { allSecretAccounts } from "@/lib/uninstall";
import {
  buildSettings,
  diffSettings,
  migrateSettings,
  EXCLUDED_KEYS,
  type DiffSummary,
  type StorageMap,
} from "./format";
import { decryptSecrets, encryptSecrets } from "./crypto";

export * from "./format";
export * from "./crypto";

export const LAST_VERSION_KEY = "ck_last_app_version";

export interface ExportOptions {
  includeVoiceprint: boolean;
  includeModels: boolean;
  /** 设置后会用口令加密并包含 API Key。 */
  password?: string;
}

export interface ExportSummary {
  path: string;
  bytes: number;
  contents: string[];
}

export interface Inspection {
  staging: string;
  manifest: { app: string; schemaVersion: number; appVersion: string; createdAt: number; contents: string[] };
  settingsJson: string | null;
  secretsEnc: string | null;
  dbCounts: Record<string, number>;
  hasVoiceprint: boolean;
  hasLocalSettings: boolean;
  models: { file: string; size: number; sha256: string }[];
  modelFilesIncluded: boolean;
  newerThanApp: boolean;
}

export interface Preview {
  inspection: Inspection;
  storage: StorageMap;
  diff: DiffSummary;
  migratedFrom: number;
  migrationSteps: number[];
}

export function readLocalStorage(): StorageMap {
  const out: StorageMap = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k !== null) out[k] = localStorage.getItem(k) ?? "";
  }
  return out;
}

async function collectSecrets(stripped: Record<string, string>) {
  const out: Record<string, string> = { ...stripped };
  for (const acc of allSecretAccounts()) {
    try {
      const v = await invoke<string | null>("ck_secret_get", { account: acc });
      if (v) out[`keychain:${acc}`] = v;
    } catch {
      /* 钥匙串不可用时跳过 */
    }
  }
  return out;
}

/** 导出。`path` 为空时写入自动备份目录。 */
export async function exportBackup(
  opts: ExportOptions,
  path?: string,
  kind?: "auto" | "pre-import" | "pre-upgrade"
): Promise<ExportSummary> {
  const { settings, strippedSecrets } = buildSettings(readLocalStorage());
  let secretsEnc: string | null = null;
  if (opts.password) {
    secretsEnc = await encryptSecrets(await collectSecrets(strippedSecrets), opts.password);
  }
  return invoke<ExportSummary>("ck_backup_export", {
    path: path ?? null,
    kind: kind ?? null,
    settingsJson: JSON.stringify(settings),
    options: {
      includeVoiceprint: opts.includeVoiceprint,
      includeModels: opts.includeModels,
      secretsEnc,
    },
  });
}

/** 读取并校验备份，返回预览；不修改任何数据。 */
export async function previewBackup(path: string, merge: boolean): Promise<Preview> {
  const inspection = await invoke<Inspection>("ck_backup_inspect", { path });
  let raw: unknown = {};
  try {
    raw = JSON.parse(inspection.settingsJson ?? "{}");
  } catch {
    throw new Error("备份中的设置无法解析");
  }
  const m = migrateSettings(inspection.manifest.schemaVersion, raw);
  return {
    inspection,
    storage: m.settings.storage,
    diff: diffSettings(readLocalStorage(), m.settings.storage, merge),
    migratedFrom: m.from,
    migrationSteps: m.steps,
  };
}

export interface ApplyOptions {
  merge: boolean;
  database: boolean;
  voiceprint: boolean;
  models: boolean;
  /** 备份含加密密钥时填写口令即可一起恢复。 */
  password?: string;
}

export interface ApplyResult {
  rows: Record<string, number>;
  settings: number;
  secrets: number;
  safetyBackup: string;
}

function writeStorage(storage: StorageMap, merge: boolean) {
  if (!merge) {
    const keep = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && EXCLUDED_KEYS.has(k)) keep.add(k);
    }
    const snapshot: StorageMap = {};
    for (const k of keep) snapshot[k] = localStorage.getItem(k) ?? "";
    localStorage.clear();
    for (const [k, v] of Object.entries(snapshot)) localStorage.setItem(k, v);
  }
  for (const [k, v] of Object.entries(storage)) {
    if (!EXCLUDED_KEYS.has(k)) localStorage.setItem(k, v);
  }
}

/**
 * 应用恢复：
 * 1. 先把当前数据自动备份（pre-import）；
 * 2. 解密密钥（口令错误时在改动任何数据前就失败）；
 * 3. 数据库在一个事务里替换 / 合并；
 * 4. 写入设置与密钥；任何一步失败，用第 1 步的备份恢复原状。
 */
export async function applyBackup(preview: Preview, opts: ApplyOptions): Promise<ApplyResult> {
  let secrets: Record<string, string> = {};
  if (opts.password && preview.inspection.secretsEnc) {
    secrets = await decryptSecrets(preview.inspection.secretsEnc, opts.password);
  }
  const safety = await exportBackup({ includeVoiceprint: true, includeModels: false }, undefined, "pre-import");
  const before = readLocalStorage();
  try {
    const rows = await invoke<Record<string, number>>("ck_backup_apply", {
      options: {
        merge: opts.merge,
        database: opts.database,
        voiceprint: opts.voiceprint && preview.inspection.hasVoiceprint,
        localSettings: true,
        models: opts.models && preview.inspection.modelFilesIncluded,
      },
    });
    writeStorage(preview.storage, opts.merge);
    let n = 0;
    for (const [k, v] of Object.entries(secrets)) {
      if (k.startsWith("keychain:")) {
        await invoke("ck_secret_set", { account: k.slice(9), value: v });
        n++;
      } else if (k.startsWith("local:")) {
        const [, storageKey, field] = k.split(":");
        const cur = localStorage.getItem(storageKey);
        if (cur) {
          const o = JSON.parse(cur);
          o.variables = { ...(o.variables || {}), [field]: v };
          localStorage.setItem(storageKey, JSON.stringify(o));
          n++;
        }
      }
    }
    await invoke("ck_backup_discard").catch(() => {});
    return { rows, settings: Object.keys(preview.storage).length, secrets: n, safetyBackup: safety.path };
  } catch (e) {
    // 回滚：设置直接还原；数据库用刚才的安全备份还原
    localStorage.clear();
    for (const [k, v] of Object.entries(before)) localStorage.setItem(k, v);
    try {
      await invoke("ck_backup_inspect", { path: safety.path });
      await invoke("ck_backup_apply", {
        options: { merge: false, database: true, voiceprint: true, localSettings: true, models: false },
      });
    } catch {
      /* 已尽力回滚；安全备份文件仍保留 */
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`恢复失败，已还原到恢复前的状态：${msg}`);
  }
}

/**
 * 升级前自动备份：版本号变化（或首次运行 v2.1.0 且已有数据）时，
 * 在新版本改写任何数据之前导出一份 pre-upgrade 备份，保留最近 5 份。
 */
export async function autoBackupOnUpgrade(currentVersion: string): Promise<string | null> {
  const last = localStorage.getItem(LAST_VERSION_KEY);
  if (last === currentVersion) return null;
  const hasData = localStorage.length > 0;
  let path: string | null = null;
  if (hasData) {
    try {
      path = (await exportBackup({ includeVoiceprint: true, includeModels: false }, undefined, "pre-upgrade")).path;
    } catch (e) {
      console.warn("pre-upgrade backup failed:", e);
      return null; // 下次启动再试
    }
  }
  localStorage.setItem(LAST_VERSION_KEY, currentVersion);
  return path;
}

export async function listAutoBackups() {
  return invoke<{ path: string; name: string; bytes: number; createdAt: number }[]>("ck_backup_list");
}
