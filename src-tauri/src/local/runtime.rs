//! Shared ONNX Runtime (one environment, one global thread pool for every
//! model) plus the on-demand download of the runtime library and models:
//! disk check first, resumable (HTTP Range), SHA-256 verified.

use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub const ORT_VERSION: &str = "1.22.0";

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub enum Kind {
    Runtime,
    Asr,
    Speaker,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct Asset {
    pub id: &'static str,
    pub kind: Kind,
    pub file: &'static str,
    pub urls: Vec<String>,
    pub sha256: &'static str,
    pub size: u64,
    /// For archives: path of the library inside it.
    pub inner: Option<String>,
}

const HF_SV: &str = "csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main";
const HF_SPK: &str = "csukuangfj/speaker-embedding-models/resolve/main";

fn hf(path: &str) -> Vec<String> {
    vec![
        format!("https://huggingface.co/{path}"),
        format!("https://hf-mirror.com/{path}"),
    ]
}

/// (archive name, sha256, size, library path inside) for this platform.
fn ort_archive() -> Option<(&'static str, &'static str, u64, &'static str)> {
    if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Some(("onnxruntime-linux-x64-1.22.0.tgz", "8344d55f93d5bc5021ce342db50f62079daf39aaafb5d311a451846228be49b3", 7_798_730, "onnxruntime-linux-x64-1.22.0/lib/libonnxruntime.so.1.22.0"))
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        Some(("onnxruntime-linux-aarch64-1.22.0.tgz", "bb76395092d150b52c7092dc6b8f2fe4d80f0f3bf0416d2f269193e347e24702", 6_849_865, "onnxruntime-linux-aarch64-1.22.0/lib/libonnxruntime.so.1.22.0"))
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some(("onnxruntime-osx-arm64-1.22.0.tgz", "cab6dcbd77e7ec775390e7b73a8939d45fec3379b017c7cb74f5b204c1a1cc07", 25_943_843, "onnxruntime-osx-arm64-1.22.0/lib/libonnxruntime.1.22.0.dylib"))
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Some(("onnxruntime-osx-x86_64-1.22.0.tgz", "e4ec94a7696de74fb1b12846569aa94e499958af6ffa186022cfde16c9d617f0", 27_889_590, "onnxruntime-osx-x86_64-1.22.0/lib/libonnxruntime.1.22.0.dylib"))
    } else if cfg!(all(windows, target_arch = "x86_64")) {
        Some(("onnxruntime-win-x64-1.22.0.zip", "174c616efc0271194488642a72f1a514e01487da4dfe84c49296d66e40ebe0da", 72_368_545, "onnxruntime-win-x64-1.22.0/lib/onnxruntime.dll"))
    } else if cfg!(all(windows, target_arch = "aarch64")) {
        Some(("onnxruntime-win-arm64-1.22.0.zip", "7008f7ff82f8e7de563a22f2b590e08e706a1289eba606b93de2b56edfb1e04b", 73_055_483, "onnxruntime-win-arm64-1.22.0/lib/onnxruntime.dll"))
    } else {
        None
    }
}

pub fn lib_name() -> &'static str {
    if cfg!(windows) {
        "onnxruntime.dll"
    } else if cfg!(target_os = "macos") {
        "libonnxruntime.dylib"
    } else {
        "libonnxruntime.so"
    }
}

