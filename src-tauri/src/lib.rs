// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod activate;
mod api;
mod capture;
mod ck;
mod db;
mod privacy;
mod shortcuts;
mod window;
use std::sync::{Arc, Mutex};
use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_posthog::{init as posthog_init, PostHogConfig, PostHogOptions};
use tokio::task::JoinHandle;
mod speaker;
mod osinfo;
mod local;
mod notes;
mod uninstall;
mod backup;
mod net;
#[cfg(target_os = "macos")]
mod macui;
mod panel;
use capture::CaptureState;
use speaker::VadConfig;

#[cfg(target_os = "macos")]
#[allow(deprecated)]
use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, panel_delegate, WebviewWindowExt};

#[derive(Default)]
pub struct AudioState {
    stream_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    vad_config: Arc<Mutex<VadConfig>>,
    is_capturing: Arc<Mutex<bool>>,
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Get PostHog API key
    let posthog_api_key = option_env!("POSTHOG_API_KEY").unwrap_or("").to_string();
    // `mut` is only needed on macOS (nspanel plugin / panel setup).
    #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
    let mut builder = tauri::Builder::default()
        // Must be the first plugin (tauri-plugin-single-instance docs). A
        // second launch would register the same global hotkeys and open a
        // second overlay; instead bring the running instance forward.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                let hidden = *app
                    .state::<shortcuts::WindowVisibility>()
                    .is_hidden
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                #[cfg(not(target_os = "windows"))]
                let hidden = !window.is_visible().unwrap_or(false);
                if hidden {
                    shortcuts::handle_toggle_window(app);
                } else {
                    let _ = window.set_focus();
                }
            }
        }))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:pluely.db", db::migrations())
                .build(),
        )
        .manage(AudioState::default())
        .manage(CaptureState::default())
        .manage(shortcuts::WindowVisibility {
            // 启动时主条隐藏（默认界面为托盘面板）
            is_hidden: Mutex::new(cfg!(target_os = "windows")),
        })
        .manage(shortcuts::RegisteredShortcuts::default())
        .manage(shortcuts::LicenseState::default())
        .manage(shortcuts::MoveWindowState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_keychain::init())
        .plugin(tauri_plugin_shell::init()) // Add shell plugin
        .plugin(posthog_init(PostHogConfig {
            api_key: posthog_api_key,
            options: Some(PostHogOptions {
                // disable session recording
                disable_session_recording: Some(true),
                // disable pageview
                capture_pageview: Some(false),
                // disable pageleave
                capture_pageleave: Some(false),
                ..Default::default()
            }),
            ..Default::default()
        }))
        .plugin(tauri_plugin_machine_uid::init());
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }
    #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
    let mut builder = builder
        // 共享屏幕隐私：页面加载、窗口获得焦点/显示时重新施加防录屏保护
        .on_page_load(|webview, _| {
            if let Some(w) = webview.app_handle().get_webview_window(webview.label()) {
                privacy::harden(&w);
            }
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Focused(true) | tauri::WindowEvent::ScaleFactorChanged { .. }) {
                if let Some(w) = window.app_handle().get_webview_window(window.label()) {
                    privacy::harden(&w);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            privacy::privacy_status,
            notes::ck_export_notes,
            notes::ck_check_update,
            net::ck_http_fetch,
            net::ck_http_body,
            net::ck_http_abort,
            net::ck_http_prewarm,
            backup::ck_backup_export,
            backup::ck_backup_inspect,
            backup::ck_backup_apply,
            backup::ck_backup_discard,
            backup::ck_backup_list,
            backup::ck_backup_dir,
            window::ck_move_bar_to_screen,
            window::ck_screen_count,
            local::commands::local_status,
            local::commands::local_set_settings,
            local::commands::local_download,
            local::commands::local_delete_models,
            local::commands::local_transcribe,
            local::commands::local_unload,
            local::commands::voiceprint_enroll,
            local::commands::voiceprint_test,
            local::commands::voiceprint_delete,
            panel::ck_set_ui_style,
            panel::ck_toggle_panel,
            panel::ck_hide_panel,
            panel::ck_panel_action,
            osinfo::ck_permission_status,
            osinfo::ck_restart_app,
            osinfo::ck_mac_mode,
            osinfo::ck_open_settings,
            privacy::privacy_harden_all,
            privacy::hide_all_windows,
            get_app_version,
            ck::ck_secret_get,
            ck::ck_secret_set,
            ck::ck_secret_delete,
            uninstall::ck_full_uninstall,
            uninstall::ck_uninstall_paths,
            ck::ck_macos_version,
            window::set_window_height,
            window::open_dashboard,
            window::toggle_dashboard,
            window::move_window,
            capture::capture_to_base64,
            capture::start_screen_capture,
            capture::capture_selected_area,
            capture::close_overlay_window,
            shortcuts::check_shortcuts_registered,
            shortcuts::get_registered_shortcuts,
            shortcuts::update_shortcuts,
            shortcuts::validate_shortcut_key,
            shortcuts::set_license_status,
            shortcuts::set_app_icon_visibility,
            shortcuts::set_always_on_top,
            shortcuts::exit_app,
            activate::activate_license_api,
            activate::deactivate_license_api,
            activate::validate_license_api,
            activate::mask_license_key_cmd,
            activate::get_checkout_url,
            activate::secure_storage_save,
            activate::secure_storage_get,
            activate::secure_storage_remove,
            api::transcribe_audio,
            api::chat_stream_response,
            api::fetch_models,
            api::fetch_prompts,
            api::create_system_prompt,
            api::check_license_status,
            api::get_activity,
            speaker::start_system_audio_capture,
            speaker::stop_system_audio_capture,
            speaker::manual_stop_continuous,
            speaker::check_system_audio_access,
            speaker::request_system_audio_access,
            speaker::get_vad_config,
            speaker::update_vad_config,
            speaker::get_capture_status,
            speaker::get_audio_sample_rate,
            speaker::get_input_devices,
            speaker::get_output_devices,
        ])
        .setup(|app| {
            // Setup main window positioning
            window::setup_main_window(app).expect("Failed to setup main window");
            privacy::harden_all(app.handle());
            if let Ok(dir) = app.path().app_data_dir() {
                app.manage(local::engine::LocalState::new(dir));
            }
            #[cfg(target_os = "macos")]
            init(app.app_handle());
            #[cfg(target_os = "macos")]
            if let Err(e) = macui::setup(app) {
                eprintln!("[macui] setup failed: {e}");
            }
            if let Err(e) = panel::setup_tray(app.handle()) {
                eprintln!("[panel] tray setup failed: {e}");
            }
            // 默认界面为菜单栏面板：启动时只留托盘图标，主条由前端按用户设置决定是否显示
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.hide();
            }
            #[cfg(target_os = "macos")]
            let app_handle = app.handle();
            // 内存优化：非 macOS 平台控制台窗口改为首次打开时再创建（省去一个常驻 WebView 进程）
            #[cfg(target_os = "macos")]
            if app_handle.get_webview_window("dashboard").is_none() {
                if let Err(e) = window::create_dashboard_window(app_handle) {
                    eprintln!("Failed to pre-create dashboard window on startup: {}", e);
                }
            }

            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::MacosLauncher;

                #[allow(deprecated, unexpected_cfgs)]
                if let Err(e) = app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    Some(vec![]),
                )) {
                    eprintln!("Failed to initialize autostart plugin: {}", e);
                }
            }

            // Initialize global shortcut plugin with centralized handler
            app.handle()
                .plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

                            let action_id = {
                                let state = app.state::<shortcuts::RegisteredShortcuts>();
                                let registered = match state.shortcuts.lock() {
                                    Ok(guard) => guard,
                                    Err(poisoned) => {
                                        eprintln!("Mutex poisoned in handler, recovering...");
                                        poisoned.into_inner()
                                    }
                                };

                                registered.iter().find_map(|(action_id, shortcut_str)| {
                                    if let Ok(s) = shortcut_str.parse::<Shortcut>() {
                                        if &s == shortcut {
                                            return Some(action_id.clone());
                                        }
                                    }
                                    None
                                })
                            };

                            if let Some(action_id) = action_id {
                                match event.state() {
                                    ShortcutState::Pressed => {
                                        if let Some(direction) =
                                            action_id.strip_prefix("move_window_")
                                        {
                                            shortcuts::start_move_window(app, direction);
                                        } else {
                                            eprintln!("Shortcut triggered: {}", action_id);
                                            shortcuts::handle_shortcut_action(app, &action_id);
                                        }
                                    }
                                    ShortcutState::Released => {
                                        if let Some(direction) =
                                            action_id.strip_prefix("move_window_")
                                        {
                                            shortcuts::stop_move_window(app, direction);
                                        }
                                    }
                                }
                            }
                        })
                        .build(),
                )
                .expect("Failed to initialize global shortcut plugin");
            if let Err(e) = shortcuts::setup_global_shortcuts(app.handle()) {
                eprintln!("Failed to setup global shortcuts: {}", e);
            }
            Ok(())
        });

    // Add macOS-specific permissions plugin
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_plugin_macos_permissions::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "macos")]
#[allow(deprecated, unexpected_cfgs)]
fn init(app_handle: &AppHandle) {
    let window: WebviewWindow = app_handle.get_webview_window("main").unwrap();

    let panel = window.to_panel().unwrap();

    let delegate = panel_delegate!(MyPanelDelegate {
        window_did_become_key,
        window_did_resign_key
    });

    let handle = app_handle.to_owned();

    delegate.set_listener(Box::new(move |delegate_name: String| {
        match delegate_name.as_str() {
            "window_did_become_key" => {
                let app_name = handle.package_info().name.to_owned();

                println!("[info]: {:?} panel becomes key window!", app_name);
            }
            "window_did_resign_key" => {
                println!("[info]: panel resigned from key window!");
            }
            _ => (),
        }
    }));

    // Set the window to float level
    #[allow(non_upper_case_globals)]
    const NSFloatWindowLevel: i32 = 4;
    panel.set_level(NSFloatWindowLevel);

    #[allow(non_upper_case_globals)]
    const NSWindowStyleMaskNonActivatingPanel: i32 = 1 << 7;
    panel.set_style_mask(NSWindowStyleMaskNonActivatingPanel);

    #[allow(deprecated)]
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces,
    );

    panel.set_delegate(delegate);
}
