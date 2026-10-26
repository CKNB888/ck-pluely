//! 窗口位置记忆：悬浮条（main）、菜单栏面板（panel）、控制台（dashboard）被拖动 / 改变大小后
//! 记下位置、大小和所在显示器，下次启动恢复；显示器拔掉或位置跑到屏幕外时回到主屏默认位置。
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

pub const TRACKED: [&str; 3] = ["main", "panel", "dashboard"];

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Saved {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    /// 显示器名称（没有名称时用 "宽x高@x,y"）
    pub display: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Mon {
    pub id: String,
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

impl Mon {
    fn visible_area(&self, x: i32, y: i32, w: u32, h: u32) -> (i32, i32) {
        let ix = (x + w as i32).min(self.x + self.w as i32) - x.max(self.x);
        let iy = (y + h as i32).min(self.y + self.h as i32) - y.max(self.y);
        (ix, iy)
    }
}

/// 计算恢复后的位置。返回 None 表示应使用默认位置（主屏）。
/// 规则：原显示器还在且窗口至少有 80×24 像素在该屏内 → 原样恢复（必要时夹回屏内）；
/// 原显示器不在、或窗口基本不可见 → None。
pub fn restore_target(s: &Saved, mons: &[Mon]) -> Option<(i32, i32)> {
    let m = mons.iter().find(|m| m.id == s.display)?;
    let (ix, iy) = m.visible_area(s.x, s.y, s.w, s.h);
    if ix < 80 || iy < 24 {
        return None;
    }
    // 夹回屏内，保证整个标题 / 拖动区可见
    let max_x = m.x + m.w as i32 - s.w.min(m.w) as i32;
    let max_y = m.y + m.h as i32 - s.h.min(m.h) as i32;
    Some((s.x.clamp(m.x, max_x), s.y.clamp(m.y, max_y)))
}

/// 主屏默认位置：顶部居中（offset 为物理像素）
pub fn default_on(m: &Mon, w: u32, offset: i32) -> (i32, i32) {
    (m.x + (m.w as i32 - w as i32) / 2, m.y + offset)
}

pub fn mon_id(name: Option<&String>, x: i32, y: i32, w: u32, h: u32) -> String {
    name.cloned().unwrap_or_else(|| format!("{w}x{h}@{x},{y}"))
}

static STATE: Mutex<Option<HashMap<String, Saved>>> = Mutex::new(None);
/// 程序自己设置位置时暂停记录（避免把锚定托盘的位置当成用户拖动）
static SUPPRESS: Mutex<Option<std::time::Instant>> = Mutex::new(None);

fn file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("window_state.json"))
}

fn load<R: Runtime>(app: &AppHandle<R>) -> HashMap<String, Saved> {
    let mut g = STATE.lock().unwrap_or_else(|e| e.into_inner());
    if g.is_none() {
        let m = file(app)
            .and_then(|p| std::fs::read(p).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        *g = Some(m);
    }
    g.clone().unwrap_or_default()
}

pub fn get<R: Runtime>(app: &AppHandle<R>, label: &str) -> Option<Saved> {
    load(app).get(label).cloned()
}

fn monitors<R: Runtime>(w: &WebviewWindow<R>) -> Vec<Mon> {
    w.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let (p, s) = (m.position(), m.size());
            Mon { id: mon_id(m.name(), p.x, p.y, s.width, s.height), x: p.x, y: p.y, w: s.width, h: s.height }
        })
        .collect()
}

fn primary<R: Runtime>(w: &WebviewWindow<R>) -> Option<Mon> {
    let m = w.primary_monitor().ok().flatten()?;
    let (p, s) = (m.position(), m.size());
    Some(Mon { id: mon_id(m.name(), p.x, p.y, s.width, s.height), x: p.x, y: p.y, w: s.width, h: s.height })
}

fn m_scale<R: Runtime>(w: &WebviewWindow<R>) -> f64 {
    w.scale_factor().unwrap_or(1.0)
}

/// 程序主动移动窗口前调用，接下来 600 ms 内的移动不记录
pub fn suppress() {
    *SUPPRESS.lock().unwrap_or_else(|e| e.into_inner()) = Some(std::time::Instant::now());
}

fn suppressed() -> bool {
    SUPPRESS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .is_some_and(|t| t.elapsed().as_millis() < 600)
}

/// 记录当前位置（Moved / Resized 事件里调用）
pub fn record<R: Runtime>(w: &WebviewWindow<R>) {
    if suppressed() || !TRACKED.contains(&w.label()) || w.is_visible().ok() != Some(true) {
        return;
    }
    if w.is_minimized().unwrap_or(false) || w.is_maximized().unwrap_or(false) {
        return;
    }
    let (Ok(p), Ok(s)) = (w.outer_position(), w.outer_size()) else { return };
    let mons = monitors(w);
    // 所在显示器 = 窗口中心所在的屏
    let (cx, cy) = (p.x + s.width as i32 / 2, p.y + s.height as i32 / 2);
    let Some(m) = mons
        .iter()
        .find(|m| cx >= m.x && cy >= m.y && cx < m.x + m.w as i32 && cy < m.y + m.h as i32)
    else {
        return;
    };
    let saved = Saved { x: p.x, y: p.y, w: s.width, h: s.height, display: m.id.clone() };
    let app = w.app_handle().clone();
    let mut map = load(&app);
    if map.get(w.label()) == Some(&saved) {
        return;
    }
    map.insert(w.label().to_string(), saved);
    *STATE.lock().unwrap_or_else(|e| e.into_inner()) = Some(map.clone());
    if let Some(f) = file(&app) {
        let _ = std::fs::create_dir_all(f.parent().unwrap_or(&f));
        let tmp = f.with_extension("json.tmp");
        if std::fs::write(&tmp, serde_json::to_vec_pretty(&map).unwrap_or_default()).is_ok() {
            let _ = std::fs::rename(tmp, f);
        }
    }
}

