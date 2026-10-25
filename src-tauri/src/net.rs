//! 共享 HTTP 连接池（对话 / 语音识别请求）。
//!
//! tauri-plugin-http 每个请求都新建一个 reqwest::Client，意味着每次提问都要重新
//! 做 DNS + TCP + TLS 握手（国内到海外服务商常见 150–400 ms）。这里改为全局一个
//! Client：HTTP/2（ALPN 协商）+ keep-alive 复用连接，启动和开始监听时预热，
//! 流式响应通过 Channel 逐块推给前端（SSE 原样透传）。
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::ipc::{Channel, InvokeResponseBody};

pub static CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(4)
        .tcp_keepalive(Duration::from_secs(30))
        .tcp_nodelay(true)
        .http2_keep_alive_interval(Duration::from_secs(25))
        .http2_keep_alive_while_idle(true)
        .user_agent(concat!("CK-Pluely/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("http client")
});

/// 正在进行的请求：id → 取消信号
static INFLIGHT: Lazy<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<()>>>> = Lazy::new(|| Mutex::new(HashMap::new()));
/// 上传的请求体（大音频走原始字节，不经 JSON）：id → bytes
static BODIES: Lazy<Mutex<HashMap<u64, Vec<u8>>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn check_url(url: &str) -> Result<reqwest::Url, String> {
    let u = reqwest::Url::parse(url).map_err(|_| format!("地址无效：{url}"))?;
    match u.scheme() {
        "http" | "https" => Ok(u),
        _ => Err(format!("只允许 http(s) 地址：{url}")),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub id: u64,
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    /// 文本请求体（JSON 等）。二进制请求体先用 ck_http_body 上传。
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub raw_body: bool,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
enum Event {
    Head { status: u16, status_text: String, headers: Vec<(String, String)>, connect_ms: u64 },
    End,
    Error { message: String },
}

fn send_json<T: Serialize>(ch: &Channel<InvokeResponseBody>, e: &T) {
    if let Ok(s) = serde_json::to_string(e) {
        let _ = ch.send(InvokeResponseBody::Json(s));
    }
}

/// 上传二进制请求体（前端用 invoke 的原始字节负载，避免 JSON 数组膨胀）。
#[tauri::command]
pub fn ck_http_body(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let id: u64 = request
        .headers()
        .get("x-ck-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .ok_or("缺少请求编号")?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("请求体必须是二进制".into());
    };
    BODIES.lock().unwrap().insert(id, bytes.clone());
    Ok(())
}

/// 发送请求；响应头、正文分块、结束 / 错误依次通过 `on_event` 推送。
/// 正文块是原始字节（前端收到 ArrayBuffer），其余事件是 JSON。
#[tauri::command]
pub async fn ck_http_fetch(req: HttpRequest, on_event: Channel<InvokeResponseBody>) -> Result<(), String> {
    let url = check_url(&req.url)?;
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|_| "请求方法无效")?;
    let mut rb = CLIENT.request(method, url);
    for (k, v) in &req.headers {
        rb = rb.header(k, v);
    }
    if req.raw_body {
        let b = BODIES.lock().unwrap().remove(&req.id).ok_or("请求体未上传")?;
        rb = rb.body(b);
    } else if let Some(b) = req.body {
        rb = rb.body(b);
    }
    if let Some(t) = req.timeout_ms {
        rb = rb.timeout(Duration::from_millis(t));
    }
    let (tx, mut rx) = tokio::sync::oneshot::channel::<()>();
    INFLIGHT.lock().unwrap().insert(req.id, tx);
    let id = req.id;
    let ch = on_event.clone();
    let work = async move {
        let t0 = Instant::now();
        let mut res = rb.send().await.map_err(describe)?;
        let headers = res
            .headers()
            .iter()
            .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
            .collect();
        send_json(&ch, &Event::Head {
            status: res.status().as_u16(),
            status_text: res.status().canonical_reason().unwrap_or("").to_string(),
            headers,
            connect_ms: t0.elapsed().as_millis() as u64,
        });
        while let Some(chunk) = res.chunk().await.map_err(describe)? {
            if ch.send(InvokeResponseBody::Raw(chunk.to_vec())).is_err() {
                break; // 前端已经不要了
            }
        }
        Ok::<(), String>(())
    };
    let r = tokio::select! {
        r = work => r,
        _ = &mut rx => Err("__aborted".to_string()),
    };
    INFLIGHT.lock().unwrap().remove(&id);
    match r {
        Ok(()) => send_json(&on_event, &Event::End),
        Err(m) if m == "__aborted" => send_json(&on_event, &Event::Error { message: "已取消".into() }),
        Err(m) => send_json(&on_event, &Event::Error { message: m }),
    }
    Ok(())
}

#[tauri::command]
pub fn ck_http_abort(id: u64) {
    if let Some(tx) = INFLIGHT.lock().unwrap().remove(&id) {
        let _ = tx.send(());
    }
    BODIES.lock().unwrap().remove(&id);
}

fn describe(e: reqwest::Error) -> String {
    if e.is_timeout() {
        "连接超时".into()
    } else if e.is_connect() {
        format!("无法连接服务器（{}）", e.url().and_then(|u| u.host_str()).unwrap_or(""))
    } else {
        e.to_string()
    }
}

/// 预热：对给定服务商域名建立连接（DNS + TCP + TLS）并放进连接池。
/// 只发一个不带密钥的 HEAD 请求；返回每个地址耗时（毫秒），失败为 -1。
#[tauri::command]
pub async fn ck_http_prewarm(urls: Vec<String>) -> Vec<i64> {
    let mut out = Vec::new();
    for u in urls {
        let Ok(url) = check_url(&u) else {
            out.push(-1);
            continue;
        };
        let origin = format!("{}/", url.origin().ascii_serialization());
        let t = Instant::now();
        let ok = CLIENT.head(&origin).timeout(Duration::from_secs(5)).send().await.is_ok();
        out.push(if ok { t.elapsed().as_millis() as i64 } else { -1 });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_http() {
        assert!(check_url("file:///etc/passwd").is_err());
        assert!(check_url("https://api.groq.com/openai/v1").is_ok());
    }

    fn keys() -> Vec<String> {
        let p = std::env::var("CK_KEYS_FILE").unwrap_or_default();
        std::fs::read_to_string(p).unwrap_or_default().lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect()
    }

    async fn ttft(client: &reqwest::Client, key: &str, body: &serde_json::Value) -> (u128, u128) {
        let t = Instant::now();
        let mut r = client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(key)
            .json(body)
            .send()
            .await
            .unwrap();
        assert!(r.status().is_success(), "status {}", r.status());
        let mut first = 0;
        while let Some(c) = r.chunk().await.unwrap() {
            if first == 0 && !c.is_empty() && String::from_utf8_lossy(&c).contains("\"content\"") {
                first = t.elapsed().as_millis();
            }
        }
        (first, t.elapsed().as_millis())
    }

    /// CK_KEYS_FILE=... cargo test --release net::tests::live_pool -- --ignored --nocapture
    /// 对比「每次新建连接」（tauri-plugin-http 的做法）与「共享连接池」的首字时间。
    #[tokio::test]
    #[ignore]
    async fn live_pool() {
        let ks = keys();
        let Some(key) = ks.first() else { return };
        let body = serde_json::json!({
            "model": "openai/gpt-oss-20b", "stream": true, "max_tokens": 64, "reasoning_effort": "low",
            "messages": [{"role":"user","content":"用一句话解释什么是导数"}]
        });
        let mut fresh = Vec::new();
        let mut pooled = Vec::new();
        for _ in 0..6 {
            let c = reqwest::Client::builder().connect_timeout(Duration::from_secs(10)).build().unwrap();
            fresh.push(ttft(&c, key, &body).await.0);
            pooled.push(ttft(&CLIENT, key, &body).await.0);
        }
        // 第一次池化请求包含建连，单独列出
        fresh.sort();
        let warm: Vec<u128> = { let mut v = pooled[1..].to_vec(); v.sort(); v };
        println!("NEWCONN ttft ms sorted {:?} median {}", fresh, fresh[fresh.len() / 2]);
        println!("POOLED  ttft ms first(cold) {} warm sorted {:?} median {}", pooled[0], warm, warm[warm.len() / 2]);
    }
}
