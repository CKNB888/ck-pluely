//! 备份 / 恢复（.ckbak）。
//!
//! 一个 zip 文件：
//! - `manifest.json`  { app, schemaVersion, appVersion, createdAt, contents, checksums }
//! - `settings.json`  前端设置（localStorage 导出，已去掉密钥）
//! - `db.sqlite`      记录与提示词数据库快照（`VACUUM INTO`，一致性快照）
//! - `local.json`     本地识别 / 声纹设置
//! - `voiceprint.json`（可选）声纹
//! - `models.json`    已下载模型的名称、大小、SHA-256；`models/*`（可选）模型文件本身
//! - `secrets.enc`    （可选）前端用口令加密的密钥（AES-GCM + PBKDF2），这里只当作不透明数据
//!
//! 导入：先解到临时目录并逐个校验 SHA-256，再给前端预览（不改任何东西）；
//! 应用数据库时在一个事务里完成，失败整体回滚。导入前前端会先自动导出一份当前数据。
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

pub const APP_ID: &str = "ck-pluely";
/// 备份格式版本。v1：v1.0.x 时代的手工导出 / 旧格式；v2：v2.1.0 起。
pub const SCHEMA_VERSION: u32 = 2;
/// 数据库中会备份 / 恢复的表（按外键顺序）。
const TABLES: [&str; 3] = ["system_prompts", "conversations", "messages"];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub app: String,
    pub schema_version: u32,
    pub app_version: String,
    pub created_at: u64,
    #[serde(default)]
    pub contents: Vec<String>,
    #[serde(default)]
    pub checksums: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    #[serde(default)]
    pub include_voiceprint: bool,
    #[serde(default)]
    pub include_models: bool,
    /// 前端已加密的密钥数据（base64 JSON），None 表示不带密钥。
    #[serde(default)]
    pub secrets_enc: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub file: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportSummary {
    pub path: String,
    pub bytes: u64,
    pub contents: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    pub staging: String,
    pub manifest: Manifest,
    pub settings_json: Option<String>,
    pub secrets_enc: Option<String>,
    /// 表名 → 行数
    pub db_counts: BTreeMap<String, i64>,
    pub has_voiceprint: bool,
    pub has_local_settings: bool,
    pub models: Vec<ModelEntry>,
    pub model_files_included: bool,
    /// 备份来自比当前更新的版本（格式版本更高）。
    pub newer_than_app: bool,
}

fn sha256_file(p: &Path) -> Result<String, String> {
    let mut f = File::open(p).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}

