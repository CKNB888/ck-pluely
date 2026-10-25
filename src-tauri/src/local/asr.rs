//! SenseVoice-small (int8) offline recognizer: zh / en / ja / ko / yue.

use super::fbank::{Fbank, Window};
use ort::session::Session;
use ort::value::Tensor;
use std::path::Path;

pub struct SenseVoice {
    session: Session,
    fbank: Fbank,
    tokens: Vec<String>,
    neg_mean: Vec<f32>,
    inv_std: Vec<f32>,
    lfr_m: usize,
    lfr_n: usize,
    lang_auto: i32,
    lang_zh: i32,
    lang_en: i32,
    with_itn: i32,
}

fn floats(s: &str) -> Vec<f32> {
    s.split(',').filter_map(|x| x.trim().parse().ok()).collect()
}

impl SenseVoice {
    pub fn load(model: &Path, tokens: &Path) -> Result<Self, String> {
        let session = super::runtime::session(model)?;
        let meta = session.metadata().map_err(|e| e.to_string())?;
        let get = |k: &str| meta.custom(k).ok().flatten().unwrap_or_default();
        let int = |k: &str, d: i32| get(k).trim().parse().unwrap_or(d);
        let neg_mean = floats(&get("neg_mean"));
        let inv_std = floats(&get("inv_stddev"));
        let lfr_m = int("lfr_window_size", 7) as usize;
        let lfr_n = int("lfr_window_shift", 6) as usize;
        let (lang_auto, lang_zh, lang_en) = (int("lang_auto", 0), int("lang_zh", 3), int("lang_en", 4));
        let with_itn = int("with_itn", 14);
        drop(meta);
        if neg_mean.len() != 80 * lfr_m || inv_std.len() != neg_mean.len() {
            return Err("语音模型文件不完整".into());
        }
        let mut toks = Vec::new();
        for line in std::fs::read_to_string(tokens).map_err(|e| e.to_string())?.lines() {
            let mut it = line.rsplitn(2, ' ');
            let id: usize = it.next().and_then(|x| x.parse().ok()).unwrap_or(toks.len());
            let sym = it.next().unwrap_or("").to_string();
            if id >= toks.len() {
                toks.resize(id + 1, String::new());
            }
            toks[id] = sym;
        }
        Ok(Self {
            session,
            fbank: Fbank::new(Window::Hamming, 80, 20.0, 0.0),
            tokens: toks,
            neg_mean,
            inv_std,
            lfr_m,
            lfr_n,
            lang_auto,
            lang_zh,
            lang_en,
            with_itn,
        })
    }

    /// LFR stacking + CMVN, as in FunASR.
    fn features(&self, samples: &[f32]) -> (Vec<f32>, usize) {
        let f = self.fbank.compute(samples, 32768.0);
        let t = f.len() / 80;
        if t == 0 {
            return (Vec::new(), 0);
        }
        let out_t = t.div_ceil(self.lfr_n);
        let dim = 80 * self.lfr_m;
        let left = (self.lfr_m - 1) / 2;
        let mut out = Vec::with_capacity(out_t * dim);
        for i in 0..out_t {
            for k in 0..self.lfr_m {
                let src = (i * self.lfr_n + k).saturating_sub(left).min(t - 1);
                out.extend_from_slice(&f[src * 80..src * 80 + 80]);
            }
        }
        for row in out.chunks_mut(dim) {
            for (j, x) in row.iter_mut().enumerate() {
                *x = (*x + self.neg_mean[j]) * self.inv_std[j];
            }
        }
        (out, out_t)
    }

    /// `lang`: "zh", "en" or anything else for auto.
    pub fn transcribe(&mut self, samples: &[f32], lang: &str) -> Result<String, String> {
        let (x, t) = self.features(samples);
        if t == 0 {
            return Ok(String::new());
        }
        let lang_id = match lang {
            "zh" => self.lang_zh,
            "en" => self.lang_en,
            _ => self.lang_auto,
        };
        let e = |e: ort::Error| e.to_string();
        let inputs = ort::inputs![
            "x" => Tensor::from_array(([1usize, t, 80 * self.lfr_m], x)).map_err(e)?,
            "x_length" => Tensor::from_array(([1usize], vec![t as i32])).map_err(e)?,
            "language" => Tensor::from_array(([1usize], vec![lang_id])).map_err(e)?,
            "text_norm" => Tensor::from_array(([1usize], vec![self.with_itn])).map_err(e)?,
        ];
        let out = self.session.run(inputs).map_err(e)?;
        let (shape, logits) = out[0].try_extract_tensor::<f32>().map_err(e)?;
        let (steps, vocab) = (shape[1] as usize, shape[2] as usize);
        let mut text = String::new();
        let mut prev = usize::MAX;
        for s in 4..steps {
            let row = &logits[s * vocab..(s + 1) * vocab];
            let mut best = 0;
            for (i, &v) in row.iter().enumerate() {
                if v > row[best] {
                    best = i;
                }
            }
            if best != prev && best != 0 {
                if let Some(tok) = self.tokens.get(best) {
                    if !(tok.starts_with("<|") && tok.ends_with("|>")) {
                        text.push_str(tok);
                    }
                }
            }
            prev = best;
        }
        Ok(text.replace('\u{2581}', " ").trim().to_string())
    }
}
