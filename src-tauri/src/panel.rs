//! 托盘面板：点击菜单栏 / 托盘图标弹出的功能面板（默认界面样式）。
//! 面板是普通 WebView 窗口，和其它窗口一样加防录屏（macOS sharingType = none，
//! Windows WDA_EXCLUDEFROMCAPTURE），因此不用 NSMenu —— NSMenu 无法防录屏。
use std::sync::Mutex;
#[cfg(target_os = "linux")]
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "panel";
const W: f64 = 360.0;
const H: f64 = 560.0;

/// 托盘图标矩形（物理像素 x, y, w, h）
pub static TRAY_RECT: Mutex<Option<(f64, f64, f64, f64)>> = Mutex::new(None);
/// 界面样式："panel"（菜单栏面板，默认）或 "bar"（悬浮条）
static STYLE: Mutex<&'static str> = Mutex::new("panel");
/// 用户拖动过悬浮条（位置已记住）时，显示时不再自动摆放
pub static BAR_POS_SAVED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn style() -> &'static str {
    *STYLE.lock().unwrap_or_else(|e| e.into_inner())
}

/// 面板应出现的位置：托盘图标在屏幕上半部 → 图标下方；在下半部（Windows 任务栏）→ 图标上方。
pub fn panel_origin(
    tray: Option<(f64, f64, f64, f64)>,
    monitor: (f64, f64, f64, f64),
    size: (f64, f64),
    scale: f64,
) -> (f64, f64) {
    let (mx, my, mw, mh) = monitor;
    let (w, h) = size;
    let gap = 6.0 * scale;
    let (x, y) = match tray {
        Some((tx, ty, tw, th)) => {
            let x = tx + tw / 2.0 - w / 2.0;
            if ty - my < mh / 2.0 {
                (x, ty + th + gap)
            } else {
                (x, ty - h - gap)
            }
        }
        None => (mx + mw - w - 12.0 * scale, my + 32.0 * scale),
    };
    let min_x = mx + 8.0 * scale;
    let max_x = mx + mw - w - 8.0 * scale;
    let x = if max_x > min_x { x.clamp(min_x, max_x) } else { x };
    (x, y.max(my))
}

fn ensure_panel<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("/panel".into()))
        .title("CK Pluely")
        .inner_size(W, H)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .shadow(false)
        .content_protected(true)
        .visible_on_all_workspaces(true)
        .build()?;
    crate::privacy::harden(&w);
    let w2 = w.clone();
    w.on_window_event(move |e| {
        if let tauri::WindowEvent::Focused(false) = e {
            let _ = w2.hide();
        }
    });
    Ok(w)
}

pub fn show_panel<R: Runtime>(app: &AppHandle<R>) {
    let Ok(w) = ensure_panel(app) else { return };
    let tray = *TRAY_RECT.lock().unwrap_or_else(|e| e.into_inner());
    if let Ok(Some(mon)) = w.primary_monitor() {
        let scale = mon.scale_factor();
        let (mp, ms) = (mon.position(), mon.size());
        let (x, y) = panel_origin(
            tray,
            (mp.x as f64, mp.y as f64, ms.width as f64, ms.height as f64),
            (W * scale, H * scale),
            scale,
        );
        let _ = w.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    }
    crate::privacy::harden(&w);
    let _ = w.show();
    let _ = w.set_focus();
    #[cfg(target_os = "macos")]
    crate::macui::set_popup_level(&w);
}

pub fn toggle_panel<R: Runtime>(app: &AppHandle<R>) {
    match app.get_webview_window(LABEL).map(|w| w.is_visible()) {
        Some(Ok(true)) => {
            if let Some(w) = app.get_webview_window(LABEL) {
                let _ = w.hide();
            }
        }
        _ => show_panel(app),
    }
}

