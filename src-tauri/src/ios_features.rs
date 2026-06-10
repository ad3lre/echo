use serde::{Deserialize, Serialize};
use std::ffi::CStr;
use std::os::raw::c_char;

/// Native Sign in with Apple credential returned to the WebView.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleNativeCredential {
    pub identity_token: String,
    pub nonce: Option<String>,
    pub display_name: Option<String>,
}

#[cfg(target_os = "ios")]
mod ffi {
    use super::*;
    use std::sync::OnceLock;

    pub type SyncJsonFn =
        extern "C" fn(*mut *const c_char, *mut *const c_char) -> bool;

    pub static APPLE_SIGN_IN: OnceLock<SyncJsonFn> = OnceLock::new();
    pub static REGISTER_PUSH: OnceLock<SyncJsonFn> = OnceLock::new();

    /// Registered once from `main.mm` before the Tauri app starts.
    #[no_mangle]
    pub extern "C" fn echo_ios_register_feature_callbacks(
        apple_sign_in: SyncJsonFn,
        register_push: SyncJsonFn,
    ) {
        let _ = APPLE_SIGN_IN.set(apple_sign_in);
        let _ = REGISTER_PUSH.set(register_push);
    }

    fn take_c_string(ptr: *mut *const c_char) -> Option<String> {
        if ptr.is_null() {
            return None;
        }
        let raw = unsafe { *ptr };
        if raw.is_null() {
            return None;
        }
        let s = unsafe { CStr::from_ptr(raw) }
            .to_string_lossy()
            .into_owned();
        unsafe { libc::free(raw as *mut libc::c_void) };
        unsafe { *ptr = std::ptr::null() };
        Some(s)
    }

    pub fn call_sync_json(
        func: SyncJsonFn,
    ) -> Result<Option<String>, String> {
        let mut out_ok: *const c_char = std::ptr::null();
        let mut out_err: *const c_char = std::ptr::null();
        let ok = func(&mut out_ok, &mut out_err);
        let err = take_c_string(&mut out_err);
        let value = take_c_string(&mut out_ok);
        if ok {
            Ok(value)
        } else {
            Err(err.unwrap_or_else(|| "native_call_failed".into()))
        }
    }
}

#[cfg(target_os = "ios")]
fn apple_sign_in_native() -> Result<AppleNativeCredential, String> {
    let func = ffi::APPLE_SIGN_IN
        .get()
        .copied()
        .ok_or_else(|| "ios_sign_in_with_apple_not_registered".to_string())?;
    let json = ffi::call_sync_json(func)?;
    let json = json.ok_or_else(|| "apple_signin_empty_response".to_string())?;
    serde_json::from_str(&json).map_err(|e| format!("apple_signin_decode: {e}"))
}

#[cfg(not(target_os = "ios"))]
fn apple_sign_in_native() -> Result<AppleNativeCredential, String> {
    Err("ios_sign_in_with_apple_unavailable".into())
}

#[cfg(target_os = "ios")]
fn register_push_native() -> Result<Option<String>, String> {
    let func = ffi::REGISTER_PUSH
        .get()
        .copied()
        .ok_or_else(|| "ios_register_push_not_registered".to_string())?;
    ffi::call_sync_json(func)
}

#[cfg(not(target_os = "ios"))]
fn register_push_native() -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
pub fn ios_sign_in_with_apple() -> Result<AppleNativeCredential, String> {
    apple_sign_in_native()
}

#[tauri::command]
pub fn ios_register_push_notifications() -> Result<Option<String>, String> {
    register_push_native()
}
