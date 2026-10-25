//! 共享屏幕隐私：让所有窗口在录屏/共享中不可见，而本人仍能看到。
//! - Windows 10 2004+：SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)，窗口在共享画面中完全消失；
//!   更早的 Windows 回退为 WDA_MONITOR（共享画面中显示为黑块）。
//! - macOS：NSWindow.sharingType = none（Tauri content_protected）。macOS 15+ 基于
//!   ScreenCaptureKit 的整屏共享可能仍能看到窗口（Apple 无公开 API 可阻止），需配合「一键隐藏」或改为共享单个窗口。
//! - Linux：无系统级防截屏接口。
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

#[derive(Clone, Serialize, Default)]
pub struct PrivacyStatus {
    pub os: String,
    pub os_version: String,
    /// "exclude" | "monitor" | "sharing_none" | "none"
    pub method: String,
    pub windows: Vec<WindowPrivacy>,
    /// 按检测到的系统版本给出的中文说明（含局限）
    pub notes: Vec<String>,
}

#[derive(Clone, Serialize)]
pub struct WindowPrivacy {
    pub label: String,
    pub visible: bool,
    pub method: String,
}

static HIDDEN_BY_HOTKEY: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// 对单个窗口施加防录屏保护，返回实际生效的方式。
pub fn harden<R: Runtime>(window: &WebviewWindow<R>) -> String {
    let _ = window.set_content_protected(true);
    #[cfg(target_os = "windows")]
    {
        return win::apply(window);
    }
    #[cfg(target_os = "macos")]
    {
        let _ = window;
        return "sharing_none".into();
    }
    #[allow(unreachable_code)]
    {
        let _ = window;
        "none".into()
    }
}

pub fn harden_all<R: Runtime>(app: &AppHandle<R>) {
    for (_, w) in app.webview_windows() {
        harden(&w);
    }
}

#[tauri::command]
pub fn privacy_harden_all(app: AppHandle) {
    harden_all(&app);
}

#[tauri::command]
pub fn privacy_status(app: AppHandle) -> PrivacyStatus {
    let mut windows = Vec::new();
    let mut method = String::from("none");
    for (label, w) in app.webview_windows() {
        let m = harden(&w);
        if label == "main" || method == "none" {
            method = m.clone();
        }
        windows.push(WindowPrivacy {
            label,
            visible: w.is_visible().unwrap_or(false),
            method: m,
        });
    }
    windows.sort_by(|a, b| a.label.cmp(&b.label));
    PrivacyStatus {
        os: std::env::consts::OS.into(),
        os_version: crate::osinfo::os_version(),
        method,
        windows,
        notes: crate::osinfo::current_strategy().notes,
    }
}

/// 忘掉「一键隐藏」记录（用户主动打开应用时调用，避免下次按快捷键反而把窗口又藏起来）
pub fn clear_hidden_state() {
    HIDDEN_BY_HOTKEY
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clear();
}

/// 一键隐藏/恢复全部窗口（共享屏幕时的保底手段，各平台都有效）。
pub fn toggle_hide_all<R: Runtime>(app: &AppHandle<R>) {
    let mut hidden = HIDDEN_BY_HOTKEY.lock().unwrap_or_else(|e| e.into_inner());
    let visible: Vec<_> = app
        .webview_windows()
        .into_iter()
        .filter(|(_, w)| w.is_visible().unwrap_or(false))
        .collect();
    if !visible.is_empty() {
        hidden.clear();
        for (label, w) in visible {
            let _ = w.hide();
            hidden.push(label);
        }
    } else {
        for label in hidden.drain(..) {
            if let Some(w) = app.get_webview_window(&label) {
                harden(&w);
                let _ = w.show();
            }
        }
    }
}

#[tauri::command]
pub fn hide_all_windows(app: AppHandle) {
    toggle_hide_all(&app);
}

/// Windows：在任务栏隐藏的同时也从 Alt+Tab 中隐藏（WS_EX_TOOLWINDOW）。
#[allow(unused_variables)]
pub fn set_hide_from_alt_tab<R: Runtime>(window: &WebviewWindow<R>, hide: bool) {
    #[cfg(target_os = "windows")]
    win::tool_window(window, hide);
}

#[cfg(target_os = "windows")]
mod win {
    use tauri::{Runtime, WebviewWindow};
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowDisplayAffinity, SetWindowLongPtrW, GWL_EXSTYLE,
        WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
    };
    const WDA_MONITOR: u32 = 0x1;
    const WDA_EXCLUDEFROMCAPTURE: u32 = 0x11;

    fn hwnd<R: Runtime>(w: &WebviewWindow<R>) -> Option<HWND> {
        w.hwnd().ok().map(|h| h.0 as HWND)
    }

    pub fn apply<R: Runtime>(w: &WebviewWindow<R>) -> String {
        let Some(h) = hwnd(w) else {
            return "none".into();
        };
        unsafe {
            // WDA_EXCLUDEFROMCAPTURE 需要 Windows 10 2004（build 19041）及以上
            if SetWindowDisplayAffinity(h, WDA_EXCLUDEFROMCAPTURE) != 0 {
                return "exclude".into();
            }
            if SetWindowDisplayAffinity(h, WDA_MONITOR) != 0 {
                return "monitor".into();
            }
        }
        "none".into()
    }

    pub fn tool_window<R: Runtime>(w: &WebviewWindow<R>, hide: bool) {
        let Some(h) = hwnd(w) else { return };
        unsafe {
            let mut ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            if hide {
                ex = (ex | WS_EX_TOOLWINDOW as isize) & !(WS_EX_APPWINDOW as isize);
            } else {
                ex &= !(WS_EX_TOOLWINDOW as isize);
            }
            SetWindowLongPtrW(h, GWL_EXSTYLE, ex);
        }
    }
}
