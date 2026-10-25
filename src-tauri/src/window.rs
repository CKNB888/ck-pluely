#[cfg(target_os = "macos")]
use tauri::LogicalPosition;
use tauri::{App, AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

// The offset from the top of the screen to the window
const TOP_OFFSET: i32 = 54;

/// Sets up the main window with custom positioning
pub fn setup_main_window(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // Try different possible window labels
    let window = app
        .get_webview_window("main")
        .or_else(|| app.get_webview_window("pluely"))
        .or_else(|| {
            // Get the first window if specific labels don't work
            app.webview_windows().values().next().cloned()
        })
        .ok_or("No window found")?;

    position_window_top_center(&window, TOP_OFFSET)?;

    // Set window as non-focusable on Windows
    // #[cfg(target_os = "windows")]
    // {
    //     let _ = window.set_focusable(false);
    // }

    Ok(())
}

/// Positions a window at the top center of the screen with a specified Y offset
pub fn position_window_top_center(
    window: &WebviewWindow,
    y_offset: i32,
) -> Result<(), Box<dyn std::error::Error>> {
    // Get the primary monitor
    if let Some(monitor) = window.primary_monitor()? {
        let monitor_size = monitor.size();
        let window_size = window.outer_size()?;

        // Calculate center X position
        let center_x = (monitor_size.width as i32 - window_size.width as i32) / 2;

        // Set the window position
        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: center_x,
            y: y_offset,
        }))?;
    }

    Ok(())
}

/// Moves the window back onto a screen when less than a sliver of it is
/// visible on any monitor (monitor unplugged, resolution/DPI change, or moved
/// off-screen with the move-window hotkeys).
pub fn ensure_on_screen<R: Runtime>(window: &WebviewWindow<R>) {
    let (Ok(pos), Ok(size), Ok(monitors)) = (
        window.outer_position(),
        window.outer_size(),
        window.available_monitors(),
    ) else {
        return;
    };
    if monitors.is_empty() {
        return;
    }
    let (w, h) = (size.width as i32, size.height as i32);
    let visible = monitors.iter().any(|m| {
        let (mp, ms) = (m.position(), m.size());
        let ix = (pos.x + w).min(mp.x + ms.width as i32) - pos.x.max(mp.x);
        let iy = (pos.y + h).min(mp.y + ms.height as i32) - pos.y.max(mp.y);
        ix >= 80 && iy >= 24
    });
    if visible {
        return;
    }
    let target = window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| monitors.into_iter().next());
    if let Some(m) = target {
        let (mp, ms) = (m.position(), m.size());
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: mp.x + (ms.width as i32 - w) / 2,
            y: mp.y + TOP_OFFSET,
        }));
    }
}

/// Future function for centering window completely (both X and Y)
#[allow(dead_code)]
pub fn center_window_completely(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(monitor) = window.primary_monitor()? {
        let monitor_size = monitor.size();
        let window_size = window.outer_size()?;

        let center_x = (monitor_size.width as i32 - window_size.width as i32) / 2;
        let center_y = (monitor_size.height as i32 - window_size.height as i32) / 2;

        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: center_x,
            y: center_y,
        }))?;
    }

    Ok(())
}

#[tauri::command]
pub fn set_window_height(window: tauri::WebviewWindow, height: u32) -> Result<(), String> {
    use tauri::{LogicalSize, Size};

    // Simply set the window size with fixed width and new height
    let new_size = LogicalSize::new(600.0, height as f64);
    window
        .set_size(Size::Logical(new_size))
        .map_err(|e| format!("Failed to resize window: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn open_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    show_dashboard_window(&app)
}

#[tauri::command]
pub fn toggle_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(dashboard_window) = app.get_webview_window("dashboard") {
        match dashboard_window.is_visible() {
            Ok(true) => {
                // Window is visible, hide it
                dashboard_window
                    .hide()
                    .map_err(|e| format!("Failed to hide dashboard window: {}", e))?;
                schedule_dashboard_release(&app);
            }
            Ok(false) => {
                // Window is hidden, show and focus it
                cancel_dashboard_release();
                dashboard_window
                    .show()
                    .map_err(|e| format!("Failed to show dashboard window: {}", e))?;
                dashboard_window
                    .set_focus()
                    .map_err(|e| format!("Failed to focus dashboard window: {}", e))?;
            }
            Err(e) => {
                return Err(format!("Failed to check dashboard visibility: {}", e));
            }
        }
    } else {
        // Window doesn't exist, create and show it
        show_dashboard_window(&app)?;
    }

    Ok(())
}

#[tauri::command]
pub fn move_window(app: tauri::AppHandle, direction: String, step: i32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let current_pos = window
            .outer_position()
            .map_err(|e| format!("Failed to get window position: {}", e))?;

        let (new_x, new_y) = match direction.as_str() {
            "up" => (current_pos.x, current_pos.y - step),
            "down" => (current_pos.x, current_pos.y + step),
            "left" => (current_pos.x - step, current_pos.y),
            "right" => (current_pos.x + step, current_pos.y),
            _ => return Err(format!("Invalid direction: {}", direction)),
        };

        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: new_x,
                y: new_y,
            }))
            .map_err(|e| format!("Failed to set window position: {}", e))?;
    } else {
        return Err("Main window not found".to_string());
    }

    Ok(())
}

