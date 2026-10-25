//! Real-model evaluation. Run with
//! CK_ML_DIR=/path cargo test --release local::eval -- --ignored --nocapture

#![allow(clippy::chunks_exact_to_as_chunks)]
use super::{asr::SenseVoice, runtime, spk::*};
use std::path::PathBuf;
use std::time::Instant;

fn dir() -> Option<PathBuf> {
    std::env::var("CK_ML_DIR").ok().map(PathBuf::from)
}

fn wav(p: &std::path::Path) -> Vec<f32> {
    let b = std::fs::read(p).unwrap();
    let data = b.windows(4).position(|w| w == b"data").unwrap() + 8;
    b[data..]
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32768.0)
        .collect()
}

fn rss_mb() -> f64 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("VmRSS"))
                .map(|l| l.to_string())
        })
        .and_then(|l| {
            l.split_whitespace()
                .nth(1)
                .and_then(|v| v.parse::<f64>().ok())
        })
        .unwrap_or(0.0)
        / 1024.0
}

#[test]
#[ignore]
fn eval_real_models() {
    let Some(d) = dir() else { return };
    runtime::ensure_runtime(&d).unwrap();
    let r0 = rss_mb();
    let t = Instant::now();
    let mut emb = Embedder::load(&d.join("campplus_zh-cn.onnx")).unwrap();
    println!(
        "campplus load {:?}, rss +{:.0} MB",
        t.elapsed(),
        rss_mb() - r0
    );
    let people = ["fangjun", "leijun", "liudehua"];
    let sr = d.join("sr");
    let mut enrolled = Vec::new();
    for p in people {
        let mut v = Vec::new();
        for i in 1..=3 {
            let f = sr.join(format!("{p}-sr-{i}.wav"));
            if f.exists() {
                v.push(emb.embed(&wav(&f)).unwrap().unwrap());
            }
        }
        enrolled.push(average(&v).unwrap());
    }
    let (mut ok, mut n) = (0, 0);
    let mut lat = Vec::new();
    for (pi, p) in people.iter().enumerate() {
        for i in 1..=3 {
            let f = sr.join(format!("{p}-test-sr-{i}.wav"));
            if !f.exists() {
                continue;
            }
            let a = wav(&f);
            let t = Instant::now();
            let e = emb.embed(&a).unwrap().unwrap();
            lat.push((t.elapsed().as_secs_f64() * 1000.0, a.len() as f64 / 16000.0));
            let scores: Vec<f32> = enrolled.iter().map(|m| cosine(m, &e)).collect();
            let best = scores
                .iter()
                .enumerate()
                .fold(0, |b, (j, s)| if *s > scores[b] { j } else { b });
            println!(
                "{p} test {i}: {:?}",
                scores.iter().map(|s| format!("{s:.2}")).collect::<Vec<_>>()
            );
            n += 1;
            if best == pi {
                ok += 1;
            }
        }
    }
    println!("speaker id {ok}/{n}; latency ms/audio s: {lat:?}");
    // Echo: teacher voice played through laptop speakers and picked up
    // again (band-limited, reverberant, noisy, 48 kHz -> 16 kHz path).
    let echo = |x: &[f32]| -> Vec<f32> {
        let mut y = vec![0f32; x.len()];
        let mut lp = 0f32;
        let mut hp_prev = 0f32;
        let mut hp = 0f32;
        let mut seed = 12345u32;
        for i in 0..x.len() {
            lp += 0.35 * (x[i] - lp); // ~3.5 kHz low-pass
            hp = 0.97 * (hp + lp - hp_prev); // ~80 Hz high-pass (small speakers)
            hp_prev = lp;
            let mut v = hp * 0.6;
            for (d, g) in [(400usize, 0.35f32), (1100, 0.2), (2300, 0.1)] {
                if i >= d {
                    v += y[i - d] * g;
                }
            }
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            v += ((seed >> 9) as f32 / (1u32 << 23) as f32 - 0.5) * 0.01;
            y[i] = v;
        }
        y
    };
    let mut me_scores = Vec::new();
    let mut other_scores = Vec::new();
    for (pi, p) in people.iter().enumerate() {
        for i in 1..=3 {
            let f = sr.join(format!("{p}-test-sr-{i}.wav"));
            if !f.exists() {
                continue;
            }
            let e = emb.embed(&echo(&wav(&f))).unwrap().unwrap();
            for (mi, m) in enrolled.iter().enumerate() {
                let s = cosine(m, &e);
                if mi == pi {
                    me_scores.push(s)
                } else {
                    other_scores.push(s)
                }
            }
        }
    }
    let min_me = me_scores.iter().cloned().fold(f32::MAX, f32::min);
    let max_other = other_scores.iter().cloned().fold(f32::MIN, f32::max);
    println!("echo: same speaker min {min_me:.2}, other speakers max {max_other:.2}");
    let r1 = rss_mb();
    let t = Instant::now();
    let mut sv = SenseVoice::load(
        &d.join("sensevoice.int8.onnx"),
        &d.join("sensevoice.tokens.txt"),
    )
    .unwrap();
    println!(
        "sensevoice load {:?}, rss +{:.0} MB",
        t.elapsed(),
        rss_mb() - r1
    );
    for l in ["zh", "en"] {
        let a = wav(&d.join(format!("{l}.wav")));
        let t = Instant::now();
        let text = sv.transcribe(&a, "auto").unwrap();
        println!(
            "{l} ({:.1}s audio) {:?}: {text}",
            a.len() as f64 / 16000.0,
            t.elapsed()
        );
    }
    println!("peak rss {:.0} MB", rss_mb());
    drop(sv);
    drop(emb);
    runtime::trim_heap();
    println!("after drop rss {:.0} MB", rss_mb());
    assert!(ok * 10 >= n * 8);
}
