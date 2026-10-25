//! ck-pluely additions: OS keychain storage for provider API keys and a
//! macOS version probe (system-audio capture needs macOS 14.2+).

const SERVICE: &str = "com.ck.pluely";

fn validate_account(account: &str) -> Result<(), String> {
    if account.is_empty() || account.len() > 200 {
        return Err("invalid account".into());
    }
    Ok(())
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn entry(account: &str) -> Result<keyring::Entry, String> {
    validate_account(account)?;
    keyring::Entry::new(SERVICE, account).map_err(|e| e.to_string())
}

/// Returns `Ok(None)` when no secret is stored, `Err` when the keychain is unavailable.
#[tauri::command]
pub fn ck_secret_get(account: String) -> Result<Option<String>, String> {
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        match entry(&account)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = account;
        Err("keychain unsupported".into())
    }
}

#[tauri::command]
pub fn ck_secret_set(account: String, value: String) -> Result<(), String> {
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        entry(&account)?
            .set_password(&value)
            .map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = (account, value);
        Err("keychain unsupported".into())
    }
}

#[tauri::command]
pub fn ck_secret_delete(account: String) -> Result<(), String> {
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        match entry(&account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = account;
        Err("keychain unsupported".into())
    }
}

/// macOS product version such as "14.1.2"; `None` on other platforms or on failure.
#[tauri::command]
pub fn ck_macos_version() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let out = std::process::Command::new("/usr/bin/sw_vers")
            .arg("-productVersion")
            .output()
            .ok()?;
        let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if v.is_empty() {
            None
        } else {
            Some(v)
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::validate_account;

    #[test]
    fn account_validation() {
        assert!(validate_account("").is_err());
        assert!(validate_account("ai:groq:api_key").is_ok());
        assert!(validate_account(&"x".repeat(201)).is_err());
    }
}