/// 恢复窗口位置。返回 true 表示用了记住的位置；false 表示已放回主屏默认位置
/// （`fallback` 为 None 时不动，由调用方自己放置，比如面板锚定托盘图标）。
pub fn restore<R: Runtime>(w: &WebviewWindow<R>, fallback_offset: Option<i32>) -> bool {
    let app = w.app_handle().clone();
    let saved = get(&app, w.label());
    let mons = monitors(w);
    suppress();
    if let Some(s) = &saved {
        if w.label() == "dashboard" && s.w >= 400 && s.h >= 300 {
            let _ = w.set_size(tauri::PhysicalSize::new(s.w, s.h));
        }
        if let Some((x, y)) = restore_target(s, &mons) {
            let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
            return true;
        }
    }
    if let (Some(off), Some(m)) = (fallback_offset, primary(w)) {
        // 窗口刚创建时 outer_size 可能还是 0，用配置宽度
        let size = w.outer_size().map(|s| s.width).ok().filter(|v| *v > 0).unwrap_or((600.0 * m_scale(w)) as u32);
        let (x, y) = default_on(&m, size, off);
        let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
    }
    false
}

/// 清除记住的位置（设置里「窗口位置复位」）
#[tauri::command]
pub fn ck_reset_window_positions(app: AppHandle) -> Result<(), String> {
    *STATE.lock().unwrap_or_else(|e| e.into_inner()) = Some(HashMap::new());
    if let Some(f) = file(&app) {
        let _ = std::fs::remove_file(f);
    }
    if let Some(w) = app.get_webview_window("main") {
        restore(&w, Some(54));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn m(id: &str, x: i32, y: i32, w: u32, h: u32) -> Mon {
        Mon { id: id.into(), x, y, w, h }
    }
    fn s(x: i32, y: i32, d: &str) -> Saved {
        Saved { x, y, w: 600, h: 60, display: d.into() }
    }

    #[test]
    fn restores_on_same_display() {
        let mons = [m("A", 0, 0, 1920, 1080), m("B", 1920, 0, 2560, 1440)];
        assert_eq!(restore_target(&s(2200, 300, "B"), &mons), Some((2200, 300)));
        assert_eq!(restore_target(&s(100, 900, "A"), &mons), Some((100, 900)));
    }

    #[test]
    fn display_removed_falls_back() {
        let mons = [m("A", 0, 0, 1920, 1080)];
        assert_eq!(restore_target(&s(2200, 300, "B"), &mons), None);
    }

    #[test]
    fn off_screen_falls_back() {
        let mons = [m("A", 0, 0, 1920, 1080)];
        assert_eq!(restore_target(&s(5000, 300, "A"), &mons), None);
        assert_eq!(restore_target(&s(100, -500, "A"), &mons), None);
        // 只露出一小条（<80 px）也算看不见
        assert_eq!(restore_target(&s(1860, 300, "A"), &mons), None);
    }

    #[test]
    fn partly_visible_is_clamped_in() {
        let mons = [m("A", 0, 0, 1920, 1080)];
        assert_eq!(restore_target(&s(1700, 1050, "A"), &mons), Some((1320, 1020)));
        assert_eq!(restore_target(&s(-300, -20, "A"), &mons), Some((0, 0)));
    }

    #[test]
    fn resolution_shrunk_clamps() {
        // 同名显示器分辨率变小，窗口仍部分可见 → 夹回
        let mons = [m("A", 0, 0, 1280, 720)];
        assert_eq!(restore_target(&s(1000, 400, "A"), &mons), Some((680, 400)));
    }

    #[test]
    fn negative_coordinate_display() {
        let mons = [m("A", 0, 0, 1920, 1080), m("L", -1440, 0, 1440, 900)];
        assert_eq!(restore_target(&s(-1200, 100, "L"), &mons), Some((-1200, 100)));
    }

    #[test]
    fn default_is_top_center_of_primary() {
        assert_eq!(default_on(&m("A", 0, 0, 1920, 1080), 600, 54), (660, 54));
        assert_eq!(default_on(&m("B", 1920, 0, 2560, 1440), 600, 54), (2900, 54));
    }

    #[test]
    fn saved_json_roundtrip() {
        let v = s(1, 2, "DELL U2720Q");
        let j = serde_json::to_string(&v).unwrap();
        assert_eq!(serde_json::from_str::<Saved>(&j).unwrap(), v);
        // 损坏的文件不崩溃
        assert!(serde_json::from_str::<HashMap<String, Saved>>("{bad").is_err());
    }
}
