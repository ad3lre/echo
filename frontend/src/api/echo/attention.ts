import type {
  EchoAttentionSnapshot,
  EchoServerNotificationLevel,
} from '@shared/types';
import { echoFetch, trimEchoPathSegment } from './transport';

export async function fetchEchoAttentionSummary(
  token: string,
): Promise<EchoAttentionSnapshot> {
  return echoFetch(token, '/attention/summary');
}

export async function fetchEchoServerNotificationPreference(
  token: string,
  serverId: string,
): Promise<{ level: EchoServerNotificationLevel }> {
  const sid = trimEchoPathSegment(serverId);
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(sid)}/notification-preferences`,
  );
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