fn on_tray_click<R: Runtime>(app: &AppHandle<R>) {
    if style() == "panel" {
        toggle_panel(app);
    } else {
        crate::shortcuts::handle_toggle_window(app);
    }
}

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id("ck-main")
        .tooltip("CK Pluely")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                rect,
                button: MouseButton::Left | MouseButton::Right,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let scale = app
                    .get_webview_window("main")
                    .and_then(|w| w.scale_factor().ok())
                    .unwrap_or(1.0);
                let p = rect.position.to_physical::<f64>(scale);
                let s = rect.size.to_physical::<f64>(scale);
                *TRAY_RECT.lock().unwrap_or_else(|e| e.into_inner()) =
                    Some((p.x, p.y, s.width, s.height));
                on_tray_click(app);
            }
        });
    // Linux 的托盘不产生点击事件，只能挂菜单；Linux 本身也没有系统级防录屏。
    #[cfg(target_os = "linux")]
    {
        let open = MenuItem::with_id(app, "ck-panel", "打开面板", true, None::<&str>)?;
        let quit = MenuItem::with_id(app, "ck-quit", "退出", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&open, &quit])?;
        builder = builder.menu(&menu).on_menu_event(|app, e| match e.id().as_ref() {
            "ck-panel" => on_tray_click(app),
            "ck-quit" => app.exit(0),
            _ => {}
        });
    }
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    builder = builder.icon(icon);
    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(true);
    }
    builder.build(app)?;
    Ok(())
}

#[tauri::command]
pub fn ck_set_ui_style(app: AppHandle, style: String, saved_pos: Option<bool>) {
    if let Some(v) = saved_pos {
        BAR_POS_SAVED.store(v, std::sync::atomic::Ordering::Relaxed);
    }
    let s: &'static str = if style == "bar" { "bar" } else { "panel" };
    *STYLE.lock().unwrap_or_else(|e| e.into_inner()) = s;
    if s == "bar" {
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.hide();
        }
    }
}

#[tauri::command]
pub fn ck_toggle_panel(app: AppHandle) {
    toggle_panel(&app);
}

#[tauri::command]
pub fn ck_hide_panel(app: AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
    }
}

/// 面板里的按钮：先收起面板，再执行与全局快捷键相同的动作。
#[tauri::command]
pub fn ck_panel_action(app: AppHandle, action: String) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
    }
    match action.as_str() {
        "dashboard" => {
            let _ = crate::window::show_dashboard_window(&app);
        }
        "quit" => app.exit(0),
        "show_bar" => {
            if let Some(w) = app.get_webview_window("main") {
                if !w.is_visible().unwrap_or(false) {
                    crate::shortcuts::handle_toggle_window(&app);
                }
            }
        }
        "hide_bar" => {
            if let Some(w) = app.get_webview_window("main") {
                if w.is_visible().unwrap_or(false) {
                    crate::shortcuts::handle_toggle_window(&app);
                }
            }
        }
        other => crate::shortcuts::handle_shortcut_action(&app, other),
    }
}

#[cfg(test)]
mod tests {
    use super::panel_origin;

    #[test]
    fn under_menu_bar_icon() {
        let (x, y) = panel_origin(Some((1500.0, 0.0, 40.0, 48.0)), (0.0, 0.0, 2880.0, 1800.0), (720.0, 1120.0), 2.0);
        assert_eq!((x, y), (1160.0, 60.0));
    }
    #[test]
    fn above_windows_taskbar_icon() {
        let (x, y) = panel_origin(Some((1700.0, 1040.0, 24.0, 40.0)), (0.0, 0.0, 1920.0, 1080.0), (360.0, 560.0), 1.0);
        assert_eq!((x, y), (1532.0, 474.0));
    }
    #[test]
    fn clamped_and_fallback() {
        let (x, _) = panel_origin(Some((1900.0, 0.0, 20.0, 24.0)), (0.0, 0.0, 1920.0, 1080.0), (360.0, 560.0), 1.0);
        assert_eq!(x, 1552.0);
        assert_eq!(panel_origin(None, (0.0, 0.0, 1920.0, 1080.0), (360.0, 560.0), 1.0), (1548.0, 32.0));
    }
}
