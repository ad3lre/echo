use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

/// Stored session state persisted in iOS Keychain.
/// Provides instant boot decisions without waiting for network.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoredSessionMemory {
    pub user_id: Option<String>,
    pub display_name: Option<String>,
    pub username: Option<String>,
    pub pfp: Option<String>,
    pub is_guest: Option<bool>,
    pub last_verified_at: Option<u64>,
    pub api_base: Option<String>,
}

/// Boot decision for the native launch layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootDecision {
    pub has_stored_session: bool,
    pub session: Option<StoredSessionMemory>,
    pub action: String,
}

/// App-managed state holding the current session memory.
pub struct IosAuthState {
    pub session: Mutex<Option<StoredSessionMemory>>,
    pub show_native_login: Mutex<bool>,
    pub native_auth_complete: Mutex<bool>,
}

impl Default for IosAuthState {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
            show_native_login: Mutex::new(false),
            native_auth_complete: Mutex::new(false),
        }
    }
}

#[cfg(target_os = "ios")]
const KEYCHAIN_SERVICE: &str = "com.echo.ios.auth";
#[cfg(target_os = "ios")]
const KEYCHAIN_ACCOUNT: &str = "session_memory";

// ── Keychain: iOS uses security-framework, other platforms use temp file ──

#[cfg(target_os = "ios")]
mod keychain {
    use super::*;

    pub fn read_session() -> Option<StoredSessionMemory> {
        match security_framework::passwords::get_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_ACCOUNT,
        ) {
            Ok(bytes) => {
                let json = std::str::from_utf8(&bytes).ok()?;
                serde_json::from_str(json).ok()
            }
            Err(_) => None,
        }
    }

    pub fn write_session(session: &StoredSessionMemory) -> Result<(), String> {
        let json =
            serde_json::to_string(session).map_err(|e| format!("serialize: {e}"))?;
        let _ = delete_session();
        security_framework::passwords::set_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_ACCOUNT,
            json.as_bytes(),
        )
        .map_err(|e| format!("keychain write: {e}"))
    }

    pub fn delete_session() -> Result<(), String> {
        match security_framework::passwords::delete_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_ACCOUNT,
        ) {
            Ok(()) => Ok(()),
            Err(e) => {
                let code = e.code();
                if code == -25300 {
                    // errSecItemNotFound — not an error
                    Ok(())
                } else {
                    Err(format!("keychain delete: {e}"))
                }
            }
        }
    }
}

#[cfg(not(target_os = "ios"))]
mod keychain {
    use super::*;
    use std::path::PathBuf;

    fn session_file_path() -> PathBuf {
        let dir = std::env::temp_dir().join("echo-dev-keychain");
        let _ = std::fs::create_dir_all(&dir);
        dir.join("session_memory.json")
    }

    pub fn read_session() -> Option<StoredSessionMemory> {
        let path = session_file_path();
        let data = std::fs::read_to_string(&path).ok()?;
        serde_json::from_str(&data).ok()
    }

    pub fn write_session(session: &StoredSessionMemory) -> Result<(), String> {
        let path = session_file_path();
        let json =
            serde_json::to_string_pretty(session).map_err(|e| format!("serialize: {e}"))?;
        std::fs::write(&path, json).map_err(|e| format!("write: {e}"))
    }

    pub fn delete_session() -> Result<(), String> {
        let path = session_file_path();
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| format!("delete: {e}"))?;
        }
        Ok(())
    }
}

// ── Tauri commands ──

fn now_unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn ios_auth_boot_check(app: tauri::AppHandle) -> BootDecision {
    let state = app.state::<IosAuthState>();
    let stored = keychain::read_session();

    if let Some(ref session) = stored {
        *state.session.lock().unwrap() = Some(session.clone());
        BootDecision {
            has_stored_session: true,
            session: Some(session.clone()),
            action: "restore".into(),
        }
    } else {
        *state.show_native_login.lock().unwrap() = true;
        BootDecision {
            has_stored_session: false,
            session: None,
            action: "login".into(),
        }
    }
}

#[tauri::command]
pub fn ios_auth_store_session(
    app: tauri::AppHandle,
    user_id: String,
    display_name: String,
    username: String,
    pfp: Option<String>,
    is_guest: Option<bool>,
    api_base: Option<String>,
) -> Result<(), String> {
    let session = StoredSessionMemory {
        user_id: Some(user_id),
        display_name: Some(display_name),
        username: Some(username),
        pfp,
        is_guest,
        last_verified_at: Some(now_unix_ms()),
        api_base,
    };
    keychain::write_session(&session)?;
    let state = app.state::<IosAuthState>();
    *state.session.lock().unwrap() = Some(session);
    *state.native_auth_complete.lock().unwrap() = true;
    Ok(())
}

#[tauri::command]
pub fn ios_auth_update_session(
    app: tauri::AppHandle,
    display_name: Option<String>,
    username: Option<String>,
    pfp: Option<String>,
    is_guest: Option<bool>,
) -> Result<(), String> {
    let state = app.state::<IosAuthState>();
    let mut lock = state.session.lock().unwrap();
    let Some(ref mut session) = *lock else {
        return Err("no stored session to update".into());
    };
    if let Some(dn) = display_name {
        session.display_name = Some(dn);
    }
    if let Some(un) = username {
        session.username = Some(un);
    }
    if pfp.is_some() {
        session.pfp = pfp;
    }
    if let Some(g) = is_guest {
        session.is_guest = Some(g);
    }
    session.last_verified_at = Some(now_unix_ms());
    keychain::write_session(session)?;
    Ok(())
}

#[tauri::command]
pub fn ios_auth_clear_session(app: tauri::AppHandle) -> Result<(), String> {
    keychain::delete_session()?;
    let state = app.state::<IosAuthState>();
    *state.session.lock().unwrap() = None;
    *state.native_auth_complete.lock().unwrap() = false;
    Ok(())
}

#[tauri::command]
pub fn ios_auth_get_session(app: tauri::AppHandle) -> Option<StoredSessionMemory> {
    let state = app.state::<IosAuthState>();
    let guard = state.session.lock().unwrap();
    guard.clone()
}

#[tauri::command]
pub fn ios_auth_session_restored(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<IosAuthState>();
    *state.native_auth_complete.lock().unwrap() = true;
    *state.show_native_login.lock().unwrap() = false;
    let _ = &app;
    Ok(())
}

#[tauri::command]
pub fn ios_auth_session_restore_failed(app: tauri::AppHandle) -> Result<(), String> {
    let _ = keychain::delete_session();
    let state = app.state::<IosAuthState>();
    *state.session.lock().unwrap() = None;
    *state.show_native_login.lock().unwrap() = true;
    let _ = &app;
    Ok(())
}

#[tauri::command]
pub fn ios_auth_should_show_login(app: tauri::AppHandle) -> bool {
    let state = app.state::<IosAuthState>();
    let guard = state.show_native_login.lock().unwrap();
    *guard
}

#[tauri::command]
pub fn ios_auth_mark_verified(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<IosAuthState>();
    let mut lock = state.session.lock().unwrap();
    if let Some(ref mut session) = *lock {
        session.last_verified_at = Some(now_unix_ms());
        keychain::write_session(session)?;
    }
    Ok(())
}