pub fn catalog() -> Vec<Asset> {
    let mut v = Vec::new();
    if let Some((name, sha, size, inner)) = ort_archive() {
        v.push(Asset {
            id: "runtime",
            kind: Kind::Runtime,
            file: name,
            urls: vec![format!(
                "https://github.com/microsoft/onnxruntime/releases/download/v{ORT_VERSION}/{name}"
            )],
            sha256: sha,
            size,
            inner: Some(inner.to_string()),
        });
    }
    v.push(Asset {
        id: "sensevoice",
        kind: Kind::Asr,
        file: "sensevoice.int8.onnx",
        urls: hf(&format!("{HF_SV}/model.int8.onnx")),
        sha256: "c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51",
        size: 239_233_841,
        inner: None,
    });
    v.push(Asset {
        id: "sensevoice-tokens",
        kind: Kind::Asr,
        file: "sensevoice.tokens.txt",
        urls: hf(&format!("{HF_SV}/tokens.txt")),
        sha256: "f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc",
        size: 315_894,
        inner: None,
    });
    v.push(Asset {
        id: "campplus",
        kind: Kind::Speaker,
        file: "campplus_zh-cn.onnx",
        urls: hf(&format!("{HF_SPK}/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx")),
        sha256: "f682b514c05d947ee3fa91cd6ec6c5c7543479a128373fa29b1faedccd21fd11",
        size: 28_281_138,
        inner: None,
    });
    v
}

/// Files needed for a feature.
pub fn assets_for(kind: Kind) -> Vec<Asset> {
    catalog()
        .into_iter()
        .filter(|a| a.kind == kind || a.kind == Kind::Runtime)
        .collect()
}

pub fn installed_path(dir: &Path, a: &Asset) -> PathBuf {
    if a.kind == Kind::Runtime {
        dir.join(lib_name())
    } else {
        dir.join(a.file)
    }
}

pub fn is_installed(dir: &Path, a: &Asset) -> bool {
    let p = installed_path(dir, a);
    match std::fs::metadata(&p) {
        Ok(m) => a.kind == Kind::Runtime || m.len() == a.size,
        Err(_) => false,
    }
}

