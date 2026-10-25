//! 运行时系统版本检测，以及「版本 → 隐私/界面策略」映射（纯函数，有单元测试）。
//! - macOS：sysctl kern.osproductversion（与 NSProcessInfo.operatingSystemVersion 一致）
//! - Windows：ntdll!RtlGetVersion（GetVersionEx 在未声明清单时会把版本“说小”，不可信）
// 部分映射函数只在对应平台调用（其余平台仅在测试中使用）
#![allow(dead_code)]
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureProtection {
    /// Windows 10 2004+（build 19041+）：WDA_EXCLUDEFROMCAPTURE，共享/录屏画面中完全不出现
    Exclude,
    /// Windows 7 – 10 1909：WDA_MONITOR，共享画面中是黑块
    Monitor,
    /// macOS：NSWindow.sharingType = none
    SharingNone,
    /// 无系统级接口（Linux / 过旧系统）
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Strategy {
    pub protection: CaptureProtection,
    /// macOS 12+ 才有 NSScreen.safeAreaInsets（刘海检测）
    pub notch_api: bool,
    /// macOS 15+：基于 ScreenCaptureKit 的整屏共享不保证遵守 sharingType
    pub sck_caveat: bool,
    /// 给用户看的中文说明（诚实列出局限）
    pub notes: Vec<String>,
}

pub fn parse_version(v: &str) -> (u32, u32) {
    let mut it = v.trim().split('.').map(|p| p.trim().parse::<u32>().unwrap_or(0));
    (it.next().unwrap_or(0), it.next().unwrap_or(0))
}

pub fn mac_strategy(major: u32, _minor: u32) -> Strategy {
    let mut notes = vec![
        "所有窗口已设置为不可共享（sharingType = none）：传统截图/录屏（CGWindowList、截屏快捷键、QuickTime）中不会出现。".to_string(),
    ];
    let sck_caveat = major >= 15;
    if major >= 15 {
        notes.push("macOS 15 及以上：腾讯会议、Zoom、飞书、OBS、浏览器等若使用 ScreenCaptureKit 共享「整个屏幕」，系统不再保证隐藏本窗口。建议只共享单个窗口，或共享前按「一键隐藏」快捷键。".into());
    } else if major >= 12 {
        notes.push("macOS 12–14：整屏和单窗口共享通常都不会出现本窗口（仍建议开会前用会议软件预览确认一次）。".into());
    } else {
        notes.push("macOS 11 及更早：系统较旧，部分共享软件可能仍可见，建议共享单个窗口。".into());
    }
    Strategy {
        protection: CaptureProtection::SharingNone,
        notch_api: major >= 12,
        sck_caveat,
        notes,
    }
}

pub fn windows_strategy(build: u32) -> Strategy {
    let (protection, note) = if build >= 19041 {
        (CaptureProtection::Exclude, "Windows 10 2004 及以上：已启用 WDA_EXCLUDEFROMCAPTURE，腾讯会议、钉钉、飞书、Zoom、Teams、OBS、QQ/微信截图及浏览器共享（整屏或窗口）中都看不到本窗口，你自己仍可正常看到。")
    } else if build >= 7600 {
        (CaptureProtection::Monitor, "此 Windows 版本低于 10 2004：只能使用 WDA_MONITOR，共享画面中本窗口位置会显示为黑块（对方能看到有个黑框）。建议升级系统，或共享前按「一键隐藏」。")
    } else {
        (CaptureProtection::None, "未能识别 Windows 版本，无法保证防录屏，请共享前按「一键隐藏」。")
    };
    Strategy {
        protection,
        notch_api: false,
        sck_caveat: false,
        notes: vec![note.to_string()],
    }
}

pub fn linux_strategy() -> Strategy {
    Strategy {
        protection: CaptureProtection::None,
        notch_api: false,
        sck_caveat: false,
        notes: vec!["Linux（X11/Wayland）没有让窗口从共享画面中消失的系统接口：请共享单个窗口而不是整个屏幕，或共享前按「一键隐藏」。".into()],
    }
}

/// 当前系统版本字符串：macOS "15.1"，Windows "10.0.22631"，Linux 内核版本
pub fn os_version() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(o) = std::process::Command::new("sysctl")
            .args(["-n", "kern.osproductversion"])
            .output()
        {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !s.is_empty() {
                return s;
            }
        }
        if let Ok(o) = std::process::Command::new("sw_vers").arg("-productVersion").output() {
            return String::from_utf8_lossy(&o.stdout).trim().to_string();
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some((ma, mi, b)) = win::rtl_version() {
            return format!("{ma}.{mi}.{b}");
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(s) = std::fs::read_to_string("/proc/sys/kernel/osrelease") {
            return s.trim().to_string();
        }
    }
    #[allow(unreachable_code)]
    String::new()
}

/// Windows build 号（RtlGetVersion）；其它系统为 None
pub fn windows_build() -> Option<u32> {
    #[cfg(target_os = "windows")]
    {
        return win::rtl_version().map(|v| v.2);
    }
    #[allow(unreachable_code)]
    None
}

pub fn current_strategy() -> Strategy {
    #[cfg(target_os = "macos")]
    {
        let (ma, mi) = parse_version(&os_version());
        return mac_strategy(ma, mi);
    }
    #[cfg(target_os = "windows")]
    {
        return windows_strategy(windows_build().unwrap_or(0));
    }
    #[allow(unreachable_code)]
    linux_strategy()
}

#[cfg(target_os = "windows")]
mod win {
    #[repr(C)]
    struct OsVersionInfoW {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform: u32,
        csd: [u16; 128],
    }
    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(info: *mut OsVersionInfoW) -> i32;
    }
    pub fn rtl_version() -> Option<(u32, u32, u32)> {
        let mut info = OsVersionInfoW {
            size: std::mem::size_of::<OsVersionInfoW>() as u32,
            major: 0,
            minor: 0,
            build: 0,
            platform: 0,
            csd: [0; 128],
        };
        // SAFETY: info is a valid, correctly sized OSVERSIONINFOW.
        let status = unsafe { RtlGetVersion(&mut info) };
        (status == 0).then_some((info.major, info.minor, info.build))
    }
}

