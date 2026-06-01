import {
  fetchEchoWebPushPublicKey,
  subscribeEchoWebPush,
  unsubscribeEchoWebPush,
} from '@/api/echo/attention';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

function extractKeys(
  sub: PushSubscription,
): { p256dh: string; auth: string } | null {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) return null;
  return { p256dh, auth };
}

/**
 * Ensure a push subscription exists for this browser and is registered with the
 * backend. No-ops (returns false) when unsupported, permission isn't granted,
 * or push is disabled server-side. Safe to call repeatedly.
 */
export async function ensureEchoWebPushSubscription(
  token: string,
): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  const t = token.trim();
  if (!t) return false;

  try {
    const { publicKey, enabled } = await fetchEchoWebPushPublicKey(t);
    if (!enabled || !publicKey) return false;

    const reg = await readyRegistration();
    if (!reg) return false;

    const appServerKey = urlBase64ToUint8Array(publicKey);
    let sub = await reg.pushManager.getSubscription();

    // Re-subscribe if the server's VAPID key rotated (key mismatch).
    if (sub) {
      const existingKey = new Uint8Array(
        sub.options.applicationServerKey ?? new ArrayBuffer(0),
      );
      const matches =
        existingKey.length === appServerKey.length &&
        existingKey.every((b, i) => b === appServerKey[i]);
      if (!matches) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey as BufferSource,
      });
    }

    const keys = extractKeys(sub);
    if (!keys) return false;
    await subscribeEchoWebPush(t, { endpoint: sub.endpoint, keys });
    return true;
  } catch (e) {
    reportPrimaryFlowFailure(
      'ensureEchoWebPushSubscription',
      e,
      {},
      { showBanner: false },
    );
    return false;
  }
}

/** Remove this browser's push subscription locally and on the server. */
export async function disableEchoWebPushSubscription(
  token: string,
): Promise<void> {
  if (!isWebPushSupported()) return;
  try {
    const reg = await readyRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    const t = token.trim();
    if (t && endpoint) await unsubscribeEchoWebPush(t, endpoint);
  } catch (e) {
    reportPrimaryFlowFailure(
      'disableEchoWebPushSubscription',
      e,
      {},
      { showBanner: false },
    );
  }
}
