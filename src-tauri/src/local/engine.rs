//! One worker thread owns the models. Speech segments go in straight from
//! the capture loop (no copy to the web view unless cloud STT needs it);
//! models load on first use and are dropped after a quiet period.

use super::asr::SenseVoice;
use super::runtime::{self, Kind};
use super::spk::{self, Embedder, Labeler, Speaker};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum SttMode {
    /// Online provider only.
    #[default]
    Cloud,
    /// Online first; local when the network or provider fails.
    Auto,
    /// Everything on this computer.
    Local,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub stt: SttMode,
    pub voiceprint: bool,
    /// Cosine score at or above which a segment is "me".
    pub threshold: f32,
    pub language: String,
    pub idle_unload_secs: u64,
}

impl Default for Settings {
    fn default() -> Self {
        Self { stt: SttMode::Cloud, voiceprint: true, threshold: 0.5, language: "auto".into(), idle_unload_secs: 120 }
    }
}

#[derive(Serialize, Deserialize)]
struct Voiceprint {
    version: u32,
    model: String,
    created: u64,
    embedding: Vec<f32>,
}

type Job = Box<dyn FnOnce(&mut Models) + Send>;

pub struct Models {
    dir: PathBuf,
    asr: Option<SenseVoice>,
    spk: Option<Embedder>,
    pub labeler: Labeler,
}

impl Models {
    fn asr(&mut self) -> Result<&mut SenseVoice, String> {
        if self.asr.is_none() {
            runtime::ensure_runtime(&self.dir)?;
            let m = self.dir.join("sensevoice.int8.onnx");
            if !m.exists() {
                return Err("离线识别模型还没下载".into());
            }
            self.asr = Some(SenseVoice::load(&m, &self.dir.join("sensevoice.tokens.txt"))?);
        }
        Ok(self.asr.as_mut().unwrap())
    }

    fn spk(&mut self) -> Result<&mut Embedder, String> {
        if self.spk.is_none() {
            runtime::ensure_runtime(&self.dir)?;
            let m = self.dir.join("campplus_zh-cn.onnx");
            if !m.exists() {
                return Err("声纹模型还没下载".into());
            }
            self.spk = Some(Embedder::load(&m)?);
        }
        Ok(self.spk.as_mut().unwrap())
    }

    fn unload(&mut self) -> bool {
        let had = self.asr.is_some() || self.spk.is_some();
        self.asr = None;
        self.spk = None;
        if had {
            runtime::trim_heap();
        }
        had
    }
}

pub struct LocalState {
    tx: Mutex<Sender<Job>>,
    pub dir: PathBuf,
    pub settings: RwLock<Settings>,
    voiceprint: Arc<RwLock<Option<Vec<f32>>>>,
    loaded: Arc<RwLock<(bool, bool)>>,
    pub downloading: Mutex<Option<String>>,
}

fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

impl LocalState {
    pub fn new(data_dir: PathBuf) -> Self {
        let dir = data_dir.join("models");
        let settings: Settings = std::fs::read(data_dir.join("local.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let vp: Option<Vec<f32>> = std::fs::read(voiceprint_path(&data_dir))
            .ok()
            .and_then(|b| serde_json::from_slice::<Voiceprint>(&b).ok())
            .map(|v| v.embedding);
        let voiceprint = Arc::new(RwLock::new(vp.clone()));
        let loaded = Arc::new(RwLock::new((false, false)));
        let (tx, rx) = channel::<Job>();
        let idle = Duration::from_secs(settings.idle_unload_secs.max(15));
        let thr = settings.threshold;
        let (wdir, wloaded) = (dir.clone(), loaded.clone());
        std::thread::Builder::new()
            .name("ck-local".into())
            .spawn(move || {
                let mut m = Models { dir: wdir, asr: None, spk: None, labeler: Labeler::new(vp, thr) };
                let mut last = Instant::now();
                loop {
                    match rx.recv_timeout(Duration::from_secs(10)) {
                        Ok(job) => {
                            job(&mut m);
                            last = Instant::now();
                        }
                        Err(RecvTimeoutError::Timeout) => {
                            if last.elapsed() >= idle && m.unload() {
                                tracing::info!("local models unloaded after idle");
                            }
                        }
                        Err(RecvTimeoutError::Disconnected) => break,
                    }
                    if let Ok(mut l) = wloaded.write() {
                        *l = (m.asr.is_some(), m.spk.is_some());
                    }
                }
            })
            .expect("spawn local worker");
        Self { tx: Mutex::new(tx), dir, settings: RwLock::new(settings), voiceprint, loaded, downloading: Mutex::new(None) }
    }

    pub fn submit(&self, job: Job) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(job);
        }
    }

