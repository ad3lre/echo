use serde::Deserialize;
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::Emitter;
use tauri::Manager;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::UserAttentionType;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::WindowEvent;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::menu::{Menu, MenuItem};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::tray::{TrayIconBuilder, TrayIconId};
#[cfg(any(windows, target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::DialogExt;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[path = "desktop_audio_desktop.rs"]
mod desktop_audio;
#[cfg(any(target_os = "android", target_os = "ios"))]
#[path = "desktop_audio_android.rs"]
mod desktop_audio;

use desktop_audio::{DesktopAudioDevice, DesktopAudioState};

mod ios_auth;
mod ios_features;
mod ios_native;

#[cfg(target_os = "macos")]
mod macos_webview_shortcuts;

/// Persisted preference mirrored from the SPA (close hides to tray vs exit).
#[derive(Clone)]
pub struct ShellPrefs {
  pub close_to_tray: Arc<AtomicBool>,
}

impl ShellPrefs {
  fn new_with_platform_defaults() -> Self {
    Self {
      close_to_tray: Arc::new(AtomicBool::new(!cfg!(target_os = "macos"))),
    }
  }
}

/// JS → Rust payload from `invoke('log_frontend_event', { payload })`.
///
/// Tauri 2 only converts the top-level invoke arg name (camelCase → snake_case);
/// nested struct fields use serde rules. Without `rename_all = "camelCase"`, the
/// `userAgent` field sent by `consoleLogRecorder.ts` was silently dropped from
/// every desktop log line (`user_agent` was always `None`).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrontendLogPayload {
  timestamp: String,
  level: String,
  kind: String,
  message: String,
  details: Option<Vec<Value>>,
  href: Option<String>,
  user_agent: Option<String>,
}

fn resolve_log_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let log_dir = app
    .path()
    .app_log_dir()
    .map_err(|e| format!("failed to resolve app log dir: {e}"))?;
  fs::create_dir_all(&log_dir)
    .map_err(|e| format!("failed to create app log dir {}: {e}", log_dir.display()))?;
  Ok(log_dir.join("echo-desktop.log"))
}

fn append_log_line(app: &tauri::AppHandle, line: &str) -> Result<(), String> {
  let path = resolve_log_file_path(app)?;
  let mut file = OpenOptions::new()
    .create(true)
    .append(true)
    .open(&path)
    .map_err(|e| format!("failed to open log file {}: {e}", path.display()))?;
  writeln!(file, "{line}")
    .map_err(|e| format!("failed to write log file {}: {e}", path.display()))
}

/// Single-file cap for `desktop_shell_save_file` (dialog saves; not general FS API).
const MAX_DESKTOP_SAVE_BYTES: usize = 64 * 1024 * 1024;

/// Hard cap on one JSON log line from the WebView (prevents disk fill from loops / abuse).
const MAX_FRONTEND_LOG_LINE_BYTES: usize = 48 * 1024;
const MAX_FRONTEND_LOG_MESSAGE_CHARS: usize = 4000;
const MAX_FRONTEND_LOG_DETAILS_ITEMS: usize = 40;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
const MAX_TRAY_TOOLTIP_CHARS: usize = 128;

fn windows_reserved_file_stem(stem: &str) -> bool {
  let stem_upper: String = stem.chars().filter(|c| *c != '.').collect::<String>().to_ascii_uppercase();
  if matches!(
    stem_upper.as_str(),
    "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
  ) {
    return true;
  }
  for prefix in ["COM", "LPT"] {
    if stem_upper.starts_with(prefix) && stem_upper.len() > prefix.len() {
      let rest: String = stem_upper.chars().skip(prefix.len()).collect();
      if rest.chars().all(|c| c.is_ascii_digit()) && !rest.is_empty() {
        if let Ok(n) = rest.parse::<u32>() {
          if (1..=9).contains(&n) {
            return true;
          }
        }
      }
    }
  }
  false
}

