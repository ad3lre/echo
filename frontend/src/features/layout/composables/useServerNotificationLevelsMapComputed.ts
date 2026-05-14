import { computed } from 'vue';
import { buildServerNotificationLevelsMap } from '@/features/server-notifications/buildServerNotificationLevelsMap';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';

export function useServerNotificationLevelsMapComputed(deps: {
  servers: () => readonly { id: string }[];
  getServerNotificationLevel: (serverId: string) => ServerNotificationLevel;
}) {
  return computed(() =>
    buildServerNotificationLevelsMap(
      deps.servers(),
      deps.getServerNotificationLevel,
    ),
  );
}
