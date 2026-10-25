use super::engine::{self, LocalState, Settings};
use super::hw;
use super::runtime::{self, Kind};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    id: &'static str,
    installed: bool,
    size_mb: f64,
    missing_mb: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    machine: hw::Machine,
    advice: hw::Advice,
    settings: Settings,
    stt: Part,
    voiceprint: Part,
    enrolled: bool,
    stt_loaded: bool,
    voiceprint_loaded: bool,
    downloading: Option<String>,
    supported: bool,
}

fn part(state: &LocalState, id: &'static str, kind: Kind) -> Part {
    let assets = runtime::assets_for(kind);
    let size: u64 = assets.iter().map(|a| a.size).sum();
    let missing = runtime::bytes_needed(&state.dir, &assets);
    Part {
        id,
        installed: assets.iter().all(|a| runtime::is_installed(&state.dir, a)),
        size_mb: size as f64 / 1e6,
        missing_mb: missing as f64 / 1e6,
    }
}

#[tauri::command]
pub fn local_status(state: State<'_, LocalState>) -> Status {
    let m = hw::machine(state.dir.parent().unwrap_or(&state.dir));
    let stt = part(&state, "stt", Kind::Asr);
    let vp = part(&state, "voiceprint", Kind::Speaker);
    let advice = hw::advise(&m, stt.missing_mb / 1e3, vp.missing_mb / 1e3);
    let (sl, vl) = state.loaded();
    Status {
        machine: m,
        advice,
        settings: state.settings(),
        stt,
        voiceprint: vp,
        enrolled: state.enrolled(),
        stt_loaded: sl,
        voiceprint_loaded: vl,
        downloading: state.downloading.lock().ok().and_then(|d| d.clone()),
        supported: runtime::catalog().iter().any(|a| a.kind == Kind::Runtime),
    }
}

#[tauri::command]
pub fn local_set_settings(state: State<'_, LocalState>, settings: Settings) -> Result<(), String> {
    let mut s = settings;
    s.threshold = s.threshold.clamp(0.3, 0.9);
    state.save_settings(s)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    part: String,
    done: u64,
    total: u64,
}

#[tauri::command]
pub async fn local_download(app: AppHandle, state: State<'_, LocalState>, part: String) -> Result<(), String> {
    let kind = engine::kind_of(&part).ok_or("未知的组件")?;
    {
        let mut d = state.downloading.lock().map_err(|e| e.to_string())?;
        if d.is_some() {
            return Err("已有下载在进行".into());
        }
        *d = Some(part.clone());
    }
    let assets = runtime::assets_for(kind);
    let result = async {
        let need = runtime::bytes_needed(&state.dir, &assets);
        let m = hw::machine(state.dir.parent().unwrap_or(&state.dir));
        if (m.free_disk_gb * 1e9) < need as f64 + 200e6 {
            return Err(format!(
                "磁盘空间不足：需要 {:.0} MB，剩余 {:.0} MB",
                need as f64 / 1e6 + 200.0,
                m.free_disk_gb * 1e3
            ));
        }
        let total: u64 = assets.iter().map(|a| a.size).sum();
        let mut base = 0u64;
        for a in &assets {
            let mut last = std::time::Instant::now() - std::time::Duration::from_secs(1);
            let b = base;
            runtime::fetch(&state.dir, a, |done, _| {
                // throttle UI updates to 4 per second
                if last.elapsed().as_millis() >= 250 {
                    last = std::time::Instant::now();
                    let _ = app.emit("local-download", Progress { part: part.clone(), done: b + done, total });
                }
            })
            .await?;
            base += a.size;
        }
        let _ = app.emit("local-download", Progress { part: part.clone(), done: total, total });
        Ok(())
    }
    .await;
    if let Ok(mut d) = state.downloading.lock() {
        *d = None;
    }
    result
}

/// Remove downloaded models for a part (keeps the shared runtime if the
/// other part still needs it).
#[tauri::command]
pub async fn local_delete_models(state: State<'_, LocalState>, part: String) -> Result<(), String> {
    let kind = engine::kind_of(&part).ok_or("未知的组件")?;
    engine::unload_now(&state);
    state.call(|_| ()).await?;
    for a in runtime::catalog().iter().filter(|a| a.kind == kind) {
        for p in [runtime::installed_path(&state.dir, a), state.dir.join(format!("{}.part", a.file))] {
            let _ = std::fs::remove_file(p);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn local_transcribe(state: State<'_, LocalState>, wav_b64: String) -> Result<String, String> {
    let a = engine::decode_wav_b64(&wav_b64)?;
    let lang = state.settings().language;
    state.call(move |m| engine::transcribe(m, &a, &lang)).await?
}

#[tauri::command]
pub async fn voiceprint_enroll(state: State<'_, LocalState>, wav_b64: String) -> Result<engine::Enrollment, String> {
    let a = engine::decode_wav_b64(&wav_b64)?;
    let (emb, info) = state.call(move |m| engine::enroll(m, a)).await??;
    engine::store_voiceprint(&state, emb)?;
    Ok(info)
}

/// Score a fresh recording against the saved voiceprint (for the
/// threshold slider's "try it").
#[tauri::command]
pub async fn voiceprint_test(state: State<'_, LocalState>, wav_b64: String) -> Result<f32, String> {
    let a = engine::decode_wav_b64(&wav_b64)?;
    state.call(move |m| engine::score_me(m, &a)).await?
}

#[tauri::command]
pub fn voiceprint_delete(state: State<'_, LocalState>) -> Result<(), String> {
    engine::delete_voiceprint(&state)
}

#[tauri::command]
pub fn local_unload(state: State<'_, LocalState>) {
    engine::unload_now(&state);
}