fn sha256_bytes(b: &[u8]) -> String {
    format!("{:x}", Sha256::digest(b))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 一致性快照：VACUUM INTO 一个新文件（不锁住正在使用的数据库太久）。
pub fn snapshot_db(db: &Path, out: &Path) -> Result<(), String> {
    let _ = std::fs::remove_file(out);
    let c = rusqlite::Connection::open(db).map_err(|e| format!("打开数据库失败：{e}"))?;
    c.busy_timeout(std::time::Duration::from_secs(5)).ok();
    c.execute("VACUUM INTO ?1", [out.to_string_lossy().as_ref()])
        .map_err(|e| format!("数据库快照失败：{e}"))?;
    Ok(())
}

fn list_models(models_dir: &Path) -> Vec<(PathBuf, ModelEntry)> {
    let mut v = Vec::new();
    if let Ok(rd) = std::fs::read_dir(models_dir) {
        for e in rd.flatten() {
            let p = e.path();
            if !p.is_file() || p.extension().map(|x| x == "part").unwrap_or(false) {
                continue;
            }
            let name = e.file_name().to_string_lossy().to_string();
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            let sha = sha256_file(&p).unwrap_or_default();
            v.push((p, ModelEntry { file: name, size, sha256: sha }));
        }
    }
    v.sort_by(|a, b| a.1.file.cmp(&b.1.file));
    v
}

/// 写备份文件。`db` 可以不存在（新装用户），`data_dir` 为 app_data_dir。
pub fn write_archive(
    out: &Path,
    db: &Path,
    data_dir: &Path,
    settings_json: &str,
    app_version: &str,
    opts: &ExportOptions,
) -> Result<ExportSummary, String> {
    serde_json::from_str::<serde_json::Value>(settings_json).map_err(|e| format!("设置数据无效：{e}"))?;
    let tmp_dir = std::env::temp_dir().join(format!("ckbak-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let result = (|| {
        // (zip 内名称, 本地文件)
        let mut files: Vec<(String, PathBuf)> = Vec::new();
        let mut blobs: Vec<(String, Vec<u8>)> = vec![("settings.json".into(), settings_json.as_bytes().to_vec())];
        if db.exists() {
            let snap = tmp_dir.join("db.sqlite");
            snapshot_db(db, &snap)?;
            files.push(("db.sqlite".into(), snap));
        }
        let local = data_dir.join("local.json");
        if local.exists() {
            files.push(("local.json".into(), local));
        }
        let vp = crate::local::engine::voiceprint_path(data_dir);
        if opts.include_voiceprint && vp.exists() {
            files.push(("voiceprint.json".into(), vp));
        }
        let models = list_models(&data_dir.join("models"));
        let list: Vec<&ModelEntry> = models.iter().map(|m| &m.1).collect();
        blobs.push(("models.json".into(), serde_json::to_vec_pretty(&list).unwrap()));
        if opts.include_models {
            for (p, m) in &models {
                files.push((format!("models/{}", m.file), p.clone()));
            }
        }
        if let Some(s) = &opts.secrets_enc {
            blobs.push(("secrets.enc".into(), s.as_bytes().to_vec()));
        }

        let mut checksums = BTreeMap::new();
        for (n, b) in &blobs {
            checksums.insert(n.clone(), sha256_bytes(b));
        }
        for (n, p) in &files {
            checksums.insert(n.clone(), sha256_file(p)?);
        }
        let manifest = Manifest {
            app: APP_ID.into(),
            schema_version: SCHEMA_VERSION,
            app_version: app_version.into(),
            created_at: now_secs(),
            contents: checksums.keys().cloned().collect(),
            checksums,
        };

        let part = out.with_extension("ckbak.part");
        if let Some(p) = out.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        {
            let f = File::create(&part).map_err(|e| format!("无法写入备份文件：{e}"))?;
            let mut z = zip::ZipWriter::new(f);
            let deflate = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .large_file(true);
            let stored = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored)
                .large_file(true);
            z.start_file("manifest.json", deflate).map_err(|e| e.to_string())?;
            z.write_all(&serde_json::to_vec_pretty(&manifest).unwrap()).map_err(|e| e.to_string())?;
            for (n, b) in &blobs {
                z.start_file(n.as_str(), deflate).map_err(|e| e.to_string())?;
                z.write_all(b).map_err(|e| e.to_string())?;
            }
            for (n, p) in &files {
                // 模型本身已压缩，存储即可，省时间
                let o = if n.starts_with("models/") { stored } else { deflate };
                z.start_file(n.as_str(), o).map_err(|e| e.to_string())?;
                let mut f = File::open(p).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, &mut z).map_err(|e| e.to_string())?;
            }
            z.finish().map_err(|e| e.to_string())?.sync_all().ok();
        }
        std::fs::rename(&part, out).map_err(|e| e.to_string())?;
        let bytes = std::fs::metadata(out).map(|m| m.len()).unwrap_or(0);
        Ok(ExportSummary { path: out.to_string_lossy().into(), bytes, contents: manifest.contents })
    })();
    let _ = std::fs::remove_dir_all(&tmp_dir);
    result
}

fn safe_name(n: &str) -> bool {
    !n.is_empty()
        && !n.starts_with('/')
        && !n.contains('\\')
        && !n.split('/').any(|s| s == ".." || s.is_empty())
}

