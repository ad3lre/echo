//! macOS: let third-party global shortcuts (screenshot tools, etc.) work while Echo is focused.
//!
//! WKWebView's `performKeyEquivalent:` often returns YES for Option/Alt combos, which stops
//! the responder chain before macOS can deliver the shortcut to other apps' global hotkeys.
//! When Echo is focused, tools like CleanShot / Shottr (often bound to Option+S) appear broken;
//! switching to another app "fixes" it because that app doesn't swallow the combo.
//!
//! We patch the main webview's runtime class once at boot: Option/Alt without Command is passed
//! through (return NO). Cmd+key and plain typing behave as before via the saved original IMP.

use std::ffi::CStr;
use std::sync::OnceLock;

use objc2::ffi;
use objc2::runtime::{AnyObject, Bool, Sel};
use objc2_app_kit::{NSEvent, NSEventModifierFlags};
use tauri::WebviewWindow;

type PerformKeyEquivalentFn = unsafe extern "C-unwind" fn(
  *mut AnyObject,
  Sel,
  *mut AnyObject,
) -> Bool;

static ORIGINAL_PERFORM_KEY_EQUIVALENT: OnceLock<PerformKeyEquivalentFn> = OnceLock::new();
static INSTALL_ONCE: std::sync::Once = std::sync::Once::new();

unsafe extern "C-unwind" fn echo_perform_key_equivalent(
  this: *mut AnyObject,
  sel: Sel,
  event: *mut AnyObject,
) -> Bool {
  if !event.is_null() {
    let event: &NSEvent = &*event.cast();
    let flags = event.modifierFlags();
    // Pass Option/Alt shortcuts (without Command) to the OS / global hotkey handlers.
    if flags.contains(NSEventModifierFlags::Option)
      && !flags.contains(NSEventModifierFlags::Command)
    {
      return Bool::NO;
    }
  }

  if let Some(original) = ORIGINAL_PERFORM_KEY_EQUIVALENT.get() {
    original(this, sel, event)
  } else {
    Bool::NO
  }
}

unsafe fn install_on_webview(wk: *mut AnyObject) {
  if wk.is_null() {
    return;
  }

  let cls = std::ptr::from_ref((*wk).class()).cast_mut();
  let sel_name = CStr::from_bytes_with_nul(b"performKeyEquivalent:\0").unwrap();
  let types = CStr::from_bytes_with_nul(b"c@:@\0").unwrap();
  let Some(sel) = ffi::sel_registerName(sel_name.as_ptr()) else {
    return;
  };

  let new_imp: objc2::runtime::Imp = std::mem::transmute(echo_perform_key_equivalent as *const ());
  if let Some(original) = ffi::class_replaceMethod(cls, sel, new_imp, types.as_ptr()) {
    let _ = ORIGINAL_PERFORM_KEY_EQUIVALENT
      .set(std::mem::transmute::<_, PerformKeyEquivalentFn>(original));
  }
}

/// Patch the main window webview so Option/Alt global shortcuts reach other apps.
pub fn install_third_party_shortcut_passthrough(window: &WebviewWindow) {
  let _ = window.with_webview(|webview| {
    INSTALL_ONCE.call_once(|| unsafe {
      install_on_webview(webview.inner() as *mut AnyObject);
    });
  });
}
