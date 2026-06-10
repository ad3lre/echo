import { authRegisterIosPushToken } from '@/api/authClient';
import { registerIosPushNotifications } from '@/platform/iosPush';

/**
 * Requests the native APNs device token (when enabled) and registers it with
 * the backend. Best-effort: never throws.
 */
export async function syncIosPushAfterAuth(): Promise<void> {
  try {
    const token = await registerIosPushNotifications();
    if (!token) return;
    await authRegisterIosPushToken({ deviceToken: token });
  } catch {
    /* permission denied / simulator / backend unavailable */
  }
}
