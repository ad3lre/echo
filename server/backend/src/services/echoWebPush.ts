import type pg from 'pg';
import webpush from 'web-push';
import { config } from '../config';
import {
  deleteEchoWebPushSubscriptionByEndpoint,
  listEchoWebPushSubscriptionsForUser,
} from '../domain/echoStore';

export type EchoWebPushPayload = {
  title: string;
  body: string;
  /** Coalescing tag (e.g. channel id) so repeat pings replace, not stack. */
  tag?: string;
  /** Deep link opened on notification click. */
  url?: string;
  icon?: string;
  /** Opaque routing hints for the SW / client. */
  channelId?: string;
  authorId?: string;
};

let vapidConfigured: boolean | null = null;

/** True when VAPID keys are present; configures web-push once. */
export function isEchoWebPushConfigured(): boolean {
  if (vapidConfigured !== null) return vapidConfigured;
  const pub = config.webPushVapidPublicKey;
  const priv = config.webPushVapidPrivateKey;
  if (!pub || !priv) {
    vapidConfigured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(config.webPushVapidSubject, pub, priv);
    vapidConfigured = true;
  } catch {
    vapidConfigured = false;
  }
  return vapidConfigured;
}

/** Public key clients use to create a PushSubscription (null when disabled). */
export function echoWebPushPublicKey(): string | null {
  return isEchoWebPushConfigured() ? config.webPushVapidPublicKey : null;
}

/**
 * Best-effort fan-out of a push payload to all of a user's subscriptions.
 * Dead endpoints (404/410) are pruned. Never throws; returns how many sends
 * succeeded so callers can log/metric without try/catch.
 */
export async function sendEchoWebPushToUser(
  pool: pg.Pool,
  userId: string,
  payload: EchoWebPushPayload,
): Promise<number> {
  if (!isEchoWebPushConfigured()) return 0;
  let subs;
  try {
    subs = await listEchoWebPushSubscriptionsForUser(pool, userId);
  } catch {
    return 0;
  }
  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 600 },
        );
        delivered += 1;
      } catch (e) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await deleteEchoWebPushSubscriptionByEndpoint(
            pool,
            sub.endpoint,
          ).catch(() => {});
        }
      }
    }),
  );

  return delivered;
}