fn validate_desktop_save_path(p: &Path) -> Result<(), String> {
  for c in p.components() {
    match c {
      Component::ParentDir => return Err("save path must not contain '..'".into()),
      Component::Prefix(_)
      | Component::RootDir
      | Component::CurDir
      | Component::Normal(_) => {}
    }
  }
  let Some(name) = p.file_name().and_then(|s| s.to_str()) else {
    return Err("save path needs a file name".into());
  };
  if name.trim().is_empty() {
    return Err("save path file name is empty".into());
  }
  let stem = Path::new(name)
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or(name);
  if windows_reserved_file_stem(stem) {
    return Err("reserved Windows device name".into());
  }
  Ok(())
}

fn now_unix_ms() -> u128 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0)
}

fn strip_url_sensitive(s: &str) -> String {
  if s.starts_with("echo://") || s.starts_with("https://") || s.contains('?') {
    let cut = s.find('?').or_else(|| s.find('#')).unwrap_or(s.len());
    s[..cut].to_string()
  } else {
    s.to_string()
  }
}

fn log_argv_boot() {
  let args: Vec<String> = std::env::args()
    .map(|a| strip_url_sensitive(&a))
    .collect();
  let exe_display = std::env::current_exe()
    .map(|p| p.display().to_string())
    .unwrap_or_else(|_| "<unknown>".to_string());
  let line = serde_json::json!({
    "timestampUnixMs": now_unix_ms(),
    "source": "desktop",
    "level": "info",
    "kind": "argv_boot",
    "message": "Process argv at main() entry (before Tauri)",
    "exe": exe_display,
    "args": args,
  });
  let line_str = line.to_string();
  #[cfg(debug_assertions)]
  eprintln!("[echo-desktop] {line_str}");

  #[cfg(windows)]
  if let Ok(local) = std::env::var("LOCALAPPDATA") {
    let path = PathBuf::from(local)
      .join("com.echo.desktop")
      .join("logs")
      .join("echo-desktop.log");
    if let Some(parent) = path.parent() {
      let _ = fs::create_dir_all(parent);
      if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
      {
        let _ = writeln!(file, "{line_str}");
      }
    }
  }

  #[cfg(target_os = "linux")]
  {
    let state_base = std::env::var("XDG_STATE_HOME")
      .ok()
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
      .map(PathBuf::from)
      .or_else(|| {
        std::env::var("HOME")
          .ok()
          .map(|s| s.trim().to_string())
          .filter(|s| !s.is_empty())
          .map(|h| PathBuf::from(h).join(".local").join("state"))
      });
    if let Some(base) = state_base {
      let path = base
        .join("com.echo.desktop")
        .join("logs")
        .join("echo-desktop.log");
      if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
        if let Ok(mut file) = OpenOptions::new()
          .create(true)
          .append(true)
          .open(&path)
        {
          let _ = writeln!(file, "{line_str}");
        }
      }
    }
  }

  #[cfg(all(
    not(debug_assertions),
    not(target_os = "windows"),
    not(target_os = "linux"),
  ))]
  let _ = line_str;
}

