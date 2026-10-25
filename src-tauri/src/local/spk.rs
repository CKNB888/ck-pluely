//! CAM++ speaker embeddings and the runtime "me vs students" labeler.

use super::fbank::{Fbank, Window};
use ort::session::Session;
use ort::value::Tensor;
use std::path::Path;

pub struct Embedder {
    session: Session,
    fbank: Fbank,
    global_mean: bool,
}

pub const MIN_SAMPLES: usize = 16000 * 6 / 10; // 0.6 s

impl Embedder {
    pub fn load(model: &Path) -> Result<Self, String> {
        let session = super::runtime::session(model)?;
        let global_mean = session
            .metadata()
            .ok()
            .and_then(|m| m.custom("feature_normalize_type").ok().flatten())
            .map(|v| v == "global-mean")
            .unwrap_or(true);
        Ok(Self {
            session,
            fbank: Fbank::new(Window::Povey, 80, 20.0, -400.0),
            global_mean,
        })
    }

    /// L2-normalized embedding, or None for too-short audio.
    pub fn embed(&mut self, samples: &[f32]) -> Result<Option<Vec<f32>>, String> {
        if samples.len() < MIN_SAMPLES {
            return Ok(None);
        }
        let mut f = self.fbank.compute(samples, 32768.0);
        let t = f.len() / 80;
        if self.global_mean && t > 0 {
            let mut mean = [0f32; 80];
            for row in f.chunks(80) {
                for (m, x) in mean.iter_mut().zip(row) {
                    *m += x;
                }
            }
            for m in mean.iter_mut() {
                *m /= t as f32;
            }
            for row in f.chunks_mut(80) {
                for (x, m) in row.iter_mut().zip(mean.iter()) {
                    *x -= m;
                }
            }
        }
        let e = |e: ort::Error| e.to_string();
        let out = self
            .session
            .run(ort::inputs!["x" => Tensor::from_array(([1usize, t, 80], f)).map_err(e)?])
            .map_err(e)?;
        let (_, v) = out[0].try_extract_tensor::<f32>().map_err(e)?;
        Ok(Some(normalize(v.to_vec())))
    }
}

pub fn normalize(mut v: Vec<f32>) -> Vec<f32> {
    let n = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-9);
    v.iter_mut().for_each(|x| *x /= n);
    v
}

pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(tag = "kind", content = "index", rename_all = "lowercase")]
pub enum Speaker {
    Me,
    Student(usize),
}

/// Online labeler: the enrolled voice is "me"; everyone else is clustered
/// into 学生1, 学生2, ... for this session.
pub struct Labeler {
    pub me: Option<Vec<f32>>,
    pub me_threshold: f32,
    pub cluster_threshold: f32,
    students: Vec<(Vec<f32>, u32)>,
}

pub const MAX_STUDENTS: usize = 12;

impl Labeler {
    pub fn new(me: Option<Vec<f32>>, me_threshold: f32) -> Self {
        Self { me, me_threshold, cluster_threshold: 0.5, students: Vec::new() }
    }

    pub fn reset_students(&mut self) {
        self.students.clear();
    }

    pub fn label(&mut self, emb: &[f32]) -> (Speaker, f32) {
        let best_student = self.students.iter().map(|(c, _)| cosine(c, emb)).fold(f32::MIN, f32::max);
        if let Some(me) = &self.me {
            let s = cosine(me, emb);
            // A voice that fits a known student clearly better (by 0.1) is
            // that student, even above the threshold.
            if s >= self.me_threshold && s + 0.1 >= best_student {
                return (Speaker::Me, s);
            }
        }
        let best = self
            .students
            .iter()
            .enumerate()
            .map(|(i, (c, _))| (i, cosine(c, emb)))
            .fold(None, |a: Option<(usize, f32)>, b| match a {
                Some(x) if x.1 >= b.1 => Some(x),
                _ => Some(b),
            });
        match best {
            Some((i, s)) if s >= self.cluster_threshold || self.students.len() >= MAX_STUDENTS => {
                let (c, n) = &mut self.students[i];
                let w = 1.0 / (*n as f32 + 1.0);
                for (x, y) in c.iter_mut().zip(emb) {
                    *x = *x * (1.0 - w) + y * w;
                }
                *c = normalize(std::mem::take(c));
                *n += 1;
                (Speaker::Student(i + 1), s)
            }
            _ => {
                self.students.push((emb.to_vec(), 1));
                (Speaker::Student(self.students.len()), 0.0)
            }
        }
    }
}

/// Mean of enrollment embeddings, normalized.
pub fn average(embs: &[Vec<f32>]) -> Option<Vec<f32>> {
    let first = embs.first()?;
    let mut m = vec![0f32; first.len()];
    for e in embs {
        for (a, b) in m.iter_mut().zip(e) {
            *a += b;
        }
    }
    Some(normalize(m))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit(i: usize) -> Vec<f32> {
        let mut v = vec![0.0; 8];
        v[i] = 1.0;
        v
    }

    #[test]
    fn labels_me_and_clusters_students() {
        let mut l = Labeler::new(Some(unit(0)), 0.6);
        assert_eq!(l.label(&unit(0)).0, Speaker::Me);
        assert_eq!(l.label(&unit(1)).0, Speaker::Student(1));
        assert_eq!(l.label(&unit(2)).0, Speaker::Student(2));
        assert_eq!(l.label(&normalize(vec![0.1, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])).0, Speaker::Student(1));
        l.reset_students();
        assert_eq!(l.label(&unit(2)).0, Speaker::Student(1));
    }

    #[test]
    fn without_enrollment_nobody_is_me() {
        let mut l = Labeler::new(None, 0.6);
        assert_eq!(l.label(&unit(0)).0, Speaker::Student(1));
    }
}
