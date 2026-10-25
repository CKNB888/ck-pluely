// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // ck-pluely (#290): WebKitGTK's DMA-BUF renderer gives a blank window /
    // EGL_BAD_PARAMETER on some Wayland + AMD/NVIDIA setups. Respect a value
    // the user already exported.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    pluely_lib::run()
}
