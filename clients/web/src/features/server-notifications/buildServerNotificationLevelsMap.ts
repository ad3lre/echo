import type { ServerNotificationLevel } from '@/features/server-notifications/types';

/** Per-server notification level row for shell / chat sound (mirrors workspace overrides). */
export function buildServerNotificationLevelsMap(
  servers: readonly { id: string }[],
  getServerNotificationLevel: (serverId: string) => ServerNotificationLevel,
): Record<string, ServerNotificationLevel> {
  const map: Record<string, ServerNotificationLevel> = {};
  for (const s of servers) {
    map[s.id] = getServerNotificationLevel(s.id);
  }
  return map;
}