/// 解压到临时目录并校验，不修改任何用户数据。
pub fn inspect_archive(path: &Path, staging: &Path) -> Result<Inspection, String> {
    let f = File::open(path).map_err(|e| format!("无法打开备份文件：{e}"))?;
    let mut z = zip::ZipArchive::new(f).map_err(|_| "不是有效的备份文件".to_string())?;
    let manifest: Manifest = {
        let mut m = z.by_name("manifest.json").map_err(|_| "备份文件缺少清单（manifest.json）".to_string())?;
        let mut s = String::new();
        m.read_to_string(&mut s).map_err(|e| e.to_string())?;
        serde_json::from_str(&s).map_err(|e| format!("清单无法解析：{e}"))?
    };
    if manifest.app != APP_ID {
        return Err(format!("这不是 CK Pluely 的备份（来自 {}）", manifest.app));
    }
    let _ = std::fs::remove_dir_all(staging);
    std::fs::create_dir_all(staging).map_err(|e| e.to_string())?;
    for i in 0..z.len() {
        let mut e = z.by_index(i).map_err(|e| e.to_string())?;
        let name = e.name().to_string();
        if name == "manifest.json" || e.is_dir() {
            continue;
        }
        if !safe_name(&name) {
            return Err(format!("备份中有不安全的路径：{name}"));
        }
        let Some(expected) = manifest.checksums.get(&name) else {
            return Err(format!("备份中的 {name} 不在清单内"));
        };
        let dest = staging.join(&name);
        if let Some(p) = dest.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut out = File::create(&dest).map_err(|e| e.to_string())?;
        std::io::copy(&mut e, &mut out).map_err(|e| e.to_string())?;
        drop(out);
        if &sha256_file(&dest)? != expected {
            return Err(format!("{name} 校验失败，备份文件可能已损坏"));
        }
    }
    for n in manifest.checksums.keys() {
        if !staging.join(n).exists() {
            return Err(format!("备份缺少 {n}"));
        }
    }
    let read = |n: &str| std::fs::read_to_string(staging.join(n)).ok();
    let mut db_counts = BTreeMap::new();
    let db = staging.join("db.sqlite");
    if db.exists() {
        let c = rusqlite::Connection::open_with_flags(&db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| format!("备份中的数据库无法打开：{e}"))?;
        for t in TABLES {
            if let Ok(n) = c.query_row(&format!("SELECT COUNT(*) FROM \"{t}\""), [], |r| r.get::<_, i64>(0)) {
                db_counts.insert(t.to_string(), n);
            }
        }
    }
    let models: Vec<ModelEntry> = read("models.json").and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    let model_files_included = !models.is_empty() && models.iter().all(|m| staging.join("models").join(&m.file).exists());
    Ok(Inspection {
        staging: staging.to_string_lossy().into(),
        newer_than_app: manifest.schema_version > SCHEMA_VERSION,
        settings_json: read("settings.json"),
        secrets_enc: read("secrets.enc"),
        db_counts,
        has_voiceprint: staging.join("voiceprint.json").exists(),
        has_local_settings: staging.join("local.json").exists(),
        models,
        model_files_included,
        manifest,
    })
}

fn columns(c: &rusqlite::Connection, schema: &str, t: &str) -> Vec<String> {
    let mut v = Vec::new();
    if let Ok(mut st) = c.prepare(&format!("PRAGMA {schema}.table_info(\"{t}\")")) {
        if let Ok(rows) = st.query_map([], |r| r.get::<_, String>(1)) {
            v = rows.flatten().collect();
        }
    }
    v
}

/// 用备份中的数据库替换当前的记录与提示词：一个事务内完成，任何一步失败都回滚。
/// 只复制两边都有的列，所以旧备份（列更少）和新备份（多出的列）都能导入。
/// `merge = true` 时保留现有数据、按主键覆盖；否则先清空再导入。
pub fn apply_db(main_db: &Path, staged_db: &Path, merge: bool) -> Result<BTreeMap<String, i64>, String> {
    let mut c = rusqlite::Connection::open(main_db).map_err(|e| format!("打开数据库失败：{e}"))?;
    c.busy_timeout(std::time::Duration::from_secs(10)).ok();
    c.execute("ATTACH DATABASE ?1 AS bak", [staged_db.to_string_lossy().as_ref()])
        .map_err(|e| format!("读取备份数据库失败：{e}"))?;
    let res = (|| {
        let tx = c.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        let mut counts = BTreeMap::new();
        if !merge {
            for t in TABLES.iter().rev() {
                if !columns(&tx, "main", t).is_empty() {
                    tx.execute(&format!("DELETE FROM main.\"{t}\""), []).map_err(|e| format!("清空 {t} 失败：{e}"))?;
                }
            }
        }
        for t in TABLES {
            let main_cols = columns(&tx, "main", t);
            let bak_cols = columns(&tx, "bak", t);
            if main_cols.is_empty() || bak_cols.is_empty() {
                continue;
            }
            let common: Vec<String> = main_cols.into_iter().filter(|c| bak_cols.contains(c)).map(|c| format!("\"{c}\"")).collect();
            if common.is_empty() {
                continue;
            }
            let cols = common.join(",");
            let n = tx
                .execute(&format!("INSERT OR REPLACE INTO main.\"{t}\" ({cols}) SELECT {cols} FROM bak.\"{t}\""), [])
                .map_err(|e| format!("导入 {t} 失败：{e}"))?;
            counts.insert(t.to_string(), n as i64);
        }
        tx.commit().map_err(|e| format!("提交失败：{e}"))?;
        Ok(counts)
    })();
    let _ = c.execute("DETACH DATABASE bak", []);
    res
}

