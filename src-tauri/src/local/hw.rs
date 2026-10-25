//! Pick what this machine can run comfortably, with the reason in plain
//! Chinese. The user can always override.

use serde::Serialize;
use std::path::Path;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Machine {
    pub arch: String,
    pub cpu: String,
    pub cores: usize,
    pub memory_gb: f64,
    pub free_disk_gb: f64,
    pub simd: bool,
    pub simd_name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Advice {
    pub local_stt: bool,
    pub stt_reason: String,
    pub voiceprint: bool,
    pub voiceprint_reason: String,
    pub threads: usize,
}

pub fn simd() -> (bool, &'static str) {
    #[cfg(target_arch = "x86_64")]
    {
        if std::is_x86_feature_detected!("avx2") {
            (true, "AVX2")
        } else {
            (false, "无 AVX2")
        }
    }
    #[cfg(target_arch = "aarch64")]
    {
        (true, "NEON")
    }
    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
    {
        (false, "未知")
    }
}

pub fn machine(data_dir: &Path) -> Machine {
    use sysinfo::{Disks, System};
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu();
    let cpu = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_default();
    let disks = Disks::new_with_refreshed_list();
    // the disk holding the data dir = longest matching mount point
    let free = disks
        .list()
        .iter()
        .filter(|d| data_dir.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len())
        .map(|d| d.available_space())
        .unwrap_or(0);
    let (ok, name) = simd();
    Machine {
        arch: std::env::consts::ARCH.to_string(),
        cpu,
        cores: std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1),
        memory_gb: sys.total_memory() as f64 / 1e9,
        free_disk_gb: free as f64 / 1e9,
        simd: ok,
        simd_name: name.to_string(),
    }
}

/// `need_stt_gb` / `need_spk_gb`: download size still missing.
pub fn advise(m: &Machine, need_stt_gb: f64, need_spk_gb: f64) -> Advice {
    let threads = (m.cores / 2).clamp(1, 4);
    let (local_stt, stt_reason) = if !m.simd {
        (
            false,
            format!(
                "处理器不支持 {}，本地识别会很慢，建议用在线识别",
                if m.arch == "x86_64" {
                    "AVX2"
                } else {
                    "向量指令"
                }
            ),
        )
    } else if m.memory_gb < 3.5 {
        (
            false,
            format!(
                "内存 {:.0} GB，本地识别约需 0.7 GB，建议用在线识别",
                m.memory_gb
            ),
        )
    } else if m.free_disk_gb < need_stt_gb + 0.5 {
        (
            false,
            format!(
                "磁盘剩余 {:.1} GB，模型需要 {:.2} GB，空间不足",
                m.free_disk_gb, need_stt_gb
            ),
        )
    } else if m.cores < 4 {
        (
            true,
            format!(
                "{} 核处理器，可离线识别，但长句会慢一些；联网时仍优先在线识别",
                m.cores
            ),
        )
    } else {
        (
            true,
            format!(
                "{}，{} 核，内存 {:.0} GB：可流畅离线识别（SenseVoice 小模型，约 240 MB）",
                m.simd_name, m.cores, m.memory_gb
            ),
        )
    };
    let (voiceprint, voiceprint_reason) = if m.memory_gb < 2.0 {
        (false, "内存不足 2 GB，不建议开启声纹".to_string())
    } else if m.free_disk_gb < need_spk_gb + 0.2 {
        (false, "磁盘空间不足".to_string())
    } else {
        (true, "声纹模型约 28 MB，每句话处理不到 50 毫秒".to_string())
    };
    Advice {
        local_stt,
        stt_reason,
        voiceprint,
        voiceprint_reason,
        threads,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(simd: bool, mem: f64, disk: f64, cores: usize) -> Machine {
        Machine {
            arch: "x86_64".into(),
            cpu: String::new(),
            cores,
            memory_gb: mem,
            free_disk_gb: disk,
            simd,
            simd_name: "AVX2".into(),
        }
    }

    #[test]
    fn advice_follows_hardware() {
        assert!(advise(&m(true, 16.0, 100.0, 8), 0.25, 0.03).local_stt);
        assert!(!advise(&m(false, 16.0, 100.0, 8), 0.25, 0.03).local_stt);
        assert!(!advise(&m(true, 2.0, 100.0, 8), 0.25, 0.03).local_stt);
        let low_disk = advise(&m(true, 16.0, 0.3, 8), 0.25, 0.03);
        assert!(!low_disk.local_stt && low_disk.stt_reason.contains("磁盘"));
        assert!(advise(&m(true, 8.0, 100.0, 2), 0.25, 0.03).local_stt);
        assert_eq!(advise(&m(true, 8.0, 100.0, 16), 0.25, 0.03).threads, 4);
    }
}
