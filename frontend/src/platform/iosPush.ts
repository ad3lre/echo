import { invoke } from '@tauri-apps/api/core';
import { isIosTauriShell } from '@/platform/iosNativeFeedback';
import { ECHO_IOS_PUSH_ENABLED } from '@/config/echoIosNativeFeatures';

/**
 * Requests notification permission and registers for APNs via the Rust command
 * `ios_register_push_notifications`, returning the hex APNs device token to send
 * to the backend (`/auth/push/register`, see docs/ios-appstore-compliance.md #10).
 *
 * Returns null (no-op) off the iOS shell or when the feature flag is off, and
 * swallows errors to null so a denied permission can never break app boot.
 */
export async function registerIosPushNotifications(): Promise<string | null> {
  if (!ECHO_IOS_PUSH_ENABLED || !isIosTauriShell()) return null;
  try {
    const token = await invoke<string | null>(
      'ios_register_push_notifications',
    );
    return typeof token === 'string' && token.length ? token : null;
  } catch {
    return null;
  }
}
