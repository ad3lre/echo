use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

// ── Native overlay bridge (Rust ↔ Swift) ──
//
// The Rust shell is built as a dylib that is linked *before* the Swift
// `@_cdecl` overlay functions exist (they live in the app executable). So Rust
// cannot reference those symbols directly at link time. Instead `main.mm` (which
// is compiled into the app target alongside the Swift code) passes the Swift
// function pointers into Rust at launch via `echo_ios_register_overlay_callbacks`,
// and Rust calls back through the stored pointers. This also keeps the Swift
// symbols alive (referenced by `main.mm`), preventing dead-strip.

#[cfg(target_os = "ios")]
mod overlay_ffi {
    use std::os::raw::c_char;
    use std::sync::OnceLock;

    pub type BootFn = extern "C" fn(*const c_char);
    pub type VoidFn = extern "C" fn();

    pub static BOOT: OnceLock<BootFn> = OnceLock::new();
    pub static DISMISS: OnceLock<VoidFn> = OnceLock::new();
    pub static SHOW_LOGIN: OnceLock<VoidFn> = OnceLock::new();

    /// Registered once from `main.mm` before the Tauri app starts.
    #[no_mangle]
    pub extern "C" fn echo_ios_register_overlay_callbacks(
        boot: BootFn,
        dismiss: VoidFn,
        show_login: VoidFn,
    ) {
        let _ = BOOT.set(boot);
        let _ = DISMISS.set(dismiss);
        let _ = SHOW_LOGIN.set(show_login);
    }
}

/// Configure the native auth bridge + show the boot overlay. Call once at startup.
#[cfg(target_os = "ios")]
pub fn native_boot(api_base: &str) {
    if let (Some(boot), Ok(c)) = (overlay_ffi::BOOT.get(), std::ffi::CString::new(api_base)) {
        // Swift copies the string synchronously, so the CString may drop after.
        boot(c.as_ptr());
    }
}

#[cfg(target_os = "ios")]
fn native_dismiss_overlay() {
    if let Some(f) = overlay_ffi::DISMISS.get() {
        f();
    }
}
#[cfg(not(target_os = "ios"))]
fn native_dismiss_overlay() {}

#[cfg(target_os = "ios")]
fn native_show_login() {
    if let Some(f) = overlay_ffi::SHOW_LOGIN.get() {
        f();
    }
}
#[cfg(not(target_os = "ios"))]
fn native_show_login() {}

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
#[cfg(all(target_os = "macos", not(target_os = "ios")))]
const KEYCHAIN_SERVICE: &str = "com.echo.desktop.auth";
#[cfg(target_os = "ios")]
const KEYCHAIN_ACCOUNT: &str = "session_memory";
#[cfg(all(target_os = "macos", not(target_os = "ios")))]
const KEYCHAIN_ACCOUNT: &str = "session_memory";
#[cfg(target_os = "ios")]
const KEYCHAIN_REFRESH_ACCOUNT: &str = "refresh_token";
#[cfg(all(target_os = "macos", not(target_os = "ios")))]
const KEYCHAIN_REFRESH_ACCOUNT: &str = "refresh_token";
#[cfg(all(not(target_os = "ios"), not(target_os = "macos")))]
const KEYCHAIN_ACCOUNT: &str = "session_memory";
#[cfg(all(not(target_os = "ios"), not(target_os = "macos")))]
const KEYCHAIN_REFRESH_ACCOUNT: &str = "refresh_token";

// ── Keychain: iOS + macOS use security-framework; Windows/Linux use OS credential store ──

#[cfg(any(target_os = "ios", target_os = "macos"))]
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

    pub fn read_refresh_token() -> Option<String> {
        match security_framework::passwords::get_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_REFRESH_ACCOUNT,
        ) {
            Ok(bytes) => std::str::from_utf8(&bytes).ok().map(|s| s.to_string()),
            Err(_) => None,
        }
    }

    pub fn write_refresh_token(token: &str) -> Result<(), String> {
        let _ = delete_refresh_token();
        security_framework::passwords::set_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_REFRESH_ACCOUNT,
            token.as_bytes(),
        )
        .map_err(|e| format!("keychain refresh write: {e}"))
    }

    pub fn delete_refresh_token() -> Result<(), String> {
        match security_framework::passwords::delete_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_REFRESH_ACCOUNT,
        ) {
            Ok(()) => Ok(()),
            Err(e) => {
                let code = e.code();
                if code == -25300 {
                    Ok(())
                } else {
                    Err(format!("keychain refresh delete: {e}"))
                }
            }
        }
    }
}

