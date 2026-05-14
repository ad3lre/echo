/**
 * Desktop (Tauri) helpers: external URLs open in the system browser.
 * Discord sign-in can use the system browser plus a one-time handoff back into `echo://`
 * (see `oauth-desktop-bridge.html` and `/auth/desktop/redeem-handoff`).
 *
 * Shell integration (window, tray, notifications, autostart, updater) is exposed here
 * so product code does not import Tauri plugins ad hoc.
 */

import { invoke } from '@tauri-apps/api/core';

import { IS_ECHO_TAURI_SHELL } from '@/config';

/** Tauri desktop only (not Android WebView). */
export function isDesktop(): boolean {
  return import.meta.env.VITE_ECHO_DESKTOP === '1';
}

/** Any Tauri shell (Windows/macOS/Linux desktop or Android). */
export function isTauriShell(): boolean {
  return IS_ECHO_TAURI_SHELL;
}

export type DesktopAudioDevice = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type DesktopAudioSelectedDevices = {
  outputDeviceId: string | null;
  inputDeviceId: string | null;
};

export function normalizeExternalUrlForOpen(
  raw: string,
  baseUrl = typeof window !== 'undefined' ? window.location.href : undefined,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed, baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url.toString();
}

function isSameOriginAsApp(url: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(url).origin === new URL(window.location.href).origin;
  } catch {
    return false;
  }
}

/** Open a URL in the default browser when running under Tauri; otherwise `window.open`. */
export async function openExternal(url: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const safeUrl = normalizeExternalUrlForOpen(url);
  if (!safeUrl) return;
  if (!isTauriShell()) {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(safeUrl);
    return;
  } catch (error) {
    console.error(
      '[echo-desktop] openExternal failed; using safer fallback than in-webview assign',
      {
        url: safeUrl,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : String(error),
      },
    );
  }
  // Avoid loading arbitrary https origins inside the WebView (OAuth / session model).
  if (isSameOriginAsApp(safeUrl)) {
    window.location.assign(safeUrl);
    return;
  }
  window.open(safeUrl, '_blank', 'noopener,noreferrer');
}

/** Web: navigate to IdP in this browser so HttpOnly session cookies stay in one jar. */
export function startOAuthFlow(authorizeUrl: string): void {
  window.location.assign(authorizeUrl);
}

export async function bringMainWindowToForeground(): Promise<void> {
  if (!isTauriShell()) return;
  try {
    await invoke('desktop_shell_bring_main_to_front');
  } catch (error) {
    console.warn('[echo-desktop] bringMainWindowToForeground failed', error);
  }
}

export async function requestDesktopUserAttention(
  critical?: boolean,
): Promise<void> {
  if (!isTauriShell()) return;
  try {
    await invoke('desktop_shell_request_user_attention', {
      critical: critical === true,
    });
  } catch (error) {
    console.warn('[echo-desktop] requestDesktopUserAttention failed', error);
  }
}

export async function getDesktopCloseToTray(): Promise<boolean> {
  if (!isTauriShell()) return false;
  return invoke<boolean>('desktop_shell_get_close_to_tray');
}

export async function setDesktopCloseToTray(enabled: boolean): Promise<void> {
  if (!isTauriShell()) return;
  await invoke('desktop_shell_set_close_to_tray', { enabled });
}

export async function sendDesktopNativeNotificationIfPermitted(options: {
  title: string;
  body?: string;
}): Promise<void> {
  if (!isTauriShell()) return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import('@tauri-apps/plugin-notification');
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === 'granted';
    }
    if (!granted) return;
    await sendNotification({
      title: options.title,
      body: options.body,
    });
  } catch (error) {
    console.warn('[echo-desktop] native notification failed', error);
  }
}

export async function getDesktopLaunchAtLogin(): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    const { isEnabled } = await import('@tauri-apps/plugin-autostart');
    return await isEnabled();
  } catch {
    return false;
  }
}

export async function setDesktopLaunchAtLogin(enabled: boolean): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { enable, disable } = await import('@tauri-apps/plugin-autostart');
    if (enabled) await enable();
    else await disable();
  } catch (error) {
    console.warn('[echo-desktop] setDesktopLaunchAtLogin failed', error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export type DesktopUpdateCheckResult =
  | { status: 'none' }
  | { status: 'available'; version: string }
  | { status: 'error'; message: string };

export async function checkDesktopAppUpdate(): Promise<DesktopUpdateCheckResult> {
  if (!isDesktop()) return { status: 'none' };
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update) {
      return { status: 'available', version: update.version };
    }
    return { status: 'none' };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? 'unknown');
    return { status: 'error', message };
  }
}

/**
 * Downloads the pending update (if any) and restarts the app.
 * Call only after {@link checkDesktopAppUpdate} returned `available` or user confirmed.
 */
export async function downloadAndRelaunchDesktopUpdate(): Promise<void> {
  if (!isDesktop()) return;
  const { check } = await import('@tauri-apps/plugin-updater');
  const { relaunch } = await import('@tauri-apps/plugin-process');
  const update = await check();
  if (!update) return;
  await update.downloadAndInstall();
  await relaunch();
}