fn bring_main_window_to_front(app: &tauri::AppHandle) {
  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
  #[cfg(any(target_os = "android", target_os = "ios"))]
  let _ = app;
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(any(target_os = "android", target_os = "ios"), allow(dead_code))]
struct TrayMenuLabelsPayload {
  show: String,
  open_messages: String,
  toggle_desktop_alerts: String,
  notification_settings: String,
  quit: String,
  tooltip: Option<String>,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn build_echo_tray_menu(
  app: &tauri::AppHandle,
  labels: &TrayMenuLabelsPayload,
) -> Result<Menu<tauri::Wry>, String> {
  let show = MenuItem::with_id(app, "echo_tray_show", labels.show.as_str(), true, None::<&str>)
    .map_err(|e| e.to_string())?;
  let messages = MenuItem::with_id(
    app,
    "echo_tray_messages",
    labels.open_messages.as_str(),
    true,
    None::<&str>,
  )
  .map_err(|e| e.to_string())?;
  let toggle_alerts = MenuItem::with_id(
    app,
    "echo_tray_toggle_alerts",
    labels.toggle_desktop_alerts.as_str(),
    true,
    None::<&str>,
  )
  .map_err(|e| e.to_string())?;
  let notif = MenuItem::with_id(
    app,
    "echo_tray_notifications",
    labels.notification_settings.as_str(),
    true,
    None::<&str>,
  )
  .map_err(|e| e.to_string())?;
  let quit = MenuItem::with_id(app, "echo_tray_quit", labels.quit.as_str(), true, None::<&str>)
    .map_err(|e| e.to_string())?;
  Menu::with_items(
    app,
    &[&show, &messages, &toggle_alerts, &notif, &quit],
  )
  .map_err(|e| e.to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn setup_desktop_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
  let default_labels = TrayMenuLabelsPayload {
    show: "Show Echo".into(),
    open_messages: "Open Messages".into(),
    toggle_desktop_alerts: "Toggle desktop alerts".into(),
    notification_settings: "Notification settings…".into(),
    quit: "Quit Echo".into(),
    tooltip: Some("Echo".into()),
  };
  let menu = build_echo_tray_menu(app.handle(), &default_labels)?;

  let mut builder = TrayIconBuilder::with_id("echo-main-tray")
    .menu(&menu)
    .show_menu_on_left_click(true)
    .tooltip(default_labels.tooltip.as_deref().unwrap_or("Echo"));

  if let Some(icon) = app.default_window_icon() {
    builder = builder.icon(icon.clone());
  }

  let app_handle = app.handle().clone();
  builder
    .on_menu_event(move |app, event| match event.id.as_ref() {
      "echo_tray_show" => bring_main_window_to_front(app),
      "echo_tray_quit" => app.exit(0),
      "echo_tray_messages" => {
        let _ = app.emit(
          "echo-desktop-tray",
          serde_json::json!({ "action": "open-messages" }),
        );
      }
      "echo_tray_toggle_alerts" => {
        let _ = app.emit(
          "echo-desktop-tray",
          serde_json::json!({ "action": "toggle-desktop-alerts" }),
        );
      }
      "echo_tray_notifications" => {
        let _ = app.emit(
          "echo-desktop-tray",
          serde_json::json!({ "action": "open-notification-settings" }),
        );
      }
      _ => {}
    })
    .on_tray_icon_event(move |_tray, event| {
      if let tauri::tray::TrayIconEvent::Click {
        button: tauri::tray::MouseButton::Left,
        button_state: tauri::tray::MouseButtonState::Up,
        ..
      } = event
      {
        bring_main_window_to_front(&app_handle);
      }
    })
    .build(app)?;
  Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn wire_close_to_tray(app: &tauri::App, prefs: &ShellPrefs) -> Result<(), String> {
  let Some(window) = app.get_webview_window("main") else {
    return Err("missing main window".into());
  };
  let app_h = app.handle().clone();
  let close_flag = prefs.close_to_tray.clone();
  window.on_window_event(move |ev| {
    if let WindowEvent::CloseRequested { api, .. } = ev {
      if close_flag.load(Ordering::Relaxed) {
        api.prevent_close();
        if let Some(w) = app_h.get_webview_window("main") {
          let _ = w.hide();
        }
      }
    }
  });
  Ok(())
}

#[tauri::command]
fn desktop_log_path(app: tauri::AppHandle) -> Result<String, String> {
  let path = resolve_log_file_path(&app)?;
  Ok(path.display().to_string())
}

fn build_frontend_log_line(mut payload: FrontendLogPayload) -> String {
  let mut truncated = false;
  if payload.message.chars().count() > MAX_FRONTEND_LOG_MESSAGE_CHARS {
    payload.message = payload
      .message
      .chars()
      .take(MAX_FRONTEND_LOG_MESSAGE_CHARS)
      .collect();
    truncated = true;
  }
  if let Some(ref d) = payload.details {
    if d.len() > MAX_FRONTEND_LOG_DETAILS_ITEMS {
      truncated = true;
    }
  }
  if let Some(details) = payload.details.take() {
    payload.details = Some(
      details
        .into_iter()
        .take(MAX_FRONTEND_LOG_DETAILS_ITEMS)
        .collect(),
    );
  }
  let mut line = serde_json::json!({
    "timestamp": payload.timestamp,
    "source": "frontend",
    "level": payload.level,
    "kind": payload.kind,
    "message": payload.message,
    "details": payload.details,
    "href": payload.href,
    "userAgent": payload.user_agent,
    "truncated": truncated,
  });
  let mut s = line.to_string();
  if s.len() > MAX_FRONTEND_LOG_LINE_BYTES {
    line = serde_json::json!({
      "timestamp": payload.timestamp,
      "source": "frontend",
      "level": payload.level,
      "kind": payload.kind,
      "message": "[frontend log truncated — payload exceeded line size cap]",
      "truncated": true,
    });
    s = line.to_string();
  }
  s
}

#[tauri::command]
fn log_frontend_event(
  app: tauri::AppHandle,
  payload: FrontendLogPayload,
) -> Result<(), String> {
  let s = build_frontend_log_line(payload);
  append_log_line(&app, &s)
}

#[tauri::command]
fn desktop_shell_bring_main_to_front(app: tauri::AppHandle) -> Result<(), String> {
  bring_main_window_to_front(&app);
  Ok(())
}

#[tauri::command]
fn desktop_shell_request_user_attention(
  app: tauri::AppHandle,
  critical: Option<bool>,
) -> Result<(), String> {
  #[cfg(any(target_os = "android", target_os = "ios"))]
  {
    let _ = (app, critical);
    return Ok(());
  }
  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  {
    let Some(w) = app.get_webview_window("main") else {
      return Err("missing main window".into());
    };
    let level = if critical == Some(true) {
      Some(UserAttentionType::Critical)
    } else {
      Some(UserAttentionType::Informational)
    };
    w.request_user_attention(level)
      .map_err(|e| format!("request_user_attention: {e}"))
  }
}

#[tauri::command]
fn desktop_shell_set_close_to_tray(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
  let prefs = app.state::<ShellPrefs>();
  prefs
    .close_to_tray
    .store(enabled, Ordering::Relaxed);
  Ok(())
}

#[tauri::command]
fn desktop_shell_get_close_to_tray(app: tauri::AppHandle) -> Result<bool, String> {
  let prefs = app.state::<ShellPrefs>();
  Ok(prefs.close_to_tray.load(Ordering::Relaxed))
}

#[tauri::command]
fn desktop_shell_set_unread_indicator(
  app: tauri::AppHandle,
  unread: bool,
) -> Result<(), String> {
  let Some(w) = app.get_webview_window("main") else {
    return Err("missing main window".into());
  };
  #[cfg(windows)]
  {
    use tauri::window::{ProgressBarState, ProgressBarStatus};
    let state = if unread {
      ProgressBarState {
        status: Some(ProgressBarStatus::Normal),
        progress: Some(100),
      }
    } else {
      ProgressBarState {
        status: Some(ProgressBarStatus::None),
        progress: None,
      }
    };
    w.set_progress_bar(state).map_err(|e| e.to_string())
  }
  #[cfg(all(not(windows), not(any(target_os = "android", target_os = "ios"))))]
  {
    if unread {
      w.set_badge_count(Some(1))
    } else {
      w.set_badge_count(None)
    }
    .map_err(|e| e.to_string())
  }
  #[cfg(any(target_os = "android", target_os = "ios"))]
  {
    let _ = (w, unread);
    Ok(())
  }
}

#[tauri::command]
fn desktop_shell_save_file(
  app: tauri::AppHandle,
  contents: Vec<u8>,
  default_path: Option<String>,
) -> Result<bool, String> {
  if contents.len() > MAX_DESKTOP_SAVE_BYTES {
    return Err(format!(
      "payload exceeds max of {} bytes",
      MAX_DESKTOP_SAVE_BYTES
    ));
  }
  let mut dialog = app.dialog().file();
  if let Some(raw_default_path) = default_path {
    let normalized = PathBuf::from(raw_default_path.trim());
    let normalized: PathBuf = normalized.components().collect();
    if normalized.is_file() || !normalized.exists() {
      if let (Some(parent), Some(file_name)) = (normalized.parent(), normalized.file_name()) {
        if parent.components().count() > 0 {
          dialog = dialog.set_directory(parent);
        }
        dialog = dialog.set_file_name(file_name.to_string_lossy());
      } else {
        dialog = dialog.set_directory(normalized);
      }
    } else {
      dialog = dialog.set_directory(normalized);
    }
  }
  let Some(file_path) = dialog.blocking_save_file() else {
    return Ok(false);
  };
  let p = file_path
    .into_path()
    .map_err(|_| "selected save path is not a local filesystem path".to_string())?;
  if !p.is_absolute() {
    return Err("save path must be absolute".into());
  }
  if p.as_os_str().is_empty() {
    return Err("save path is empty".into());
  }
  validate_desktop_save_path(&p)?;
  if let Some(parent) = p.parent() {
    if !parent.as_os_str().is_empty() {
      fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
  }
  fs::write(&p, contents).map_err(|e| e.to_string())?;
  Ok(true)
}

#[tauri::command]
fn desktop_shell_set_tray_menu_labels(
  app: tauri::AppHandle,
  labels: TrayMenuLabelsPayload,
) -> Result<(), String> {
  #[cfg(any(target_os = "android", target_os = "ios"))]
  {
    let _ = (app, labels);
    return Ok(());
  }
  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  {
    let menu = build_echo_tray_menu(&app, &labels)?;
    let id = TrayIconId::new("echo-main-tray");
    let Some(tray) = app.tray_by_id(&id) else {
      return Ok(());
    };
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    if let Some(tip) = labels.tooltip {
      desktop_shell_set_tray_tooltip(app, Some(tip))?;
    }
    Ok(())
  }
}

#[tauri::command]
fn desktop_shell_set_tray_tooltip(
  app: tauri::AppHandle,
  text: Option<String>,
) -> Result<(), String> {
  #[cfg(any(target_os = "android", target_os = "ios"))]
  {
    let _ = (app, text);
    return Ok(());
  }
  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  {
    let id = TrayIconId::new("echo-main-tray");
    let Some(tray) = app.tray_by_id(&id) else {
      return Ok(());
    };
    if let Some(ref s) = text {
      let t = s.trim();
      if !t.is_empty() {
        let tip: String = t.chars().take(MAX_TRAY_TOOLTIP_CHARS).collect();
        return tray
          .set_tooltip(Some(tip.as_str()))
          .map_err(|e| e.to_string());
      }
    }
    tray
      .set_tooltip(None::<&str>)
      .map_err(|e| e.to_string())
  }
}

#[tauri::command]
fn desktop_audio_init(_app: tauri::AppHandle) -> Result<(), String> {
  Ok(())
}

#[tauri::command]
fn desktop_audio_list_output_devices(_app: tauri::AppHandle) -> Result<Vec<DesktopAudioDevice>, String> {
  Ok(desktop_audio::list_output_devices())
}

#[tauri::command]
fn desktop_audio_list_input_devices(_app: tauri::AppHandle) -> Result<Vec<DesktopAudioDevice>, String> {
  Ok(desktop_audio::list_input_devices())
}

#[tauri::command]
fn desktop_audio_set_output_device(
  app: tauri::AppHandle,
  device_id: Option<String>,
) -> Result<(), String> {
  let state = app.state::<DesktopAudioState>();
  state.set_output_device_id(device_id);
  Ok(())
}

#[tauri::command]
fn desktop_audio_set_input_device(
  app: tauri::AppHandle,
  device_id: Option<String>,
) -> Result<(), String> {
  let state = app.state::<DesktopAudioState>();
  state.set_input_device_id(device_id);
  Ok(())
}

#[tauri::command]
fn desktop_audio_get_selected_devices(
  app: tauri::AppHandle,
) -> Result<Value, String> {
  let state = app.state::<DesktopAudioState>();
  Ok(serde_json::json!({
    "outputDeviceId": state.get_output_device_id(),
    "inputDeviceId": state.get_input_device_id(),
  }))
}

#[tauri::command]
fn desktop_audio_set_output_volume(
  app: tauri::AppHandle,
  volume: f32,
) -> Result<(), String> {
  let state = app.state::<DesktopAudioState>();
  state.set_output_volume(volume);
  Ok(())
}

#[tauri::command]
fn desktop_audio_play_ringtone(
  app: tauri::AppHandle,
  audio_bytes: Vec<u8>,
  looped: bool,
  volume: Option<f32>,
) -> Result<(), String> {
  const MAX_RINGTONE_BYTES: usize = 10 * 1024 * 1024;
  if audio_bytes.len() > MAX_RINGTONE_BYTES {
    return Err(format!("audio buffer too large: {} bytes (max {})", audio_bytes.len(), MAX_RINGTONE_BYTES));
  }
  let state = app.state::<DesktopAudioState>();
  state.play_ringtone(audio_bytes, looped, volume)
}

#[tauri::command]
fn desktop_audio_stop_ringtone(app: tauri::AppHandle) -> Result<(), String> {
  let state = app.state::<DesktopAudioState>();
  state.stop_ringtone();
  Ok(())
}

fn append_startup_log(app: &tauri::AppHandle) {
  let startup_line = serde_json::json!({
    "timestampUnixMs": now_unix_ms(),
    "source": "desktop",
    "level": "info",
    "kind": "startup",
    "message": "Echo desktop boot",
    "version": env!("CARGO_PKG_VERSION"),
  });
  let _ = append_log_line(app, &startup_line.to_string());
}

fn setup_app_shell(app: &tauri::App) {
  append_startup_log(app.handle());

  // iOS: show the native splash/login overlay immediately so the WebView's
  // remote load happens behind it (no white flash). Configures the native auth
  // bridge with the prod API base. `ECHO_IOS_API_BASE` overrides at build time.
  #[cfg(target_os = "ios")]
  {
    let _ = app;
    const DEFAULT_IOS_API_BASE: &str = "https://chat-echo.com";
    let api_base = option_env!("ECHO_IOS_API_BASE").unwrap_or(DEFAULT_IOS_API_BASE);
    ios_auth::native_boot(api_base);
  }

  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  {
    let prefs = app.state::<ShellPrefs>();
    if let Err(e) = setup_desktop_tray(app) {
      let line = serde_json::json!({
        "timestampUnixMs": now_unix_ms(),
        "source": "desktop",
        "level": "error",
        "kind": "tray_init",
        "message": "Failed to create system tray",
        "error": e.to_string(),
      });
      let _ = append_log_line(app.handle(), &line.to_string());
    }
    if let Err(e) = wire_close_to_tray(app, &*prefs) {
      let line = serde_json::json!({
        "timestampUnixMs": now_unix_ms(),
        "source": "desktop",
        "level": "error",
        "kind": "close_to_tray",
        "message": "Failed to wire close-to-tray handler",
        "error": e,
      });
      let _ = append_log_line(app.handle(), &line.to_string());
    }

    #[cfg(target_os = "macos")]
    if let Some(main) = app.get_webview_window("main") {
      macos_webview_shortcuts::install_third_party_shortcut_passthrough(&main);
    }
  }

  #[cfg(any(windows, target_os = "linux"))]
  {
    let register_result = app.deep_link().register_all();
    let line = match register_result {
      Ok(()) => serde_json::json!({
        "timestampUnixMs": now_unix_ms(),
        "source": "desktop",
        "level": "info",
        "kind": "deep_link_register",
        "message": "Registered desktop deep-link schemes for current executable",
      }),
      Err(err) => serde_json::json!({
        "timestampUnixMs": now_unix_ms(),
        "source": "desktop",
        "level": "error",
        "kind": "deep_link_register",
        "message": "Failed to register desktop deep-link schemes",
        "error": err.to_string(),
      }),
    };
    let _ = append_log_line(app.handle(), &line.to_string());
  }
}

/// rustls 0.23+ aborts unless a process-wide crypto provider is installed before reqwest
/// builds a TLS client (Tauri uses reqwest for the custom asset protocol on mobile).
fn ensure_rustls_crypto_provider() {
  let _ = rustls::crypto::ring::default_provider().install_default();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  ensure_rustls_crypto_provider();
  log_argv_boot();

  let mut builder = tauri::Builder::default();

  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      let safe_argv: Vec<String> = argv.iter().map(|a| strip_url_sensitive(a)).collect();
      let line = serde_json::json!({
        "timestampUnixMs": now_unix_ms(),
        "source": "desktop",
        "level": "info",
        "kind": "single_instance",
        "message": "Echo desktop received argv on secondary launch",
        "argv": safe_argv,
      });
      let _ = append_log_line(app, &line.to_string());
      #[cfg(debug_assertions)]
      eprintln!("[echo-desktop] single-instance argv: {safe_argv:?}");

      bring_main_window_to_front(app);
    }));
  }

