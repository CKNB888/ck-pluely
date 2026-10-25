//! 课堂纪要 export: plain files in Documents/CK Pluely (user documents, so
//! 「完全卸载」 deliberately leaves them).

use std::path::PathBuf;

pub fn safe_name(name: &str) -> Option<String> {
    let ok_ext = name.ends_with(".md") || name.ends_with(".txt");
    let ok_chars = name
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' '));
    if ok_ext && ok_chars && !name.contains("..") && !name.starts_with('.') && name.len() <= 120 {
        Some(name.to_string())
    } else {
        None
    }
}

#[tauri::command]
pub fn ck_export_notes(name: String, content: String) -> Result<String, String> {
    let name = safe_name(&name).ok_or("文件名无效")?;
    let docs = dirs_docs().ok_or("找不到“文稿”文件夹")?;
    let dir = docs.join("CK Pluely");
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建文件夹：{e}"))?;
    let mut path = dir.join(&name);
    // never overwrite an earlier export
    let mut n = 2;
    while path.exists() {
        let (stem, ext) = name.rsplit_once('.').unwrap_or((&name, "md"));
        path = dir.join(format!("{stem}-{n}.{ext}"));
        n += 1;
    }
    std::fs::write(&path, content).map_err(|e| format!("保存失败：{e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

fn dirs_docs() -> Option<PathBuf> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)?;
    #[cfg(target_os = "linux")]
    {
        // honour XDG user-dirs when set
        if let Ok(cfg) = std::fs::read_to_string(home.join(".config/user-dirs.dirs")) {
            for line in cfg.lines() {
                if let Some(v) = line.strip_prefix("XDG_DOCUMENTS_DIR=") {
                    let v = v.trim_matches('"').replace("$HOME", &home.to_string_lossy());
                    let p = PathBuf::from(v);
                    if p.is_dir() {
                        return Some(p);
                    }
                }
            }
        }
    }
    let d = home.join("Documents");
    Some(if d.is_dir() { d } else { home })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_restricted() {
        assert!(safe_name("课堂纪要-20261025-0930.md").is_some());
        assert!(safe_name("a.txt").is_some());
        assert!(safe_name("../x.md").is_none());
        assert!(safe_name("a/b.md").is_none());
        assert!(safe_name("a.exe").is_none());
        assert!(safe_name(".md").is_none());
    }
}