/// 只保留最近 `keep` 个自动备份。
pub fn prune(dir: &Path, prefix: &str, keep: usize) {
    let mut v: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|rd| rd.flatten().map(|e| e.path()).filter(|p| {
            p.file_name().map(|n| n.to_string_lossy().starts_with(prefix)).unwrap_or(false)
                && p.extension().map(|x| x == "ckbak").unwrap_or(false)
        }).collect())
        .unwrap_or_default();
    v.sort();
    while v.len() > keep {
        let _ = std::fs::remove_file(v.remove(0));
    }
}


// ---------------- Tauri 命令 ----------------
use tauri::{AppHandle, Manager, Runtime};

fn db_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    // tauri-plugin-sql 把 sqlite:pluely.db 放在 app_config_dir
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("pluely.db"))
}
fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}
pub fn auto_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("backups"))
}
fn stamp() -> String {
    // 本地时间不依赖额外库：用 UTC 秒数保证可排序
    format!("{}", now_secs())
}

/// 导出。`path` 为空时写到自动备份目录（`kind` 作文件名前缀，例如 auto / pre-import / pre-upgrade）。
#[tauri::command]
pub async fn ck_backup_export<R: Runtime>(
    app: AppHandle<R>,
    path: Option<String>,
    kind: Option<String>,
    settings_json: String,
    options: ExportOptions,
) -> Result<ExportSummary, String> {
    let db = db_path(&app)?;
    let data = data_dir(&app)?;
    let ver = app.package_info().version.to_string();
    let (out, prune_prefix) = match path {
        Some(p) => (PathBuf::from(p), None),
        None => {
            let k = kind.unwrap_or_else(|| "auto".into());
            if !k.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                return Err("备份类型无效".into());
            }
            let prefix = format!("{k}-");
            (auto_dir(&app)?.join(format!("{prefix}{}-v{ver}.ckbak", stamp())), Some(prefix))
        }
    };
    let r = tauri::async_runtime::spawn_blocking(move || {
        let r = write_archive(&out, &db, &data, &settings_json, &ver, &options);
        if let (Ok(_), Some(p), Some(dir)) = (&r, prune_prefix, out.parent()) {
            prune(dir, &p, 5);
        }
        r
    })
    .await
    .map_err(|e| e.to_string())?;
    r
}

