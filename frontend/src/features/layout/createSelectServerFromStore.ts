import type { useServerStore } from '@/stores/server';

/** Stable `(serverId) => store.selectServer(serverId)` for composable option bags (`string | null` matches the Pinia store). */
export function createSelectServerFromStore(
  serverStore: ReturnType<typeof useServerStore>,
): (serverId: string | null) => void {
  return (serverId: string | null) => {
    serverStore.selectServer(serverId);
  };
}
