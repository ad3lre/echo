import { computed } from 'vue';
import { compareJoinedServerListOrder } from '@shared/serverListOrdering';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useServerStore } from '@/features/layout/server';
import {
  ALL_SERVERS,
  type MoreServersMockServer,
} from '@/features/layout/composables/more-servers/moreServersMockCatalog';

export type { MoreServersMockServer };
export { ALL_SERVERS };

function toMoreServersRow(s: {
  id: string;
  name: string;
  imageUrl: string;
  bannerImageUrl?: string;
  bannerPositionY?: number;
  vanityCode?: string;
  description?: string;
  tags?: string[];
}): MoreServersMockServer {
  return {
    id: s.id,
    name: s.name,
    icon: s.imageUrl,
    bannerImageUrl: s.bannerImageUrl,
    bannerPositionY: s.bannerPositionY,
    vanityCode: s.vanityCode?.trim() || undefined,
    members: '',
    online: '',
    description: (s.description ?? '').trim(),
    tags: Array.isArray(s.tags) ? [...s.tags] : [],
    verified: false,
  };
}

function orderJoinedMoreServers(
  servers: {
    id: string;
    name: string;
    imageUrl: string;
    bannerImageUrl?: string;
    bannerPositionY?: number;
    vanityCode?: string;
    description?: string;
    tags?: string[];
  }[],
  pinnedIds: string[],
  mruIds: string[],
): MoreServersMockServer[] {
  const baseIndexById = new Map(servers.map((s, idx) => [s.id, idx] as const));
  const rows = servers.map(toMoreServersRow);
  rows.sort((a, b) =>
    compareJoinedServerListOrder(a.id, b.id, {
      pinnedIds,
      mruIds,
      baseIndexById,
    }),
  );
  return rows;
}

export function useMoreServers() {
  const serverStore = useServerStore();

  const moreServersList = computed((): MoreServersMockServer[] => {
    if (echoSyncCapabilities.isMockDataMode) {
      return ALL_SERVERS;
    }
    return orderJoinedMoreServers(
      serverStore.servers,
      serverStore.pinnedMoreServers.map((s) => s.id),
      serverStore.serverRailMru,
    );
  });

  const moreServersCount = computed(() => moreServersList.value.length);
  return { moreServersList, moreServersCount };
}
