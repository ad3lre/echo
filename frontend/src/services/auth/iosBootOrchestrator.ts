/**
 * iOS boot orchestrator.
 *
 * Runs during app startup (called from main.ts) to coordinate the native
 * login shell with the Vue app lifecycle. On non-iOS builds this is a no-op.
 *
 * Flow:
 *   1. Check Keychain for stored session memory (instant, no network).
 *   2. If stored session exists → splash shows "Opening Echo…", webview loads
 *      behind the overlay, Vue calls restoreSessionFromApi() → on success
 *      the native overlay dismisses.
 *   3. If no stored session → native login screen is shown. User authenticates
 *      via the native UI (email/password, OAuth, guest). On success the session
 *      is stored and the overlay dismisses.
 */

import {
  iosAuthBootCheck,
  iosAuthSessionRestored,
  iosAuthMarkVerified,
} from './iosNativeAuth';
import type { BootDecision } from './iosNativeAuth';

let bootResult: BootDecision | null = null;

/**
 * Run the iOS boot check. Call this early in main.ts, before Vue mount.
 * Returns the boot decision so the app can skip showing the Vue login modal
 * when the native overlay is already handling auth.
 */
export async function runIosBootCheck(): Promise<BootDecision | null> {
  bootResult = await iosAuthBootCheck();
  return bootResult;
}

/**
 * Whether the native login overlay is handling authentication.
 * When true, the Vue app should not show its own login modal.
 */
export function isNativeLoginActive(): boolean {
  return bootResult?.action === 'login';
}

/**
 * Whether there's a stored session that should be restored.
 * When true, the Vue app should attempt restoreSessionFromApi().
 */
export function hasStoredSessionToRestore(): boolean {
  return bootResult?.action === 'restore' && bootResult.hasStoredSession;
}

/**
 * Get the stored session memory (for personalizing the splash).
 */
export function getStoredSession(): BootDecision['session'] {
  return bootResult?.session ?? null;
}

/**
 * Called after the Vue app successfully authenticates (from any path).
 * Ensures the native overlay is dismissed.
 */
export async function notifyAppAuthenticated(): Promise<void> {
  await iosAuthSessionRestored();
  bootResult = null;
}

/**
 * Periodic session verification heartbeat.
 * Call this on a timer while the app is active.
 */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function startSessionHeartbeat(): void {
  if (heartbeatTimer !== null) return;
  heartbeatTimer = setInterval(() => {
    void iosAuthMarkVerified();
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopSessionHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