  builder = builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_dialog::init());

  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  {
    builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
  }

  builder = builder
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_notification::init());

  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  {
    builder = builder.plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      None,
    ));
  }

  #[cfg(not(any(target_os = "android", target_os = "ios")))]
  {
    // Do not persist decorations: macOS uses native traffic lights (Overlay titlebar)
    // while Windows/Linux use a frameless window + custom titlebar. Restoring an old
    // `decorated: false` snapshot would hide macOS traffic lights after config changes.
    let window_state_flags = tauri_plugin_window_state::StateFlags::all()
      & !tauri_plugin_window_state::StateFlags::DECORATIONS;
    builder = builder
      .plugin(tauri_plugin_process::init())
      .plugin(tauri_plugin_updater::Builder::new().build())
      .plugin(
        tauri_plugin_window_state::Builder::default()
          .with_state_flags(window_state_flags)
          .build(),
      );
  }

  builder
    .manage(ShellPrefs::new_with_platform_defaults())
    .manage(DesktopAudioState::default())
    .manage(ios_auth::IosAuthState::default())
    .invoke_handler(tauri::generate_handler![
      desktop_log_path,
      log_frontend_event,
      desktop_shell_bring_main_to_front,
      desktop_shell_request_user_attention,
      desktop_shell_set_close_to_tray,
      desktop_shell_get_close_to_tray,
      desktop_shell_set_tray_tooltip,
      desktop_shell_set_tray_menu_labels,
      desktop_shell_set_unread_indicator,
      desktop_shell_save_file,
      desktop_audio_init,
      desktop_audio_list_output_devices,
      desktop_audio_list_input_devices,
      desktop_audio_set_output_device,
      desktop_audio_set_input_device,
      desktop_audio_get_selected_devices,
      desktop_audio_set_output_volume,
      desktop_audio_play_ringtone,
      desktop_audio_stop_ringtone,
      ios_auth::ios_auth_boot_check,
      ios_auth::ios_auth_store_session,
      ios_auth::ios_auth_update_session,
      ios_auth::ios_auth_clear_session,
      ios_auth::ios_auth_get_session,
      ios_auth::ios_auth_session_restored,
      ios_auth::ios_auth_session_restore_failed,
      ios_auth::ios_auth_should_show_login,
      ios_auth::ios_auth_mark_verified,
      ios_auth::ios_auth_store_refresh_token,
      ios_auth::ios_auth_get_refresh_token,
      ios_auth::ios_auth_clear_refresh_token,
      ios_native::ios_native_haptic,
      ios_native::ios_is_simulator,
      ios_features::ios_sign_in_with_apple,
      ios_features::ios_register_push_notifications,
    ])
    .setup(|app| {
      setup_app_shell(app);
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Echo desktop");
}