    /// Run on the worker and wait for the answer.
    pub async fn call<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Models) -> T + Send + 'static,
    ) -> Result<T, String> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.submit(Box::new(move |m| {
            let _ = tx.send(f(m));
        }));
        rx.await.map_err(|_| "本地引擎已停止".to_string())
    }

    pub fn enrolled(&self) -> bool {
        self.voiceprint.read().map(|v| v.is_some()).unwrap_or(false)
    }

    pub fn loaded(&self) -> (bool, bool) {
        self.loaded.read().map(|l| *l).unwrap_or((false, false))
    }

    pub fn settings(&self) -> Settings {
        self.settings.read().map(|s| s.clone()).unwrap_or_default()
    }

    pub fn save_settings(&self, s: Settings) -> Result<(), String> {
        let data = self.dir.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
        std::fs::write(data.join("local.json"), serde_json::to_vec_pretty(&s).unwrap()).map_err(|e| e.to_string())?;
        let thr = s.threshold;
        if let Ok(mut w) = self.settings.write() {
            *w = s;
        }
        self.submit(Box::new(move |m| m.labeler.me_threshold = thr));
        Ok(())
    }
}

pub fn voiceprint_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("voiceprint.json")
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechText {
    pub text: String,
    pub speaker: Option<Speaker>,
    pub score: f32,
    pub ms: u64,
}

fn to_16k(sr: u32, samples: &[f32]) -> Vec<f32> {
    crate::speaker::commands::resample_to_16k(sr, samples).1
}

/// Entry point for system-audio segments from the capture loop.
pub fn dispatch(app: &AppHandle, sr: u32, samples: Vec<f32>, gate_allowed: bool) {
    let Some(state) = app.try_state::<LocalState>() else {
        return emit_wav(app, sr, &samples);
    };
    let s = state.settings();
    let gate = gate_allowed && s.voiceprint && state.enrolled() && state.dir.join("campplus_zh-cn.onnx").exists();
    let local = s.stt == SttMode::Local;
    if !gate && !local {
        return emit_wav(app, sr, &samples);
    }
    let app = app.clone();
    let lang = s.language.clone();
    state.submit(Box::new(move |m| {
        let t0 = Instant::now();
        let a = to_16k(sr, &samples);
        let mut speaker = None;
        let mut score = 0.0;
        if gate {
            match m.spk().and_then(|e| e.embed(&a)) {
                Ok(Some(e)) => {
                    let (who, sc) = m.labeler.label(&e);
                    speaker = Some(who);
                    score = sc;
                }
                Ok(None) => {}
                Err(e) => {
                    let _ = app.emit("local-error", e);
                }
            }
        }
        let is_me = speaker == Some(Speaker::Me);
        if local {
            match m.asr().and_then(|r| r.transcribe(&a, &lang)) {
                Ok(text) => {
                    let ev = if is_me { "speech-self" } else { "speech-text" };
                    let _ = app.emit(ev, SpeechText { text, speaker, score, ms: t0.elapsed().as_millis() as u64 });
                }
                Err(e) => {
                    // fall back to the online provider
                    let _ = app.emit("local-error", e);
                    if !is_me {
                        let _ = app.emit("speech-speaker", SpeechText { text: String::new(), speaker, score, ms: 0 });
                        emit_wav(&app, sr, &samples);
                    }
                }
            }
        } else if is_me {
            // The teacher's own voice (often echo through the speakers):
            // never answered. Logged only.
            let _ = app.emit("speech-self", SpeechText { text: String::new(), speaker, score, ms: t0.elapsed().as_millis() as u64 });
        } else {
            let _ = app.emit("speech-speaker", SpeechText { text: String::new(), speaker, score, ms: t0.elapsed().as_millis() as u64 });
            emit_wav(&app, sr, &samples);
        }
    }));
}

fn emit_wav(app: &AppHandle, sr: u32, samples: &[f32]) {
    match crate::speaker::commands::samples_to_wav_b64(sr, samples) {
        Ok(b64) => {
            let _ = app.emit("speech-detected", b64);
        }
        Err(_) => {
            let _ = app.emit("audio-encoding-error", "Failed to encode speech");
        }
    }
}

/// New capture session: forget the previous class's student clusters.
pub fn session_started(app: &AppHandle) {
    if let Some(state) = app.try_state::<LocalState>() {
        state.submit(Box::new(|m| m.labeler.reset_students()));
    }
}

