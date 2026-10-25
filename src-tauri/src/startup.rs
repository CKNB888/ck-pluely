//! 启动日志与致命错误提示。
//! 启动失败时用户必须能看到原因：写入 startup.log，并弹出系统对话框（不依赖 WebView）。
use std::io::Write;
use std::path::PathBuf;

const ID: &str = "io.github.cknb6.ckpluely";

/// 日志目录：macOS ~/Library/Logs/<id>；Windows %LOCALAPPDATA%\<id>\logs；Linux ~/.local/share/<id>/logs
pub fn log_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    return std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Logs").join(ID));
    #[cfg(target_os = "windows")]
    return std::env::var_os("LOCALAPPDATA").map(|h| PathBuf::from(h).join(ID).join("logs"));
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
        .map(|d| d.join(ID).join("logs"));
}

pub fn log_path() -> Option<PathBuf> {
    log_dir().map(|d| d.join("startup.log"))
}

/// 新一次启动：超过 256 KB 时轮换，然后写一行分隔。
pub fn begin() {
    if let Some(p) = log_path() {
        let _ = std::fs::create_dir_all(p.parent().unwrap_or(&p));
        if std::fs::metadata(&p)
            .map(|m| m.len() > 256 * 1024)
            .unwrap_or(false)
        {
            let _ = std::fs::rename(&p, p.with_extension("old.log"));
        }
    }
    log(&format!(
        "==== 启动 v{} {} {} args={:?}",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH,
        std::env::args().skip(1).collect::<Vec<_>>()
    ));
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("程序崩溃：{info}");
        log(&msg);
        alert(&msg);
    }));
}

pub fn log(msg: &str) {
    eprintln!("[startup] {msg}");
    let Some(p) = log_path() else { return };
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(p)
    {
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(f, "{t} {msg}");
    }
}

/// 记录并弹出对话框，不退出。
pub fn alert(msg: &str) {
    let where_ = log_path()
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    let text = format!("CK Pluely 启动遇到问题：\n{msg}\n\n日志：{where_}");
    #[cfg(target_os = "macos")]
    {
        let esc = text.replace('\\', "\\\\").replace('"', "\\\"");
        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(format!(
                "display alert \"CK Pluely\" message \"{esc}\" as critical"
            ))
            .spawn();
    }
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let w = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
        let (t, c) = (w(&text), w("CK Pluely"));
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                t.as_ptr(),
                c.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let ok = std::process::Command::new("zenity")
            .args(["--error", "--title=CK Pluely", &format!("--text={text}")])
            .spawn()
            .is_ok();
        if !ok {
            let _ = std::process::Command::new("notify-send")
                .args(["CK Pluely", &text])
                .spawn();
        }
    }
}

/// 是否由开机自启动拉起（自启动时不弹面板）
pub fn launched_at_login() -> bool {
    std::env::args().any(|a| a == "--autostart")
}

#[cfg(test)]
mod tests {
    #[test]
    fn log_dir_is_app_scoped() {
        if let Some(d) = super::log_dir() {
            assert!(d.to_string_lossy().contains(super::ID));
        }
    }
}