#[cfg(all(not(target_os = "ios"), not(target_os = "macos")))]
mod keychain {
    use super::*;
    use keyring::{Entry, Error};
    use std::path::PathBuf;

    const CREDENTIAL_SERVICE: &str = "com.echo.desktop.auth";

    fn credential_entry(account: &str) -> Result<Entry, String> {
        Entry::new(CREDENTIAL_SERVICE, account)
            .map_err(|e| format!("keyring entry: {e}"))
    }

    /// Legacy dev builds stored tokens under the OS temp dir; migrate once on read.
    fn legacy_temp_dir() -> PathBuf {
        std::env::temp_dir().join("echo-dev-keychain")
    }

    fn migrate_legacy_file(name: &str, account: &str) -> Option<String> {
        let path = legacy_temp_dir().join(name);
        let data = std::fs::read_to_string(&path).ok()?;
        let trimmed = data.trim().to_string();
        if trimmed.is_empty() {
            return None;
        }
        if let Ok(entry) = credential_entry(account) {
            let _ = entry.set_password(&trimmed);
            let _ = std::fs::remove_file(&path);
        }
        Some(trimmed)
    }

    fn migrate_legacy_session() -> Option<StoredSessionMemory> {
        let path = legacy_temp_dir().join("session_memory.json");
        let data = std::fs::read_to_string(&path).ok()?;
        let session = serde_json::from_str::<StoredSessionMemory>(&data).ok()?;
        let _ = write_session(&session);
        let _ = std::fs::remove_file(&path);
        Some(session)
    }

    pub fn read_session() -> Option<StoredSessionMemory> {
        let entry = credential_entry(KEYCHAIN_ACCOUNT).ok()?;
        match entry.get_password() {
            Ok(json) => serde_json::from_str(&json).ok(),
            Err(Error::NoEntry) => migrate_legacy_session(),
            Err(_) => migrate_legacy_session(),
        }
    }

    pub fn write_session(session: &StoredSessionMemory) -> Result<(), String> {
        let json =
            serde_json::to_string(session).map_err(|e| format!("serialize: {e}"))?;
        let entry = credential_entry(KEYCHAIN_ACCOUNT)?;
        let _ = delete_session();
        entry
            .set_password(&json)
            .map_err(|e| format!("keychain write: {e}"))
    }

    pub fn delete_session() -> Result<(), String> {
        match credential_entry(KEYCHAIN_ACCOUNT)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("keychain delete: {e}")),
        }
    }

    pub fn read_refresh_token() -> Option<String> {
        let entry = credential_entry(KEYCHAIN_REFRESH_ACCOUNT).ok()?;
        match entry.get_password() {
            Ok(token) => {
                let trimmed = token.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            }
            Err(Error::NoEntry) => {
                migrate_legacy_file("refresh_token.txt", KEYCHAIN_REFRESH_ACCOUNT)
            }
            Err(_) => migrate_legacy_file("refresh_token.txt", KEYCHAIN_REFRESH_ACCOUNT),
        }
    }

    pub fn write_refresh_token(token: &str) -> Result<(), String> {
        let entry = credential_entry(KEYCHAIN_REFRESH_ACCOUNT)?;
        let _ = delete_refresh_token();
        entry
            .set_password(token.trim())
            .map_err(|e| format!("keychain refresh write: {e}"))
    }

    pub fn delete_refresh_token() -> Result<(), String> {
        match credential_entry(KEYCHAIN_REFRESH_ACCOUNT)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("keychain refresh delete: {e}")),
        }
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
    let _ = keychain::delete_refresh_token();
    let state = app.state::<IosAuthState>();
    *state.session.lock().unwrap() = None;
    *state.native_auth_complete.lock().unwrap() = false;
    Ok(())
}

#[tauri::command]
pub fn ios_auth_store_refresh_token(refresh_token: String) -> Result<(), String> {
    keychain::write_refresh_token(refresh_token.trim())
}

#[tauri::command]
pub fn ios_auth_get_refresh_token() -> Option<String> {
    keychain::read_refresh_token()
}

#[tauri::command]
pub fn ios_auth_clear_refresh_token() -> Result<(), String> {
    keychain::delete_refresh_token()
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
    // WebView has adopted the session — fade out the native overlay.
    native_dismiss_overlay();
    Ok(())
}

#[tauri::command]
pub fn ios_auth_session_restore_failed(app: tauri::AppHandle) -> Result<(), String> {
    let _ = keychain::delete_session();
    let state = app.state::<IosAuthState>();
    *state.session.lock().unwrap() = None;
    *state.show_native_login.lock().unwrap() = true;
    let _ = &app;
    // Stored session is gone / invalid — show the native login screen.
    native_show_login();
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