pub fn decode_wav_b64(b64: &str) -> Result<Vec<f32>, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64.trim()).map_err(|e| e.to_string())?;
    let mut r = hound::WavReader::new(std::io::Cursor::new(bytes)).map_err(|_| "录音格式无法识别".to_string())?;
    let spec = r.spec();
    let ch = spec.channels.max(1) as usize;
    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let scale = (1i64 << (spec.bits_per_sample - 1)) as f32;
            r.samples::<i32>().filter_map(|s| s.ok()).map(|s| s as f32 / scale).collect()
        }
        hound::SampleFormat::Float => r.samples::<f32>().filter_map(|s| s.ok()).collect(),
    };
    let mono: Vec<f32> = raw.chunks(ch).map(|c| c.iter().sum::<f32>() / ch as f32).collect();
    Ok(to_16k(spec.sample_rate, &mono))
}

/// Enrollment windows: 3 s, hop 1.5 s, skipping near-silent windows.
pub fn enrollment_windows(a: &[f32]) -> Vec<&[f32]> {
    let (w, hop) = (48_000, 24_000);
    let mut out = Vec::new();
    let mut i = 0;
    while i + w <= a.len() {
        let win = &a[i..i + w];
        let rms = (win.iter().map(|x| x * x).sum::<f32>() / w as f32).sqrt();
        if rms > 0.004 {
            out.push(win);
        }
        i += hop;
    }
    out
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Enrollment {
    pub windows: usize,
    pub consistency: f32,
}

pub fn enroll(m: &mut Models, a: Vec<f32>) -> Result<(Vec<f32>, Enrollment), String> {
    let wins = enrollment_windows(&a);
    if wins.len() < 3 {
        return Err("有效语音太短，请再读一遍（至少 8 秒）".into());
    }
    let e = m.spk()?;
    let mut embs = Vec::new();
    for w in wins {
        if let Some(v) = e.embed(w)? {
            embs.push(v);
        }
    }
    let mean = spk::average(&embs).ok_or("录音无效")?;
    let consistency = embs.iter().map(|v| spk::cosine(v, &mean)).fold(f32::MAX, f32::min);
    Ok((mean, Enrollment { windows: embs.len(), consistency }))
}

pub fn store_voiceprint(state: &LocalState, emb: Vec<f32>) -> Result<(), String> {
    let data = state.dir.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    let vp = Voiceprint { version: 1, model: "campplus_zh-cn".into(), created: now_secs(), embedding: emb.clone() };
    std::fs::write(voiceprint_path(&data), serde_json::to_vec(&vp).unwrap()).map_err(|e| e.to_string())?;
    if let Ok(mut w) = state.voiceprint.write() {
        *w = Some(emb.clone());
    }
    state.submit(Box::new(move |m| m.labeler.me = Some(emb)));
    Ok(())
}

pub fn delete_voiceprint(state: &LocalState) -> Result<(), String> {
    let data = state.dir.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    match std::fs::remove_file(voiceprint_path(&data)) {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.to_string()),
    }
    if let Ok(mut w) = state.voiceprint.write() {
        *w = None;
    }
    state.submit(Box::new(|m| m.labeler.me = None));
    Ok(())
}

pub fn unload_now(state: &LocalState) {
    state.submit(Box::new(|m| {
        m.unload();
    }));
}

pub fn kind_of(id: &str) -> Option<Kind> {
    match id {
        "stt" => Some(Kind::Asr),
        "voiceprint" => Some(Kind::Speaker),
        _ => None,
    }
}


pub fn transcribe(m: &mut Models, a: &[f32], lang: &str) -> Result<String, String> {
    m.asr()?.transcribe(a, lang)
}

pub fn score_me(m: &mut Models, a: &[f32]) -> Result<f32, String> {
    let me = m.labeler.me.clone().ok_or("还没有录入声纹")?;
    match m.spk()?.embed(a)? {
        Some(e) => Ok(spk::cosine(&me, &e)),
        None => Err("录音太短".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enrollment_windows_skip_silence() {
        let mut a = vec![0.0f32; 16000 * 4];
        a.extend((0..16000 * 6).map(|i| ((i as f32) * 0.05).sin() * 0.2));
        let w = enrollment_windows(&a);
        assert!(w.len() >= 3, "{}", w.len());
        assert!(enrollment_windows(&vec![0.0; 16000 * 10]).is_empty());
    }

    #[test]
    fn settings_default_keeps_cloud_and_reads_partial_json() {
        let s: Settings = serde_json::from_str(r#"{"stt":"local"}"#).unwrap();
        assert_eq!(s.stt, SttMode::Local);
        assert!((s.threshold - 0.5).abs() < 1e-6);
        assert_eq!(Settings::default().stt, SttMode::Cloud);
    }
}
