//! macOS：刘海（Dynamic Island 风格）/ 菜单栏模式。
//! - 菜单栏所在屏 safeAreaInsets.top > 0（macOS 12+）→ 有刘海：主条贴在屏幕顶部中央，像刘海一样。
//! - 否则 → 菜单栏应用：状态栏图标，点击后主条出现在图标正下方，不在 Dock 显示。
//!   每次显示都会重新检测（外接显示器/合盖切换后自动适配）。
#![allow(unexpected_cfgs)]

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, Emitter, Manager, PhysicalPosition, Runtime, WebviewWindow};
use tauri_nspanel::objc::runtime::{Object, BOOL, YES};
use tauri_nspanel::objc::{class, msg_send, sel, sel_impl};

/// 托盘图标的屏幕矩形（物理像素 x, y, w, h）
static TRAY_RECT: Mutex<Option<(f64, f64, f64, f64)>> = Mutex::new(None);

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct NSEdgeInsets {
    top: f64,
    left: f64,
    bottom: f64,
    right: f64,
}

/// 菜单栏所在屏（NSScreen.screens[0]）是否有刘海
pub fn main_screen_has_notch() -> bool {
    // SAFETY: plain AppKit getters on the main thread-safe NSScreen class; selector checked first.
    unsafe {
        let screens: *mut Object = msg_send![class!(NSScreen), screens];
        if screens.is_null() {
            return false;
        }
        let count: usize = msg_send![screens, count];
        if count == 0 {
            return false;
        }
        let screen: *mut Object = msg_send![screens, objectAtIndex: 0usize];
        if screen.is_null() {
            return false;
        }
        let responds: BOOL = msg_send![screen, respondsToSelector: sel!(safeAreaInsets)];
        if responds != YES {
            return false; // macOS 11 及更早：没有刘海 API
        }
        let insets: NSEdgeInsets = msg_send![screen, safeAreaInsets];
        insets.top > 0.0
    }
}

pub fn mode() -> &'static str {
    if main_screen_has_notch() {
        "notch"
    } else {
        "menubar"
    }
}

fn set_level<R: Runtime>(window: &WebviewWindow<R>, level: i64) {
    if let Ok(ns) = window.ns_window() {
        let ns = ns as *mut Object;
        if !ns.is_null() {
            // SAFETY: ns is the live NSWindow of this webview window.
            unsafe {
                let _: () = msg_send![ns, setLevel: level];
            }
        }
    }
}

/// 根据当前模式摆放主条，返回模式名
pub fn place_main<R: Runtime>(window: &WebviewWindow<R>) -> &'static str {
    let m = mode();
    let monitor = window.primary_monitor().ok().flatten();
    let size = window.outer_size().ok();
    if let (Some(mon), Some(sz)) = (monitor, size) {
        let mp = mon.position();
        let ms = mon.size();
        let scale = mon.scale_factor();
        let w = sz.width as f64;
        let (x, y) = if m == "notch" {
            (mp.x as f64 + (ms.width as f64 - w) / 2.0, mp.y as f64)
        } else {
            let rect = *TRAY_RECT.lock().unwrap_or_else(|e| e.into_inner());
            match rect {
                Some((tx, ty, tw, th)) => (tx + tw / 2.0 - w / 2.0, ty + th + 6.0 * scale),
                None => (
                    mp.x as f64 + ms.width as f64 - w - 12.0 * scale,
                    mp.y as f64 + 30.0 * scale,
                ),
            }
        };
        let min_x = mp.x as f64 + 8.0 * scale;
        let max_x = mp.x as f64 + ms.width as f64 - w - 8.0 * scale;
        let x = if max_x > min_x { x.clamp(min_x, max_x) } else { x };
        let _ = window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    }
    // 刘海模式要盖在菜单栏那一层（NSStatusWindowLevel = 25），菜单栏模式为浮动层（3）
    set_level(window, if m == "notch" { 25 } else { 3 });
    let _ = window.emit("ck-mac-mode", m);
    m
}

pub fn setup<R: Runtime>(app: &mut App<R>) -> tauri::Result<()> {
    let handle = app.handle().clone();
    let open = MenuItem::with_id(&handle, "ck-show", "显示 / 隐藏主条", true, None::<&str>)?;
    let dash = MenuItem::with_id(&handle, "ck-dashboard", "打开控制台", true, None::<&str>)?;
    let quit = MenuItem::with_id(&handle, "ck-quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(&handle, &[&open, &dash, &quit])?;

    let mut builder = TrayIconBuilder::with_id("ck-main")
        .tooltip("CK Pluely")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "ck-show" => crate::shortcuts::handle_toggle_window(app),
            "ck-dashboard" => {
                let _ = crate::window::show_dashboard_window(app);
            }
            "ck-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                rect,
                button: MouseButton::Left,
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
                crate::shortcuts::handle_toggle_window(app);
            }
        });
    if let Some(icon) = handle.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(&handle)?;

    let notch = main_screen_has_notch();
    if !notch {
        // 菜单栏应用：不占 Dock，启动时只显示状态栏图标
        app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    }
    if let Some(window) = handle.get_webview_window("main") {
        place_main(&window);
        if !notch {
            let _ = window.hide();
        }
    }
    Ok(())
}