// ---------- 首次引导：权限状态 ----------

#[derive(Debug, Clone, Serialize, Default)]
pub struct PermissionStatus {
    pub os: String,
    pub os_version: String,
    /// "granted" | "denied" | "unknown"
    pub microphone: String,
    pub has_output_device: bool,
    pub has_input_device: bool,
    pub protection: String,
}

/// Windows 隐私设置中麦克风总开关（HKCU ConsentStore\microphone\Value = Allow/Deny）
pub fn mic_consent_from_reg(output: &str) -> &'static str {
    for line in output.lines() {
        let l = line.trim();
        if l.starts_with("Value") {
            if l.ends_with("Allow") {
                return "granted";
            }
            if l.ends_with("Deny") {
                return "denied";
            }
        }
    }
    "unknown"
}

#[tauri::command]
pub fn ck_permission_status() -> PermissionStatus {
    let has_output_device = crate::speaker::list_output_devices()
        .map(|d| !d.is_empty())
        .unwrap_or(false);
    let has_input_device = crate::speaker::list_input_devices()
        .map(|d| !d.is_empty())
        .unwrap_or(false);
    #[allow(unused_mut)]
    let mut microphone = "unknown".to_string();
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        if let Ok(o) = std::process::Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone",
                "/v",
                "Value",
            ])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .output()
        {
            microphone = mic_consent_from_reg(&String::from_utf8_lossy(&o.stdout)).to_string();
        }
    }
    let protection = match current_strategy().protection {
        CaptureProtection::Exclude => "exclude",
        CaptureProtection::Monitor => "monitor",
        CaptureProtection::SharingNone => "sharing_none",
        CaptureProtection::None => "none",
    };
    PermissionStatus {
        os: std::env::consts::OS.into(),
        os_version: os_version(),
        microphone,
        has_output_device,
        has_input_device,
        protection: protection.into(),
    }
}

/// macOS："notch" | "menubar"；其它系统："floating"
#[tauri::command]
pub fn ck_mac_mode() -> String {
    #[cfg(target_os = "macos")]
    {
        return crate::macui::mode().to_string();
    }
    #[allow(unreachable_code)]
    "floating".to_string()
}

/// 只允许打开系统设置类链接（隐私面板 / Windows 设置）
pub fn is_settings_url(url: &str) -> bool {
    (url.starts_with("x-apple.systempreferences:") || url.starts_with("ms-settings:"))
        && url
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ".:?_-".contains(c))
}

#[tauri::command]
pub fn ck_open_settings(url: String) -> Result<(), String> {
    if !is_settings_url(&url) {
        return Err("不支持的链接".into());
    }
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("explorer").arg(&url).spawn();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let r: std::io::Result<std::process::Child> =
        Err(std::io::Error::other("unsupported on this OS"));
    r.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ck_restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_builds_map_to_protection() {
        assert_eq!(windows_strategy(26100).protection, CaptureProtection::Exclude); // Win11 24H2
        assert_eq!(windows_strategy(19041).protection, CaptureProtection::Exclude); // 10 2004
        assert_eq!(windows_strategy(18363).protection, CaptureProtection::Monitor); // 10 1909
        assert_eq!(windows_strategy(9600).protection, CaptureProtection::Monitor); // 8.1
        assert_eq!(windows_strategy(7601).protection, CaptureProtection::Monitor); // 7 SP1
        assert_eq!(windows_strategy(0).protection, CaptureProtection::None);
    }

    #[test]
    fn mac_versions_map_to_strategy() {
        let s11 = mac_strategy(11, 7);
        assert!(!s11.notch_api && !s11.sck_caveat);
        let s14 = mac_strategy(14, 5);
        assert!(s14.notch_api && !s14.sck_caveat);
        let s15 = mac_strategy(15, 0);
        assert!(s15.notch_api && s15.sck_caveat);
        assert!(s15.notes.iter().any(|n| n.contains("ScreenCaptureKit")));
        assert_eq!(mac_strategy(26, 0).protection, CaptureProtection::SharingNone);
    }

    #[test]
    fn parses_versions() {
        assert_eq!(parse_version("15.1.1"), (15, 1));
        assert_eq!(parse_version("26.0\n"), (26, 0));
        assert_eq!(parse_version(""), (0, 0));
    }

    #[test]
    fn only_settings_urls_allowed() {
        assert!(is_settings_url("ms-settings:privacy-microphone"));
        assert!(is_settings_url(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        ));
        assert!(!is_settings_url("https://example.com"));
        assert!(!is_settings_url("ms-settings:a & calc"));
    }

    #[test]
    fn parses_reg_output() {
        let allow = "\r\nHKEY_CURRENT_USER\\...\\microphone\r\n    Value    REG_SZ    Allow\r\n";
        assert_eq!(mic_consent_from_reg(allow), "granted");
        assert_eq!(mic_consent_from_reg("    Value    REG_SZ    Deny"), "denied");
        assert_eq!(mic_consent_from_reg("ERROR: not found"), "unknown");
    }
}
