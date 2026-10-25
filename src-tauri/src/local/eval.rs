//! Real-model evaluation. Run with
//! CK_ML_DIR=/path cargo test --release local::eval -- --ignored --nocapture

use super::{asr::SenseVoice, runtime, spk::*};
use std::path::PathBuf;
use std::time::Instant;

fn dir() -> Option<PathBuf> {
    std::env::var("CK_ML_DIR").ok().map(PathBuf::from)
}

fn wav(p: &std::path::Path) -> Vec<f32> {
    let b = std::fs::read(p).unwrap();
    let data = b.windows(4).position(|w| w == b"data").unwrap() + 8;
    b[data..].chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32768.0).collect()
}

fn rss_mb() -> f64 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| s.lines().find(|l| l.starts_with("VmRSS")).map(|l| l.to_string()))
        .and_then(|l| l.split_whitespace().nth(1).and_then(|v| v.parse::<f64>().ok()))
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
    println!("campplus load {:?}, rss +{:.0} MB", t.elapsed(), rss_mb() - r0);
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
            let best = scores.iter().enumerate().fold(0, |b, (j, s)| if *s > scores[b] { j } else { b });
            println!("{p} test {i}: {:?}", scores.iter().map(|s| format!("{s:.2}")).collect::<Vec<_>>());
            n += 1;
            if best == pi {
                ok += 1;
            }
        }
    }
    println!("speaker id {ok}/{n}; latency ms/audio s: {lat:?}");
    let r1 = rss_mb();
    let t = Instant::now();
    let mut sv = SenseVoice::load(&d.join("sensevoice.int8.onnx"), &d.join("sensevoice.tokens.txt")).unwrap();
    println!("sensevoice load {:?}, rss +{:.0} MB", t.elapsed(), rss_mb() - r1);
    for l in ["zh", "en"] {
        let a = wav(&d.join(format!("{l}.wav")));
        let t = Instant::now();
        let text = sv.transcribe(&a, "auto").unwrap();
        println!("{l} ({:.1}s audio) {:?}: {text}", a.len() as f64 / 16000.0, t.elapsed());
    }
    println!("peak rss {:.0} MB", rss_mb());
    drop(sv);
    drop(emb);
    runtime::trim_heap();
    println!("after drop rss {:.0} MB", rss_mb());
    assert!(ok * 10 >= n * 8);
}
