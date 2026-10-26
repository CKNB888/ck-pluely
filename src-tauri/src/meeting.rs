//! 会议软件自动识别：找到正在运行的会议软件，供「正在监听：腾讯会议」显示，
//! 并让系统声音采集只录这个软件（macOS 14.4+ 进程 Tap、Windows 10 2004+ 进程环回）；
//! 找不到或系统不支持时退回整机系统声音。
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

pub struct KnownApp {
    pub name: &'static str,
    /// 进程名（小写，不含 .exe）片段
    pub procs: &'static [&'static str],
    /// macOS bundle id 前缀
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub bundles: &'static [&'static str],
}

pub const KNOWN: &[KnownApp] = &[
    KnownApp {
        name: "腾讯会议",
        procs: &["wemeetapp", "tencentmeeting", "wemeet"],
        bundles: &["com.tencent.meeting"],
    },
    KnownApp {
        name: "钉钉",
        procs: &["dingtalk"],
        bundles: &["com.alibaba.DingTalkMac", "com.alibaba.dingtalk"],
    },
    KnownApp {
        name: "飞书",
        procs: &["feishu", "lark"],
        bundles: &[
            "com.bytedance.macos.feishu",
            "com.electron.lark",
            "com.bytedance.lark",
        ],
    },
    KnownApp {
        name: "企业微信",
        procs: &["wxwork", "wecom", "wework"],
        bundles: &["com.tencent.WeWorkMac"],
    },
    KnownApp {
        name: "Zoom",
        procs: &["zoom.us", "zoom", "cpthost"],
        bundles: &["us.zoom.xos"],
    },
    KnownApp {
        name: "Microsoft Teams",
        procs: &["ms-teams", "teams", "msteams"],
        bundles: &["com.microsoft.teams"],
    },
    KnownApp {
        name: "华为云 WeLink",
        procs: &["welink", "cloudlink"],
        bundles: &["com.huawei.welink", "com.huawei.CloudLink"],
    },
    KnownApp {
        name: "Webex",
        procs: &["webex", "ciscowebex", "atmgr"],
        bundles: &["com.cisco.webexmeetingsapp", "Cisco-Systems.Spark"],
    },
    KnownApp {
        name: "QQ",
        procs: &["qq"],
        bundles: &["com.tencent.qq"],
    },
    KnownApp {
        name: "微信",
        procs: &["wechat", "weixin"],
        bundles: &["com.tencent.xinWeChat"],
    },
];

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct Detected {
    pub name: String,
    /// 该软件的全部进程（Windows 取最上层进程 + include_tree）
    pub pids: Vec<u32>,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct MeetingStatus {
    pub app: Option<String>,
    /// "process"：只录该会议软件；"system"：整机系统声音；"idle"：未在监听
    pub mode: String,
}

static CURRENT: Mutex<Option<Detected>> = Mutex::new(None);
static MODE: Mutex<&'static str> = Mutex::new("idle");

/// 进程名是否属于某个会议软件（按列表顺序，越靠前优先级越高）
pub fn classify(proc_name: &str) -> Option<usize> {
    let n = proc_name.to_lowercase();
    let n = n.trim_end_matches(".exe");
    KNOWN.iter().position(|a| {
        a.procs.iter().any(|p| {
            // 短名字（qq、zoom、teams）要求完全相等，避免误判 qqmusic、zoomit 等
            if p.len() <= 5 {
                n == *p
            } else {
                n == *p || n.starts_with(p)
            }
        })
    })
}

const BROWSERS: &[&str] = &[
    "chrome", "google chrome", "msedge", "microsoft edge", "firefox", "safari", "arc",
    "brave", "opera", "vivaldi", "chromium", "360se", "360chrome", "qqbrowser", "sogouexplorer",
];

/// 浏览器里的网页会议（v2.1.1）：按窗口标题识别，返回显示名。
/// 只看浏览器窗口，避免把文档标题里的「会议」误判成会议。
pub fn classify_title(app_name: &str, title: &str) -> Option<&'static str> {
    let app = app_name.to_lowercase();
    let app = app.trim_end_matches(".exe");
    if !BROWSERS.iter().any(|b| app == *b || app.starts_with(b)) {
        return None;
    }
    let t = title.to_lowercase();
    const RULES: &[(&str, &str)] = &[
        ("腾讯会议", "腾讯会议（网页）"),
        ("voovmeeting", "腾讯会议（网页）"),
        ("meet.google.com", "Google Meet"),
        ("google meet", "Google Meet"),
        ("meet - ", "Google Meet"),
        ("zoom meeting", "Zoom（网页）"),
        ("zoom 会议", "Zoom（网页）"),
        ("microsoft teams", "Microsoft Teams（网页）"),
        ("飞书会议", "飞书会议（网页）"),
        ("lark meetings", "飞书会议（网页）"),
        ("钉钉会议", "钉钉会议（网页）"),
        ("webex", "Webex（网页）"),
        ("jitsi meet", "Jitsi Meet"),
    ];
    RULES.iter().find(|(k, _)| t.contains(k)).map(|(_, n)| *n)
}

/// 没有会议客户端时，看浏览器窗口标题是否是网页会议。
fn detect_browser() -> Option<Detected> {
    let windows = xcap::Window::all().ok()?;
    windows.iter().find_map(|w| {
        classify_title(w.app_name(), w.title()).map(|name| Detected {
            name: name.to_string(),
            // Windows 可只录这个浏览器；其他系统没有窗口 PID，采集退回整机系统声音
            #[cfg(windows)]
            pids: vec![w.process_id()],
            #[cfg(not(windows))]
            pids: Vec::new(),
        })
    })
}

