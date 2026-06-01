import type {
  EchoAttentionSnapshot,
  EchoChannelNotificationOverride,
  EchoChannelNotificationOverridesResponse,
  EchoMentionNotificationRow,
  EchoMentionNotificationsResponse,
  EchoServerNotificationLevel,
} from '@shared/types';
import { echoFetch, trimEchoPathSegment } from './transport';

export async function fetchEchoAttentionSummary(
  token: string,
): Promise<EchoAttentionSnapshot> {
  return echoFetch(token, '/attention/summary');
}

/** Server-authoritative, hydrated mention inbox rows (newest first). */
export async function fetchEchoMentionNotifications(
  token: string,
  limit?: number,
): Promise<EchoMentionNotificationRow[]> {
  const query =
    typeof limit === 'number' && Number.isFinite(limit)
      ? `?limit=${encodeURIComponent(String(Math.trunc(limit)))}`
      : '';
  const res = await echoFetch<EchoMentionNotificationsResponse>(
    token,
    `/attention/mentions${query}`,
  );
  return Array.isArray(res?.rows) ? res.rows : [];
}

/** Cross-device personal notification settings blob (or null if never saved). */
export async function fetchEchoPersonalNotificationPreferences(
  token: string,
): Promise<Record<string, unknown> | null> {
  const res = await echoFetch<{ settings?: Record<string, unknown> | null }>(
    token,
    '/me/notification-preferences',
  );
  return res?.settings && typeof res.settings === 'object'
    ? res.settings
    : null;
}

export async function putEchoPersonalNotificationPreferences(
  token: string,
  settings: Record<string, unknown>,
): Promise<void> {
  await echoFetch<unknown>(token, '/me/notification-preferences', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

/** All per-channel notification overrides for the current viewer. */
export async function fetchEchoChannelNotificationOverrides(
  token: string,
): Promise<Record<string, EchoChannelNotificationOverride>> {
  const res = await echoFetch<EchoChannelNotificationOverridesResponse>(
    token,
    '/me/channel-notification-overrides',
  );
  return res?.overridesByChannelId &&
    typeof res.overridesByChannelId === 'object'
    ? res.overridesByChannelId
    : {};
}

/**
 * Replace the per-channel override. Send `level: null` to clear the level,
 * `mutedUntil: null` to clear snooze; when both clear the row is deleted.
 */
export async function putEchoChannelNotificationOverride(
  token: string,
  channelId: string,
  override: EchoChannelNotificationOverride,
): Promise<void> {
  const cid = trimEchoPathSegment(channelId);
  await echoFetch<unknown>(
    token,
    `/channels/${encodeURIComponent(cid)}/notification-override`,
    {
      method: 'PUT',
      body: JSON.stringify({
        ...(override.level !== undefined ? { level: override.level } : {}),
        ...(override.mutedUntil !== undefined
          ? { mutedUntil: override.mutedUntil }
          : {}),
      }),
    },
  );
}

/** VAPID public key for web push (null when push is disabled server-side). */
export async function fetchEchoWebPushPublicKey(
  token: string,
): Promise<{ publicKey: string | null; enabled: boolean }> {
  const res = await echoFetch<{ publicKey?: string | null; enabled?: boolean }>(
    token,
    '/push/vapid-public-key',
  );
  return {
    publicKey:
      typeof res?.publicKey === 'string' && res.publicKey.trim()
        ? res.publicKey
        : null,
    enabled: res?.enabled === true,
  };
}

export async function subscribeEchoWebPush(
  token: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  await echoFetch<unknown>(token, '/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

export async function unsubscribeEchoWebPush(
  token: string,
  endpoint: string,
): Promise<void> {
  await echoFetch<unknown>(token, '/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  });
}

export async function putEchoServerNotificationPreference(
  token: string,
  serverId: string,
  level: EchoServerNotificationLevel,
): Promise<void> {
  const sid = trimEchoPathSegment(serverId);
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(sid)}/notification-preferences`,
    {
      method: 'PUT',
      body: JSON.stringify({ level }),
    },
  );
}
