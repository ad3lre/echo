/**
 * iOS native login shell integration.
 *
 * On iOS (Tauri), the app shows a native splash/login overlay before the webview
 * is visible. This module bridges the frontend auth flow to the Rust-side Keychain
 * session memory and native overlay lifecycle.
 *
 * Non-iOS builds: all functions are safe no-ops.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import type { AuthUserPublic } from '@/api/authClient';

const IS_IOS_BUILD = import.meta.env.VITE_ECHO_IOS === '1';

function isIosNativeAuth(): boolean {
  return IS_IOS_BUILD && isTauri();
}

// ── Types matching Rust structs ──

export type StoredSessionMemory = {
  userId: string | null;
  displayName: string | null;
  username: string | null;
  pfp: string | null;
  isGuest: boolean | null;
  lastVerifiedAt: number | null;
  apiBase: string | null;
};

export type BootDecision = {
  hasStoredSession: boolean;
  session: StoredSessionMemory | null;
  /** "restore" = try session restore, "login" = show native login. */
  action: 'restore' | 'login';
};

// ── Boot check ──

/**
 * Called at app startup (before Vue mounts) to determine the boot path.
 * Returns the stored session memory if available, or signals that
 * the native login screen should be shown.
 */
export async function iosAuthBootCheck(): Promise<BootDecision | null> {
  if (!isIosNativeAuth()) return null;
  try {
    return await invoke<BootDecision>('ios_auth_boot_check');
  } catch (e) {
    console.error('[echo-ios] boot check failed:', e);
    return null;
  }
}

// ── Session memory ──

/**
 * Store session data in iOS Keychain after successful auth.
 * Called from the auth session store's `setSession()` path.
 */
export async function iosAuthStoreSession(
  user: AuthUserPublic,
  apiBase?: string,
): Promise<void> {
  if (!isIosNativeAuth()) return;
  try {
    await invoke('ios_auth_store_session', {
      userId: user.id,
      displayName: user.displayName,
      username: user.username,
      pfp: user.pfp || null,
      isGuest: user.isGuest ?? false,
      apiBase: apiBase ?? null,
    });
  } catch (e) {
    console.error('[echo-ios] store session failed:', e);
  }
}

/**
 * Update stored session memory (e.g. after profile edit).
 */
export async function iosAuthUpdateSession(
  updates: Partial<{
    displayName: string;
    username: string;
    pfp: string;
    isGuest: boolean;
  }>,
): Promise<void> {
  if (!isIosNativeAuth()) return;
  try {
    await invoke('ios_auth_update_session', {
      displayName: updates.displayName ?? null,
      username: updates.username ?? null,
      pfp: updates.pfp ?? null,
      isGuest: updates.isGuest ?? null,
    });
  } catch (e) {
    console.error('[echo-ios] update session failed:', e);
  }
}

/**
 * Clear stored session from Keychain (logout).
 */
export async function iosAuthClearSession(): Promise<void> {
  if (!isIosNativeAuth()) return;
  try {
    await invoke('ios_auth_clear_session');
  } catch (e) {
    console.error('[echo-ios] clear session failed:', e);
  }
}

/**
 * Read stored session without side effects.
 */
export async function iosAuthGetSession(): Promise<StoredSessionMemory | null> {
  if (!isIosNativeAuth()) return null;
  try {
    return await invoke<StoredSessionMemory | null>('ios_auth_get_session');
  } catch (e) {
    console.error('[echo-ios] get session failed:', e);
    return null;
  }
}

// ── Overlay lifecycle ──

/**
 * Signal that session restoration succeeded; dismiss the native overlay.
 * Called after `restoreSessionFromApi()` returns a valid user.
 */
export async function iosAuthSessionRestored(): Promise<void> {
  if (!isIosNativeAuth()) return;
  try {
    await invoke('ios_auth_session_restored');
  } catch (e) {
    console.error('[echo-ios] session restored signal failed:', e);
  }
}

/**
 * Signal that session restoration failed; the native login screen should appear.
 * Called when `restoreSessionFromApi()` fails (401, network error, etc.).
 */
export async function iosAuthSessionRestoreFailed(): Promise<void> {
  if (!isIosNativeAuth()) return;
  try {
    await invoke('ios_auth_session_restore_failed');
  } catch (e) {
    console.error('[echo-ios] session restore failed signal failed:', e);
  }
}

/**
 * Check if the native login overlay should currently be visible.
 */
export async function iosAuthShouldShowLogin(): Promise<boolean> {
  if (!isIosNativeAuth()) return false;
  try {
    return await invoke<boolean>('ios_auth_should_show_login');
  } catch {
    return false;
  }
}

/**
 * Update the session verification timestamp (heartbeat).
 * Called periodically while the app is active and authenticated.
 */
export async function iosAuthMarkVerified(): Promise<void> {
  if (!isIosNativeAuth()) return;
  try {
    await invoke('ios_auth_mark_verified');
  } catch {
    // Swallow — non-critical.
  }
}