pub fn create_dashboard_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<WebviewWindow<R>, tauri::Error> {
    let base_builder =
        WebviewWindowBuilder::new(app, "dashboard", tauri::WebviewUrl::App("/chats".into()));

    #[cfg(target_os = "macos")]
    let base_builder = base_builder
        .title("CK Pluely - 控制台")
        .center()
        .decorations(true)
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .content_protected(true)
        .visible(true)
        .traffic_light_position(LogicalPosition::new(14.0, 18.0));

    #[cfg(not(target_os = "macos"))]
    let base_builder = base_builder
        .title("CK Pluely - 控制台")
        .center()
        .decorations(true)
        .inner_size(800.0, 600.0)
        .min_inner_size(800.0, 600.0)
        .content_protected(true)
        .visible(false);

    let window = base_builder.build()?;

    // Set up close event handler - hide window instead of destroying it
    setup_dashboard_close_handler(&window);

    Ok(window)
}

/// 控制台关闭后隐藏多久就彻底销毁（释放它独占的 WebView 进程，约 150–180 MB）。
pub const DASHBOARD_RELEASE_SECS: u64 = 300;

static DASHBOARD_HIDE_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// 控制台被隐藏时调用：若 DASHBOARD_RELEASE_SECS 内没有再次打开，就销毁窗口。
/// 下次打开时 show_dashboard_window 会重新创建（约 0.3–0.6 秒）。
pub fn schedule_dashboard_release<R: Runtime>(app: &AppHandle<R>) {
    use std::sync::atomic::Ordering;
    let gen = DASHBOARD_HIDE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        // CK_DASHBOARD_RELEASE_SECS 仅用于测试内存回收
        let secs = std::env::var("CK_DASHBOARD_RELEASE_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DASHBOARD_RELEASE_SECS);
        std::thread::sleep(std::time::Duration::from_secs(secs));
        if DASHBOARD_HIDE_GEN.load(Ordering::SeqCst) != gen {
            return; // 期间又被打开 / 再次隐藏过，以最新一次为准
        }
        if let Some(w) = app.get_webview_window("dashboard") {
            if w.is_visible().ok() == Some(false) {
                let _ = w.destroy();
            }
        }
    });
}

/// 控制台重新显示时调用，取消待执行的销毁。
pub fn cancel_dashboard_release() {
    DASHBOARD_HIDE_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
}

/// Sets up the close event handler for the dashboard window
fn setup_dashboard_close_handler<R: Runtime>(window: &WebviewWindow<R>) {
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            // 先隐藏（再次打开是瞬间的），一段时间不用再销毁以释放内存
            api.prevent_close();
            if let Err(e) = window_clone.hide() {
                eprintln!("Failed to hide dashboard window on close: {}", e);
            }
            schedule_dashboard_release(window_clone.app_handle());
        }
    });
}

/// Shows the dashboard window and brings it to focus
pub fn show_dashboard_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    cancel_dashboard_release();
    // 菜单栏（Accessory）模式下也要把应用激活到前台，否则引导 / 控制台窗口会开在别的应用后面
    #[cfg(target_os = "macos")]
    let _ = app.show();
    crate::startup::log("show dashboard");
    if let Some(dashboard_window) = app.get_webview_window("dashboard") {
        // Window exists, show and focus it
        crate::privacy::harden(&dashboard_window);
        dashboard_window
            .show()
            .map_err(|e| format!("Failed to show dashboard window: {}", e))?;
        dashboard_window
            .set_focus()
            .map_err(|e| format!("Failed to focus dashboard window: {}", e))?;
    } else {
        // Window doesn't exist, create it and then show it
        let window = create_dashboard_window(app)
            .map_err(|e| format!("Failed to create dashboard window: {}", e))?;
        window
            .show()
            .map_err(|e| format!("Failed to show new dashboard window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus new dashboard window: {}", e))?;
    }
    Ok(())
}

/// ck-pluely v2: put the floating bar at the top centre of another screen.
/// `target`: "cursor" (screen under the mouse), "primary", or "next".
#[tauri::command]
pub fn ck_move_bar_to_screen(app: tauri::AppHandle, target: String) -> Result<String, String> {
    let w = app.get_webview_window("main").ok_or("悬浮条未创建")?;
    let monitors = w.available_monitors().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("没有检测到显示器".into());
    }
    let current = w.current_monitor().ok().flatten();
    let same = |a: &tauri::Monitor, b: &tauri::Monitor| {
        a.position() == b.position() && a.size() == b.size()
    };
    let pick = match target.as_str() {
        "primary" => w.primary_monitor().ok().flatten(),
        "next" => {
            let i = current
                .as_ref()
                .and_then(|c| monitors.iter().position(|m| same(m, c)))
                .unwrap_or(0);
            monitors.get((i + 1) % monitors.len()).cloned()
        }
        _ => {
            let p = app.cursor_position().map_err(|e| e.to_string())?;
            monitors
                .iter()
                .find(|m| {
                    let (mp, ms) = (m.position(), m.size());
                    p.x >= mp.x as f64
                        && p.y >= mp.y as f64
                        && p.x < (mp.x + ms.width as i32) as f64
                        && p.y < (mp.y + ms.height as i32) as f64
                })
                .cloned()
        }
    }
    .ok_or("找不到目标显示器")?;
    let size = w.outer_size().map_err(|e| e.to_string())?;
    let (mp, ms) = (pick.position(), pick.size());
    let x = mp.x + (ms.width as i32 - size.width as i32) / 2;
    let y = mp.y + (40.0 * pick.scale_factor()) as i32;
    w.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
        .map_err(|e| e.to_string())?;
    Ok(pick
        .name()
        .cloned()
        .unwrap_or_else(|| format!("{}x{}", ms.width, ms.height)))
}

/// Number of connected screens (to hide the screen picker on one monitor).
#[tauri::command]
pub fn ck_screen_count(app: tauri::AppHandle) -> usize {
    app.get_webview_window("main")
        .and_then(|w| w.available_monitors().ok())
        .map(|m| m.len())
        .unwrap_or(1)
}
