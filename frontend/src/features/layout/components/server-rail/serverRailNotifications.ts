import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import { getServerNotificationSummary } from '@/features/server-notifications/types';

export function getServerNotifBadge(
  serverId: string,
  serverNotificationLevels?: Record<string, ServerNotificationLevel>,
): ServerNotificationLevel | null {
  const n = serverNotificationLevels?.[serverId];
  if (!n || n === 'all' || n === 'mentions') return null;
  return n;
}

export function getServerNotifTitle(
  serverId: string,
  serverNotificationLevels?: Record<string, ServerNotificationLevel>,
): string {
  const b = getServerNotifBadge(serverId, serverNotificationLevels);
  if (!b) return '';
  return getServerNotificationSummary(b);
}

export function getServerNotifGlyph(level: ServerNotificationLevel): string {
  if (level === 'mentions_direct') return '@';
  return '−';
}
