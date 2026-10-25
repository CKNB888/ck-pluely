//! Kaldi-compatible log-mel filterbank (80 bins, 25 ms / 10 ms), enough for
//! SenseVoice and CAM++. Same numbers as kaldi-native-fbank with dither 0
//! and snip_edges = true.

use rustfft::{num_complex::Complex32, Fft, FftPlanner};
use std::sync::Arc;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Window {
    Hamming,
    Povey,
}

pub struct Fbank {
    window: Vec<f32>,
    mel: Vec<(usize, Vec<f32>)>, // (first fft bin, weights)
    fft: Arc<dyn Fft<f32>>,
    pub bins: usize,
}

const FRAME: usize = 400;
const SHIFT: usize = 160;
const NFFT: usize = 512;

fn mel(f: f32) -> f32 {
    1127.0 * (1.0 + f / 700.0).ln()
}

impl Fbank {
    /// `high_freq <= 0` means nyquist + high_freq (Kaldi convention).
    pub fn new(window: Window, bins: usize, low_freq: f32, high_freq: f32) -> Self {
        let sr = 16000.0f32;
        let nyq = sr / 2.0;
        let high = if high_freq <= 0.0 { nyq + high_freq } else { high_freq };
        let w: Vec<f32> = (0..FRAME)
            .map(|i| {
                let a = 2.0 * std::f32::consts::PI * i as f32 / (FRAME - 1) as f32;
                match window {
                    Window::Hamming => 0.54 - 0.46 * a.cos(),
                    Window::Povey => (0.5 - 0.5 * a.cos()).powf(0.85),
                }
            })
            .collect();
        let (ml, mh) = (mel(low_freq), mel(high));
        let delta = (mh - ml) / (bins + 1) as f32;
        let fft_bin_width = sr / NFFT as f32;
        let mut banks = Vec::with_capacity(bins);
        for b in 0..bins {
            let left = ml + b as f32 * delta;
            let center = left + delta;
            let right = center + delta;
            let mut first = usize::MAX;
            let mut weights = Vec::new();
            for i in 0..NFFT / 2 {
                let m = mel(fft_bin_width * i as f32);
                if m > left && m < right {
                    let wgt = if m <= center {
                        (m - left) / (center - left)
                    } else {
                        (right - m) / (right - center)
                    };
                    if first == usize::MAX {
                        first = i;
                    }
                    // fill gaps so weights stay contiguous
                    while first + weights.len() < i {
                        weights.push(0.0);
                    }
                    weights.push(wgt);
                }
            }
            banks.push((if first == usize::MAX { 0 } else { first }, weights));
        }
        let fft = FftPlanner::new().plan_fft_forward(NFFT);
        Self { window: w, mel: banks, fft, bins }
    }

    pub fn num_frames(samples: usize) -> usize {
        if samples < FRAME {
            0
        } else {
            1 + (samples - FRAME) / SHIFT
        }
    }

    /// `samples` in [-1, 1]; `scale` multiplies them first (32768 for models
    /// trained on int16 values). Returns frames * bins, row-major.
    pub fn compute(&self, samples: &[f32], scale: f32) -> Vec<f32> {
        let n = Self::num_frames(samples.len());
        let mut out = Vec::with_capacity(n * self.bins);
        let mut frame = [0f32; FRAME];
        let mut buf = vec![Complex32::new(0.0, 0.0); NFFT];
        let mut power = [0f32; NFFT / 2 + 1];
        for f in 0..n {
            let s = &samples[f * SHIFT..f * SHIFT + FRAME];
            let mut mean = 0.0;
            for (d, &x) in frame.iter_mut().zip(s) {
                *d = x * scale;
                mean += *d;
            }
            mean /= FRAME as f32;
            for d in frame.iter_mut() {
                *d -= mean;
            }
            for i in (1..FRAME).rev() {
                frame[i] -= 0.97 * frame[i - 1];
            }
            frame[0] -= 0.97 * frame[0];
            for i in 0..NFFT {
                buf[i] = if i < FRAME {
                    Complex32::new(frame[i] * self.window[i], 0.0)
                } else {
                    Complex32::new(0.0, 0.0)
                };
            }
            self.fft.process(&mut buf);
            for i in 0..=NFFT / 2 {
                power[i] = buf[i].norm_sqr();
            }
            for (first, w) in &self.mel {
                let mut e = 0.0f32;
                for (k, wk) in w.iter().enumerate() {
                    e += wk * power[first + k];
                }
                out.push(e.max(f32::EPSILON).ln());
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_count_matches_kaldi() {
        assert_eq!(Fbank::num_frames(399), 0);
        assert_eq!(Fbank::num_frames(400), 1);
        assert_eq!(Fbank::num_frames(16000), 98);
    }

    #[test]
    fn sine_energy_lands_in_right_bin() {
        let fb = Fbank::new(Window::Povey, 80, 20.0, -400.0);
        let x: Vec<f32> = (0..16000)
            .map(|i| (2.0 * std::f32::consts::PI * 1000.0 * i as f32 / 16000.0).sin() * 0.5)
            .collect();
        let f = fb.compute(&x, 32768.0);
        assert_eq!(f.len(), 98 * 80);
        let row = &f[40 * 80..41 * 80];
        let (argmax, _) = row
            .iter()
            .enumerate()
            .fold((0, f32::MIN), |a, (i, &v)| if v > a.1 { (i, v) } else { a });
        // 1 kHz sits around mel bin 22-26 for 20..7600 Hz / 80 bins
        assert!((20..=28).contains(&argmax), "argmax {argmax}");
    }
}
