/**
 * External URL / OAuth helpers for the web SPA.
 *
 * Historically this module also bridged the Tauri desktop shell. That shell is
 * gone; native clients live under `clients/apple/` (and future native apps). Keep this
 * filename for stable import paths used across chat/settings.
 */

import { ensureExternalLinkSafetyAcknowledged } from '@/features/layout/composables/shell/externalLinkSafety';

/** Always false — Tauri desktop shell removed; web SPA only. */
export function isDesktop(): boolean {
  return false;
}

/** Always false — Tauri shells removed. */
export function isTauriShell(): boolean {
  return false;
}

/** Always false — no macOS Tauri chrome. */
export function isMacDesktop(): boolean {
  return false;
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

export type OpenExternalOptions = {
  /** Skip the per-site external link confirmation (OAuth, tests, etc.). */
  skipSafetyPrompt?: boolean;
};

/** Open a URL in a new browser tab. */
export async function openExternal(
  url: string,
  options?: OpenExternalOptions,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const safeUrl = normalizeExternalUrlForOpen(url);
  if (!safeUrl) return;
  if (!options?.skipSafetyPrompt) {
    const ok = await ensureExternalLinkSafetyAcknowledged(safeUrl);
    if (!ok) return;
  }
  window.open(safeUrl, '_blank', 'noopener,noreferrer');
}

/** Navigate to the IdP in this browser so HttpOnly session cookies stay in one jar. */
export function startOAuthFlow(authorizeUrl: string): void {
  window.location.assign(authorizeUrl);
}

// --- Former Tauri shell APIs (no-ops for web) ---

export async function bringMainWindowToForeground(): Promise<void> {}
export async function requestDesktopUserAttention(
  _critical?: boolean,
): Promise<void> {}
export async function getDesktopCloseToTray(): Promise<boolean> {
  return false;
}
export async function setDesktopCloseToTray(_enabled: boolean): Promise<void> {}
export async function sendDesktopNativeNotificationIfPermitted(_options: {
  title: string;
  body?: string;
}): Promise<void> {}
export async function getDesktopLaunchAtLogin(): Promise<boolean> {
  return false;
}
export async function setDesktopLaunchAtLogin(
  _enabled: boolean,
): Promise<void> {}

export type DesktopUpdateCheckResult =
  | { status: 'none' }
  | { status: 'available'; version: string }
  | { status: 'error'; message: string };

export async function checkDesktopAppUpdate(): Promise<DesktopUpdateCheckResult> {
  return { status: 'none' };
}
export async function downloadAndRelaunchDesktopUpdate(): Promise<void> {}
export async function startDesktopWindowDrag(): Promise<void> {}
export async function minimizeDesktopWindow(): Promise<void> {}
export async function toggleMaximizeDesktopWindow(): Promise<void> {}
export async function closeDesktopWindow(): Promise<void> {}
export async function isDesktopWindowMaximized(): Promise<boolean> {
  return false;
}
export async function setDesktopTrayTooltip(
  _text: string | null,
): Promise<void> {}
export async function setDesktopUnreadTaskbarIndicator(
  _unread: boolean,
): Promise<void> {}
export async function saveDesktopBytesWithNativeDialog(
  _data: Uint8Array,
  _options?: { defaultPath?: string },
): Promise<boolean> {
  return false;
}
export async function initDesktopNativeAudio(): Promise<void> {}
export async function listDesktopAudioOutputDevices(): Promise<
  DesktopAudioDevice[]
> {
  return [];
}
export async function listDesktopAudioInputDevices(): Promise<
  DesktopAudioDevice[]
> {
  return [];
}
export async function setDesktopAudioOutputDevice(
  _deviceId: string | null,
): Promise<void> {}
export async function setDesktopAudioInputDevice(
  _deviceId: string | null,
): Promise<void> {}
export async function getDesktopAudioSelectedDevices(): Promise<DesktopAudioSelectedDevices> {
  return { outputDeviceId: null, inputDeviceId: null };
}
export async function setDesktopAudioOutputVolume(
  _volume01: number,
): Promise<void> {}
export async function playDesktopNativeRingtone(_options: {
  audioBytes: Uint8Array;
  looped?: boolean;
  volume01?: number;
}): Promise<void> {}
export async function stopDesktopNativeRingtone(): Promise<void> {}