pub fn sha256_file(p: &Path) -> std::io::Result<String> {
    let mut f = std::fs::File::open(p)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Bytes still to download for these assets (partials count as progress).
pub fn bytes_needed(dir: &Path, assets: &[Asset]) -> u64 {
    assets
        .iter()
        .filter(|a| !is_installed(dir, a))
        .map(|a| {
            let part = std::fs::metadata(dir.join(format!("{}.part", a.file)))
                .map(|m| m.len())
                .unwrap_or(0);
            a.size.saturating_sub(part)
        })
        .sum()
}

/// Download one asset with resume and checksum, then install it.
pub async fn fetch(
    dir: &Path,
    a: &Asset,
    mut progress: impl FnMut(u64, u64),
) -> Result<(), String> {
    if is_installed(dir, a) {
        return Ok(());
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let part = dir.join(format!("{}.part", a.file));
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let mut last_err = String::new();
    for url in &a.urls {
        let have = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        if have >= a.size {
            break;
        }
        let mut req = client.get(url);
        if have > 0 {
            req = req.header("Range", format!("bytes={have}-"));
        }
        let resp = match req.send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                last_err = format!("HTTP {}", r.status());
                continue;
            }
            Err(e) => {
                last_err = e.to_string();
                continue;
            }
        };
        let append = have > 0 && resp.status() == reqwest::StatusCode::PARTIAL_CONTENT;
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(&part)
            .map_err(|e| e.to_string())?;
        let mut done = if append { have } else { 0 };
        let mut stream = resp.bytes_stream();
        use futures_util::StreamExt;
        let mut ok = true;
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(c) => {
                    f.write_all(&c).map_err(|e| e.to_string())?;
                    done += c.len() as u64;
                    progress(done, a.size);
                }
                Err(e) => {
                    last_err = e.to_string();
                    ok = false;
                    break;
                }
            }
        }
        f.flush().ok();
        if ok {
            break;
        }
    }
    let got = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    if got != a.size {
        return Err(if last_err.is_empty() {
            "下载未完成，可稍后继续".into()
        } else {
            format!("下载中断（{last_err}），再次点击会从断点继续")
        });
    }
    let sum = sha256_file(&part).map_err(|e| e.to_string())?;
    if sum != a.sha256 {
        let _ = std::fs::remove_file(&part);
        return Err("文件校验失败，已删除，请重新下载".into());
    }
    if a.kind == Kind::Runtime {
        let inner = a.inner.clone().unwrap_or_default();
        extract_one(&part, &inner, &installed_path(dir, a))?;
        let _ = std::fs::remove_file(&part);
    } else {
        std::fs::rename(&part, installed_path(dir, a)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn extract_one(archive: &Path, inner: &str, dest: &Path) -> Result<(), String> {
    let tmp = dest.with_extension("tmp");
    let f = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    if archive.extension().map(|e| e == "zip").unwrap_or(false) {
        let mut z = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
        let mut entry = z.by_name(inner).map_err(|e| e.to_string())?;
        let mut out = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    } else {
        let mut t = tar::Archive::new(flate2::read::GzDecoder::new(f));
        let mut found = false;
        for e in t.entries().map_err(|e| e.to_string())? {
            let mut e = e.map_err(|e| e.to_string())?;
            if e.path().map(|p| p.to_string_lossy() == inner).unwrap_or(false) {
                let mut out = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
                std::io::copy(&mut e, &mut out).map_err(|e| e.to_string())?;
                found = true;
                break;
            }
        }
        if !found {
            return Err("运行库压缩包内容不完整".into());
        }
    }
    std::fs::rename(&tmp, dest).map_err(|e| e.to_string())
}

static ORT_READY: OnceLock<Result<(), String>> = OnceLock::new();

/// Threads for the shared pool: half the cores, 1..=4. Speech models are
/// small; more threads mostly add wake-ups.
pub fn pool_threads() -> usize {
    let n = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2);
    (n / 2).clamp(1, 4)
}

/// Load the runtime library once and create the one environment.
pub fn ensure_runtime(dir: &Path) -> Result<(), String> {
    ORT_READY
        .get_or_init(|| {
            let lib = dir.join(lib_name());
            if !lib.exists() {
                return Err("运行库尚未下载".into());
            }
            // init_from must run before any other ort call: it sets the
            // library path that the first API call loads.
            let builder = ort::init_from(lib.to_string_lossy().to_string());
            let pool = ort::environment::GlobalThreadPoolOptions::default()
                .with_intra_threads(pool_threads())
                .and_then(|p| p.with_inter_threads(1))
                .and_then(|p| p.with_spin_control(false))
                .map_err(|e| e.to_string())?;
            builder
                .with_name("ck-pluely")
                .with_telemetry(false)
                .with_global_thread_pool(pool)
                .commit()
                .map(|_| ())
                .map_err(|e| e.to_string())
        })
        .clone()
}

pub fn session(path: &Path) -> Result<ort::session::Session, String> {
    ort::session::Session::builder()
        .and_then(|b| b.with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3))
        .and_then(|b| b.with_memory_pattern(false))
        .and_then(|b| b.commit_from_file(path))
        .map_err(|e| e.to_string())
}


/// Hand freed model memory back to the OS (glibc keeps it otherwise).
pub fn trim_heap() {
    #[cfg(all(target_os = "linux", target_env = "gnu"))]
    unsafe {
        libc::malloc_trim(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_is_complete_and_pinned() {
        let c = catalog();
        assert!(c.iter().any(|a| a.kind == Kind::Runtime));
        for a in &c {
            assert_eq!(a.sha256.len(), 64, "{}", a.id);
            assert!(a.size > 0);
            assert!(a.urls.iter().all(|u| u.starts_with("https://")));
        }
    }

    #[test]
    fn needed_bytes_count_partials() {
        let dir = std::env::temp_dir().join(format!("ckdl-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = catalog().into_iter().find(|a| a.id == "campplus").unwrap();
        assert_eq!(bytes_needed(&dir, std::slice::from_ref(&a)), a.size);
        std::fs::write(dir.join(format!("{}.part", a.file)), vec![0u8; 1000]).unwrap();
        assert_eq!(bytes_needed(&dir, std::slice::from_ref(&a)), a.size - 1000);
        std::fs::remove_dir_all(&dir).ok();
    }
}
