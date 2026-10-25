/**
 * .ckbak 设置部分的格式与迁移。纯函数，便于单元测试。
 *
 * settings.json
 *  - schema 1（v1.0.x / v2.0.x 手工导出）：localStorage 平铺对象 { key: value }
 *  - schema 2（v2.1.0 起）：{ format: 2, storage: { key: value } }
 * 以后的格式只需在 MIGRATIONS 末尾追加一步，旧备份会逐级升级。
 */
export const BACKUP_SCHEMA = 2;

export type StorageMap = Record<string, string>;
export interface SettingsV2 {
  format: 2;
  storage: StorageMap;
}

/** 永远不进备份、也不从备份恢复的键（与本机绑定或一次性的状态）。 */
export const EXCLUDED_KEYS = new Set<string>([
  "autostart_initialized",
  "ck_last_app_version",
  "ck_bar_pos",
  "ck_onboarding_step_v1",
]);
/** 上游 Pluely 服务的遗留键，v2 起不再使用。 */
export const LEGACY_KEYS = new Set<string>([
  "pluely_api_enabled",
  "pluely_license_key",
  "license_key",
  "instance_id",
]);

export const SECRET_FIELD = /(api[_-]?key|token|secret|password)/i;
/** 保存所选服务商（含变量）的键。 */
export const SELECTED_KEYS = ["curl_selected_ai_provider", "curl_selected_stt_provider"];

const toStringMap = (o: unknown): StorageMap => {
  const out: StorageMap = {};
  if (!o || typeof o !== "object" || Array.isArray(o)) return out;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (v !== undefined && v !== null) out[k] = JSON.stringify(v);
  }
  return out;
};

type Step = (input: any) => any;
/** MIGRATIONS[n] 把 schema n 升级到 n+1。 */
export const MIGRATIONS: Record<number, Step> = {
  1: (flat: unknown): SettingsV2 => {
    const storage = toStringMap(flat);
    for (const k of Object.keys(storage)) {
      if (LEGACY_KEYS.has(k) || EXCLUDED_KEYS.has(k)) delete storage[k];
    }
    // v1.0.x 曾把密钥直接放在 localStorage：备份里一律去掉，恢复后需重新填写或用加密密钥恢复
    for (const k of SELECTED_KEYS) if (storage[k]) storage[k] = stripSecrets(storage[k]).value;
    return { format: 2, storage };
  },
};

export interface MigrationResult {
  settings: SettingsV2;
  from: number;
  steps: number[];
  /** 备份来自更新的版本：只导入能识别的部分。 */
  newer: boolean;
}

export function migrateSettings(schema: number, raw: unknown): MigrationResult {
  if (!Number.isInteger(schema) || schema < 1) throw new Error("备份格式版本无效");
  let data = raw;
  const steps: number[] = [];
  let v = schema;
  if (v > BACKUP_SCHEMA) {
    // 向前兼容：新版本的 settings 至少保留 { storage } 结构
    const storage = toStringMap((raw as any)?.storage ?? raw);
    return { settings: { format: 2, storage }, from: schema, steps, newer: true };
  }
  while (v < BACKUP_SCHEMA) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`缺少从格式 ${v} 升级的步骤`);
    data = step(data);
    steps.push(v);
    v++;
  }
  const s = data as SettingsV2;
  if (!s || s.format !== 2 || typeof s.storage !== "object") throw new Error("设置数据结构无效");
  return { settings: { format: 2, storage: toStringMap(s.storage) }, from: schema, steps, newer: false };
}

/** 去掉所选服务商变量中的密钥字段，返回被去掉的值。 */
export function stripSecrets(json: string): { value: string; removed: Record<string, string> } {
  try {
    const o = JSON.parse(json);
    const removed: Record<string, string> = {};
    if (o && o.variables && typeof o.variables === "object") {
      for (const [k, v] of Object.entries(o.variables)) {
        if (SECRET_FIELD.test(k) && typeof v === "string" && v) {
          removed[k] = v;
          o.variables[k] = "";
        }
      }
    }
    return { value: JSON.stringify(o), removed };
  } catch {
    return { value: json, removed: {} };
  }
}

/** 从 localStorage 内容生成要写入备份的设置（不含密钥）。 */
export function buildSettings(all: StorageMap): { settings: SettingsV2; strippedSecrets: Record<string, string> } {
  const storage: StorageMap = {};
  const strippedSecrets: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (EXCLUDED_KEYS.has(k) || LEGACY_KEYS.has(k)) continue;
    if (SELECTED_KEYS.includes(k)) {
      const r = stripSecrets(v);
      storage[k] = r.value;
      for (const [f, val] of Object.entries(r.removed)) strippedSecrets[`local:${k}:${f}`] = val;
    } else storage[k] = v;
  }
  return { settings: { format: 2, storage }, strippedSecrets };
}

export interface DiffSummary {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: number;
}

/** 预览：恢复会新增 / 修改 / 删除哪些设置（替换模式下当前独有的键会被删除）。 */
export function diffSettings(current: StorageMap, incoming: StorageMap, merge: boolean): DiffSummary {
  const d: DiffSummary = { added: [], changed: [], removed: [], unchanged: 0 };
  for (const [k, v] of Object.entries(incoming)) {
    if (!(k in current)) d.added.push(k);
    else if (current[k] !== v) d.changed.push(k);
    else d.unchanged++;
  }
  if (!merge)
    for (const k of Object.keys(current))
      if (!(k in incoming) && !EXCLUDED_KEYS.has(k)) d.removed.push(k);
  return d;
}
