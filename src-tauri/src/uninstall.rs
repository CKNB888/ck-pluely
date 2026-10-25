//! 「完全卸载」: everything this app writes, per OS. Paths are built only from
//! the bundle identifier and product name; nothing outside them is touched.

use std::path::{Path, PathBuf};

pub const BUNDLE_ID: &str = "io.github.cknb6.ckpluely";
pub const PRODUCT: &str = "CK Pluely";

/// Per-user locations to delete. `appdata` / `localappdata` are only used on Windows.
pub fn data_paths(
    os: &str,
    home: &Path,
    appdata: Option<&Path>,
    localappdata: Option<&Path>,
) -> Vec<PathBuf> {
    match os {
        "macos" => {
            let lib = home.join("Library");
            vec![
                lib.join("Application Support").join(BUNDLE_ID),
                lib.join("Caches").join(BUNDLE_ID),
                lib.join("WebKit").join(BUNDLE_ID),
                lib.join("HTTPStorages").join(BUNDLE_ID),
                lib.join("Logs").join(BUNDLE_ID),
                lib.join("Preferences").join(format!("{BUNDLE_ID}.plist")),
                lib.join("Saved Application State")
                    .join(format!("{BUNDLE_ID}.savedState")),
                lib.join("LaunchAgents").join(format!("{PRODUCT}.plist")),
            ]
        }
        "windows" => {
            let mut v = Vec::new();
            if let Some(a) = appdata {
                v.push(a.join(BUNDLE_ID));
            }
            if let Some(l) = localappdata {
                // Includes EBWebView (WebView2 profile) and logs.
                v.push(l.join(BUNDLE_ID));
            }
            v
        }
        _ => vec![
            home.join(".config").join(BUNDLE_ID),
            home.join(".local/share").join(BUNDLE_ID),
            home.join(".cache").join(BUNDLE_ID),
            home.join(".config/autostart").join(format!("{PRODUCT}.desktop")),
        ],
    }
}

/// Last line of defence: a path must name this app in its final component.
pub fn is_safe(p: &Path) -> bool {
    p.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with(BUNDLE_ID) || n.starts_with(PRODUCT))
        .unwrap_or(false)
}

fn current_paths() -> Vec<PathBuf> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .unwrap_or_default();
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    data_paths(
        std::env::consts::OS,
        &home,
        appdata.as_deref(),
        local.as_deref(),
    )
}

#[tauri::command]
pub fn ck_uninstall_paths() -> Vec<String> {
    current_paths()
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// Deletes keychain entries (accounts listed by the frontend), login item,
/// data folders, then removes the app (macOS: to Trash; Windows: runs the
/// uninstaller; Linux: the package stays, see README) and quits.
#[tauri::command]
pub fn ck_full_uninstall(app: tauri::AppHandle, accounts: Vec<String>) -> Result<(), String> {
    {
        use tauri_plugin_autostart::ManagerExt;
        let _ = app.autolaunch().disable();
    }
    for a in &accounts {
        let _ = crate::ck::ck_secret_delete(a.clone());
    }
    // Release model files first (Windows cannot delete mapped files).
    {
        use tauri::Manager;
        if let Some(s) = app.try_state::<crate::local::engine::LocalState>() {
            crate::local::engine::unload_now(&s);
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
    }
    let paths: Vec<PathBuf> = current_paths().into_iter().filter(|p| is_safe(p)).collect();
    for p in &paths {
        if p.is_dir() {
            let _ = std::fs::remove_dir_all(p);
        } else if p.exists() {
            let _ = std::fs::remove_file(p);
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(bundle) = exe.ancestors().find(|a| a.extension().map(|e| e == "app").unwrap_or(false)) {
                let script = format!(
                    "tell application \"Finder\" to delete (POSIX file \"{}\" as alias)",
                    bundle.display().to_string().replace('"', "")
                );
                let _ = std::process::Command::new("osascript").arg("-e").arg(script).spawn();
            }
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED: u32 = 0x0000_0008 | 0x0800_0000;
        // WebView2 keeps its profile locked while we run: delete after exit.
        let dirs: Vec<String> = paths
            .iter()
            .map(|p| format!("rmdir /s /q \"{}\"", p.display()))
            .collect();
        let mut cmd = format!("timeout /t 3 /nobreak >nul & {}", dirs.join(" & "));
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let un = dir.join("uninstall.exe");
                if un.exists() {
                    cmd.push_str(&format!(" & start \"\" \"{}\"", un.display()));
                }
            }
        }
        let _ = std::process::Command::new("cmd")
            .args(["/C", &cmd])
            .creation_flags(DETACHED)
            .spawn();
    }
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linux_paths_exact() {
        let p = data_paths("linux", Path::new("/home/u"), None, None);
        let s: Vec<_> = p.iter().map(|x| x.to_string_lossy().into_owned()).collect();
        assert_eq!(
            s,
            vec![
                "/home/u/.config/io.github.cknb6.ckpluely",
                "/home/u/.local/share/io.github.cknb6.ckpluely",
                "/home/u/.cache/io.github.cknb6.ckpluely",
                "/home/u/.config/autostart/CK Pluely.desktop",
            ]
        );
        assert!(p.iter().all(|x| is_safe(x)));
    }

    #[test]
    fn windows_paths_exact() {
        let p = data_paths(
            "windows",
            Path::new("C:/Users/u"),
            Some(Path::new("C:/Users/u/AppData/Roaming")),
            Some(Path::new("C:/Users/u/AppData/Local")),
        );
        let s: Vec<_> = p.iter().map(|x| x.to_string_lossy().replace('\\', "/")).collect();
        assert_eq!(
            s,
            vec![
                "C:/Users/u/AppData/Roaming/io.github.cknb6.ckpluely",
                "C:/Users/u/AppData/Local/io.github.cknb6.ckpluely",
            ]
        );
    }

    #[test]
    fn macos_paths_inside_library() {
        let p = data_paths("macos", Path::new("/Users/u"), None, None);
        assert_eq!(p.len(), 8);
        assert!(p.iter().all(|x| x.starts_with("/Users/u/Library") && is_safe(x)));
    }

    /// Speech models, the voiceprint and local settings live in the app
    /// data dir (Tauri `app_data_dir`), so they go with it.
    #[test]
    fn local_models_and_voiceprint_are_covered() {
        let cases = [
            ("linux", "/home/u", "/home/u/.local/share/io.github.cknb6.ckpluely"),
            ("macos", "/Users/u", "/Users/u/Library/Application Support/io.github.cknb6.ckpluely"),
        ];
        for (os, home, data) in cases {
            let p = data_paths(os, Path::new(home), None, None);
            let data = Path::new(data);
            for f in ["models/sensevoice.int8.onnx", "models/campplus_zh-cn.onnx", "voiceprint.json", "local.json"] {
                assert!(p.iter().any(|d| data.join(f).starts_with(d)), "{os} {f}");
            }
        }
    }

    #[test]
    fn unsafe_paths_rejected() {
        assert!(!is_safe(Path::new("/home/u/.config")));
        assert!(!is_safe(Path::new("/")));
        assert!(!is_safe(Path::new("/home/u")));
    }
}