// ---------------------------------------------------------------------------
// Window chrome helpers (custom titlebar)
// ---------------------------------------------------------------------------

/** Start an OS-level window drag from a mousedown event on the drag region. */
export async function startDesktopWindowDrag(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  } catch {
    /* no-op if window is gone */
  }
}

export async function minimizeDesktopWindow(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  } catch {
    /* ignore */
  }
}

export async function toggleMaximizeDesktopWindow(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().toggleMaximize();
  } catch {
    /* ignore */
  }
}

export async function closeDesktopWindow(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  } catch {
    /* ignore */
  }
}

export async function isDesktopWindowMaximized(): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return await getCurrentWindow().isMaximized();
  } catch {
    return false;
  }
}

/** Updates the system tray tooltip when a tray icon exists (no-op on failure). */
export async function setDesktopTrayTooltip(
  text: string | null,
): Promise<void> {
  if (!isDesktop()) return;
  try {
    await invoke('desktop_shell_set_tray_tooltip', {
      text: text === null || text === '' ? null : text,
    });
  } catch {
    /* tray may be unavailable on some Linux setups */
  }
}

/** Windows: taskbar progress bar as unread hint; other desktops: numeric badge when supported. */
export async function setDesktopUnreadTaskbarIndicator(
  unread: boolean,
): Promise<void> {
  if (!isTauriShell()) return;
  try {
    await invoke('desktop_shell_set_unread_indicator', { unread });
  } catch (error) {
    console.warn(
      '[echo-desktop] setDesktopUnreadTaskbarIndicator failed',
      error,
    );
  }
}

/**
 * Native save dialog + write bytes via the shell (user-picked absolute path).
 * Returns false if the user cancels or desktop APIs fail.
 */
export async function saveDesktopBytesWithNativeDialog(
  data: Uint8Array,
  options?: { defaultPath?: string },
): Promise<boolean> {
  if (!isTauriShell()) return false;
  try {
    const saved = await invoke<boolean>('desktop_shell_save_file', {
      contents: Array.from(data),
      defaultPath: options?.defaultPath,
    });
    return saved === true;
  } catch (error) {
    console.warn(
      '[echo-desktop] saveDesktopBytesWithNativeDialog failed',
      error,
    );
    return false;
  }
}

export async function initDesktopNativeAudio(): Promise<void> {
  if (!isDesktop()) return;
  await invoke('desktop_audio_init');
}

export async function listDesktopAudioOutputDevices(): Promise<
  DesktopAudioDevice[]
> {
  if (!isDesktop()) return [];
  try {
    return await invoke<DesktopAudioDevice[]>(
      'desktop_audio_list_output_devices',
    );
  } catch (error) {
    console.warn('[echo-desktop] listDesktopAudioOutputDevices failed', error);
    return [];
  }
}

export async function listDesktopAudioInputDevices(): Promise<
  DesktopAudioDevice[]
> {
  if (!isDesktop()) return [];
  try {
    return await invoke<DesktopAudioDevice[]>(
      'desktop_audio_list_input_devices',
    );
  } catch (error) {
    console.warn('[echo-desktop] listDesktopAudioInputDevices failed', error);
    return [];
  }
}

export async function setDesktopAudioOutputDevice(
  deviceId: string | null,
): Promise<void> {
  if (!isDesktop()) return;
  await invoke('desktop_audio_set_output_device', { deviceId });
}

export async function setDesktopAudioInputDevice(
  deviceId: string | null,
): Promise<void> {
  if (!isDesktop()) return;
  await invoke('desktop_audio_set_input_device', { deviceId });
}

export async function getDesktopAudioSelectedDevices(): Promise<DesktopAudioSelectedDevices> {
  if (!isDesktop()) {
    return { outputDeviceId: null, inputDeviceId: null };
  }
  try {
    return await invoke<DesktopAudioSelectedDevices>(
      'desktop_audio_get_selected_devices',
    );
  } catch (error) {
    console.warn('[echo-desktop] getDesktopAudioSelectedDevices failed', error);
    return { outputDeviceId: null, inputDeviceId: null };
  }
}

export async function setDesktopAudioOutputVolume(
  volume01: number,
): Promise<void> {
  if (!isDesktop()) return;
  await invoke('desktop_audio_set_output_volume', {
    volume: Math.max(0, Math.min(6, volume01)),
  });
}

export async function playDesktopNativeRingtone(options: {
  audioBytes: Uint8Array;
  looped?: boolean;
  volume01?: number;
}): Promise<void> {
  if (!isDesktop()) return;
  await invoke('desktop_audio_play_ringtone', {
    audioBytes: Array.from(options.audioBytes),
    looped: options.looped ?? true,
    volume: options.volume01 ?? 1,
  });
}

export async function stopDesktopNativeRingtone(): Promise<void> {
  if (!isDesktop()) return;
  await invoke('desktop_audio_stop_ringtone');
}