#[tauri::command]
pub async fn ck_backup_inspect<R: Runtime>(app: AppHandle<R>, path: String) -> Result<Inspection, String> {
    let staging = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("restore-staging");
    tauri::async_runtime::spawn_blocking(move || inspect_archive(Path::new(&path), &staging))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOptions {
    #[serde(default)]
    pub merge: bool,
    #[serde(default = "yes")]
    pub database: bool,
    #[serde(default)]
    pub voiceprint: bool,
    #[serde(default = "yes")]
    pub local_settings: bool,
    #[serde(default)]
    pub models: bool,
}
fn yes() -> bool {
    true
}

/// 应用已校验的暂存数据。数据库在事务中替换；其余文件先写临时名再改名。
#[tauri::command]
pub async fn ck_backup_apply<R: Runtime>(app: AppHandle<R>, options: ApplyOptions) -> Result<BTreeMap<String, i64>, String> {
    let staging = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("restore-staging");
    if !staging.join("settings.json").exists() {
        return Err("没有待恢复的备份，请重新选择文件".into());
    }
    let db = db_path(&app)?;
    let data = data_dir(&app)?;
    let st = staging.clone();
    let o = options.clone();
    let counts = tauri::async_runtime::spawn_blocking(move || -> Result<BTreeMap<String, i64>, String> {
        let mut counts = BTreeMap::new();
        if o.database && st.join("db.sqlite").exists() && db.exists() {
            counts = apply_db(&db, &st.join("db.sqlite"), o.merge)?;
        }
        if o.models {
            let md = data.join("models");
            std::fs::create_dir_all(&md).map_err(|e| e.to_string())?;
            if let Ok(rd) = std::fs::read_dir(st.join("models")) {
                for e in rd.flatten() {
                    let tmp = md.join(format!("{}.part", e.file_name().to_string_lossy()));
                    std::fs::copy(e.path(), &tmp).map_err(|e| format!("恢复模型失败：{e}"))?;
                    std::fs::rename(&tmp, md.join(e.file_name())).map_err(|e| e.to_string())?;
                }
            }
        }
        Ok(counts)
    })
    .await
    .map_err(|e| e.to_string())??;

    if let Some(state) = app.try_state::<crate::local::engine::LocalState>() {
        if options.local_settings {
            if let Ok(b) = std::fs::read(staging.join("local.json")) {
                if let Ok(s) = serde_json::from_slice::<crate::local::engine::Settings>(&b) {
                    state.save_settings(s)?;
                }
            }
        }
        if options.voiceprint {
            if let Ok(b) = std::fs::read(staging.join("voiceprint.json")) {
                let emb = crate::local::engine::parse_voiceprint(&b).ok_or("备份中的声纹无法读取")?;
                crate::local::engine::store_voiceprint(&state, emb)?;
            }
        }
    }
    Ok(counts)
}

#[tauri::command]
pub fn ck_backup_discard<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let staging = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("restore-staging");
    let _ = std::fs::remove_dir_all(staging);
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackup {
    pub path: String,
    pub name: String,
    pub bytes: u64,
    pub created_at: u64,
}

#[tauri::command]
pub fn ck_backup_list<R: Runtime>(app: AppHandle<R>) -> Result<Vec<AutoBackup>, String> {
    let dir = auto_dir(&app)?;
    let mut v: Vec<AutoBackup> = std::fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().extension().map(|x| x == "ckbak").unwrap_or(false))
                .map(|e| {
                    let m = e.metadata().ok();
                    AutoBackup {
                        path: e.path().to_string_lossy().into(),
                        name: e.file_name().to_string_lossy().into(),
                        bytes: m.as_ref().map(|m| m.len()).unwrap_or(0),
                        created_at: m
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    v.sort_by_key(|a| std::cmp::Reverse(a.created_at));
    Ok(v)
}

#[tauri::command]
pub fn ck_backup_dir<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let d = auto_dir(&app)?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_db(p: &Path, v1: bool) {
        let c = rusqlite::Connection::open(p).unwrap();
        c.execute_batch(include_str!("db/migrations/system-prompts.sql")).unwrap();
        if v1 {
            // v1.0.x：会话表没有后来可能新增的列，这里用完整建表脚本即可
            c.execute_batch(include_str!("db/migrations/chat-history.sql")).unwrap();
        } else {
            c.execute_batch(include_str!("db/migrations/chat-history.sql")).unwrap();
            // 模拟未来版本多出的列：导入旧版本时应被忽略
            c.execute_batch("ALTER TABLE conversations ADD COLUMN pinned INTEGER DEFAULT 0;").unwrap();
        }
    }

    fn tmp(n: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ckbak-test-{n}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn round_trip_and_checksums() {
        let d = tmp("rt");
        let data = d.join("data");
        std::fs::create_dir_all(data.join("models")).unwrap();
        let db = d.join("pluely.db");
        make_db(&db, true);
        {
            let c = rusqlite::Connection::open(&db).unwrap();
            c.execute("INSERT INTO system_prompts(name,prompt) VALUES('课堂','先结论')", []).unwrap();
            c.execute("INSERT INTO conversations VALUES('c1','第一节',1,1)", []).unwrap();
            c.execute("INSERT INTO messages VALUES('m1','c1','user','什么是导数？',2,NULL)", []).unwrap();
        }
        std::fs::write(data.join("voiceprint.json"), br#"{"version":1,"model":"campplus_zh-cn","created":1,"embedding":[0.1,0.2]}"#).unwrap();
        std::fs::write(data.join("models/tiny.onnx"), b"model-bytes").unwrap();
        let out = d.join("a.ckbak");
        let opts = ExportOptions { include_voiceprint: true, include_models: false, secrets_enc: Some("{\"v\":1}".into()) };
        let s = write_archive(&out, &db, &data, r#"{"theme":"dark"}"#, "2.1.0", &opts).unwrap();
        assert!(s.contents.contains(&"db.sqlite".to_string()));
        assert!(!s.contents.iter().any(|c| c.starts_with("models/")));

        let ins = inspect_archive(&out, &d.join("stage")).unwrap();
        assert_eq!(ins.manifest.schema_version, SCHEMA_VERSION);
        assert_eq!(ins.db_counts["messages"], 1);
        assert!(ins.has_voiceprint);
        assert_eq!(ins.models.len(), 1);
        assert!(!ins.model_files_included);
        assert_eq!(ins.secrets_enc.as_deref(), Some("{\"v\":1}"));

        // 恢复到一个已有其他数据的新库
        let db2 = d.join("new.db");
        make_db(&db2, false);
        rusqlite::Connection::open(&db2).unwrap().execute("INSERT INTO conversations(id,title,created_at,updated_at) VALUES('x','旧',1,1)", []).unwrap();
        let n = apply_db(&db2, &d.join("stage/db.sqlite"), false).unwrap();
        assert_eq!(n["messages"], 1);
        let c = rusqlite::Connection::open(&db2).unwrap();
        let titles: i64 = c.query_row("SELECT COUNT(*) FROM conversations", [], |r| r.get(0)).unwrap();
        assert_eq!(titles, 1, "replace mode clears old rows");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn tampered_archive_is_rejected() {
        let d = tmp("bad");
        let data = d.join("data");
        std::fs::create_dir_all(&data).unwrap();
        let out = d.join("a.ckbak");
        write_archive(&out, &d.join("none.db"), &data, "{}", "2.1.0", &ExportOptions::default()).unwrap();
        // 改写 settings.json 但不改清单
        let f = File::open(&out).unwrap();
        let mut z = zip::ZipArchive::new(f).unwrap();
        let bad = d.join("b.ckbak");
        let mut w = zip::ZipWriter::new(File::create(&bad).unwrap());
        for i in 0..z.len() {
            let mut e = z.by_index(i).unwrap();
            let mut buf = Vec::new();
            e.read_to_end(&mut buf).unwrap();
            if e.name() == "settings.json" {
                buf = b"{\"x\":1}".to_vec();
            }
            w.start_file(e.name(), zip::write::SimpleFileOptions::default()).unwrap();
            w.write_all(&buf).unwrap();
        }
        w.finish().unwrap();
        let err = inspect_archive(&bad, &d.join("stage")).unwrap_err();
        assert!(err.contains("校验失败"), "{err}");
        assert!(inspect_archive(&d.join("missing.ckbak"), &d.join("s2")).is_err());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn failed_apply_rolls_back() {
        let d = tmp("rb");
        let db = d.join("main.db");
        make_db(&db, true);
        rusqlite::Connection::open(&db).unwrap().execute("INSERT INTO conversations VALUES('keep','保留',1,1)", []).unwrap();
        // 备份库里的 messages.role 违反 CHECK 约束 → 插入失败，前面的 DELETE 也必须回滚
        let bak = d.join("bak.db");
        let c = rusqlite::Connection::open(&bak).unwrap();
        c.execute_batch("CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT,created_at INTEGER,updated_at INTEGER);
            CREATE TABLE messages(id TEXT PRIMARY KEY,conversation_id TEXT,role TEXT,content TEXT,timestamp INTEGER,attached_files TEXT);
            INSERT INTO conversations VALUES('n','新',1,1);
            INSERT INTO messages VALUES('m','n','robot','x',1,NULL);").unwrap();
        drop(c);
        assert!(apply_db(&db, &bak, false).is_err());
        let c = rusqlite::Connection::open(&db).unwrap();
        let id: String = c.query_row("SELECT id FROM conversations", [], |r| r.get(0)).unwrap();
        assert_eq!(id, "keep");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn rejects_other_app_and_unsafe_paths() {
        assert!(!safe_name("../x"));
        assert!(!safe_name("/etc/passwd"));
        assert!(!safe_name("a//b"));
        assert!(safe_name("models/a.onnx"));
    }

    #[test]
    fn prune_keeps_latest() {
        let d = tmp("pr");
        for i in 0..7 {
            std::fs::write(d.join(format!("auto-{i:02}.ckbak")), b"x").unwrap();
        }
        prune(&d, "auto-", 5);
        let n = std::fs::read_dir(&d).unwrap().count();
        assert_eq!(n, 5);
        assert!(!d.join("auto-00.ckbak").exists());
        let _ = std::fs::remove_dir_all(&d);
    }
}