/// 扫描当前进程，返回优先级最高的会议软件；没有则看浏览器网页会议
pub fn detect() -> Option<Detected> {
    detect_apps().or_else(detect_browser)
}

fn detect_apps() -> Option<Detected> {
    use sysinfo::{ProcessRefreshKind, RefreshKind, System, UpdateKind};
    let sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::new().with_exe(UpdateKind::Never)),
    );
    type Procs = Vec<(u32, Option<u32>)>;
    let mut best: Option<(usize, Procs)> = None;
    for (pid, p) in sys.processes() {
        let Some(i) = classify(p.name()) else {
            continue;
        };
        let entry = (pid.as_u32(), p.parent().map(|x| x.as_u32()));
        match &mut best {
            Some((bi, v)) if *bi == i => v.push(entry),
            Some((bi, _)) if *bi < i => {}
            _ => best = Some((i, vec![entry])),
        }
    }
    let (i, procs) = best?;
    let all: Vec<u32> = procs.iter().map(|p| p.0).collect();
    // 最上层进程：父进程不属于这个软件
    let mut roots: Vec<u32> = procs
        .iter()
        .filter(|(_, parent)| parent.map(|pp| !all.contains(&pp)).unwrap_or(true))
        .map(|p| p.0)
        .collect();
    roots.sort_unstable();
    let mut pids = roots;
    for p in all {
        if !pids.contains(&p) {
            pids.push(p);
        }
    }
    Some(Detected {
        name: KNOWN[i].name.to_string(),
        pids,
    })
}

pub fn current() -> Option<Detected> {
    CURRENT.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

pub fn set_mode(m: &'static str) {
    *MODE.lock().unwrap_or_else(|e| e.into_inner()) = m;
}

/// 开始采集前调用：刷新识别结果
pub fn refresh() -> Option<Detected> {
    let d = detect();
    *CURRENT.lock().unwrap_or_else(|e| e.into_inner()) = d.clone();
    d
}

#[tauri::command]
pub fn ck_meeting_status() -> MeetingStatus {
    let mode = *MODE.lock().unwrap_or_else(|e| e.into_inner());
    let app = current().or_else(refresh).map(|d| d.name);
    MeetingStatus {
        app,
        mode: mode.to_string(),
    }
}

/// 后台每 5 秒检查一次会议软件是否出现 / 退出 / 切换，变化时通知前端
/// （前端在监听中会自动重启采集，切到新的会议软件）。
pub fn start_watcher<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        let mut last: Option<String> = None;
        let mut tick: u32 = 0;
        loop {
            // 浏览器窗口标题每 15 秒看一次就够，省 CPU
            tick = tick.wrapping_add(1);
            let d = if tick % 3 == 1 { detect() } else { detect_apps().or_else(|| last.as_ref().and_then(|_| current())) };
            let name = d.as_ref().map(|x| x.name.clone());
            if name != last {
                *CURRENT.lock().unwrap_or_else(|e| e.into_inner()) = d;
                let _ = app.emit("ck-meeting-changed", name.clone());
                crate::startup::log(&format!("meeting app: {:?}", name));
                last = name;
            }
            std::thread::sleep(Duration::from_secs(5));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn classify_known_names() {
        assert_eq!(KNOWN[classify("wemeetapp.exe").unwrap()].name, "腾讯会议");
        assert_eq!(KNOWN[classify("TencentMeeting").unwrap()].name, "腾讯会议");
        assert_eq!(KNOWN[classify("DingTalk").unwrap()].name, "钉钉");
        assert_eq!(KNOWN[classify("Feishu Helper").unwrap()].name, "飞书");
        assert_eq!(KNOWN[classify("WXWork.exe").unwrap()].name, "企业微信");
        assert_eq!(KNOWN[classify("zoom.us").unwrap()].name, "Zoom");
        assert_eq!(
            KNOWN[classify("ms-teams.exe").unwrap()].name,
            "Microsoft Teams"
        );
        assert_eq!(KNOWN[classify("QQ").unwrap()].name, "QQ");
        assert_eq!(KNOWN[classify("WeLink.exe").unwrap()].name, "华为云 WeLink");
        assert!(classify("QQMusic").is_none());
        assert!(classify("zoomit.exe").is_none());
        assert!(classify("firefox").is_none());
    }
    #[test]
    fn browser_meeting_titles() {
        assert_eq!(classify_title("Google Chrome", "Meet - abc-defg-hij"), Some("Google Meet"));
        assert_eq!(classify_title("msedge.exe", "腾讯会议 - 个人"), Some("腾讯会议（网页）"));
        assert_eq!(classify_title("Safari", "Zoom Meeting"), Some("Zoom（网页）"));
        // 非浏览器、或普通网页，不算
        assert_eq!(classify_title("WINWORD.EXE", "腾讯会议 纪要.docx"), None);
        assert_eq!(classify_title("Google Chrome", "百度一下"), None);
    }

    #[test]
    fn meeting_beats_chat_app() {
        // 同时开着微信和腾讯会议时选腾讯会议
        assert!(classify("wemeetapp").unwrap() < classify("WeChat").unwrap());
    }
}
