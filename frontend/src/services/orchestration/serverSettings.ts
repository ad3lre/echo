import type { Ref } from 'vue';
import type { PatchEchoServerPreferencesBody } from '@/api/echoClient';
import { patchEchoServerPreferences } from '@/api/echoClient';

export type ServerStoreLike = {
  updateServerBannerBlurEnabled: (id: string, v: boolean) => void;
  updateServerBannerBlackoutEnabled: (id: string, v: boolean) => void;
  updateServerBannerImageUrl: (id: string, url: string) => void;
  updateServerBannerPositionY: (id: string, y: number) => void;
  updateServerImageUrl: (id: string, url: string) => void;
  setServers: (next: any[]) => void;
  servers: any[];
  pinnedMoreServers: any[];
};

type ServerListLike = ServerStoreLike['servers'];

function mergeServerPatch(
  servers: ServerListLike,
  serverId: string,
  patch: Partial<PatchEchoServerPreferencesBody>,
): ServerListLike {
  const normalized: Record<string, unknown> = { ...patch };
  if ('iconUrl' in normalized) {
    normalized.imageUrl = normalized.iconUrl;
    delete normalized.iconUrl;
  }
  if ('bannerUrl' in normalized) {
    normalized.bannerImageUrl = normalized.bannerUrl;
    delete normalized.bannerUrl;
  }
  return servers.map((server) =>
    server.id === serverId ? { ...server, ...normalized } : server,
  );
}

export function createServerSettingsService() {
  function syncServerLists(opts: {
    serverId: string;
    patch: Partial<PatchEchoServerPreferencesBody>;
    serverStore: ServerStoreLike;
    workspaceServers?: Ref<any[]>;
  }) {
    const next = mergeServerPatch(
      opts.serverStore.servers,
      opts.serverId,
      opts.patch,
    );
    opts.serverStore.setServers(next);
    if (opts.workspaceServers) {
      opts.workspaceServers.value = next;
    }
    return next;
  }

  return {
    syncServerLists,
    async persistPreferences(opts: {
      token?: string | null | undefined;
      serverId: string;
      patch: Partial<PatchEchoServerPreferencesBody>;
      serverStore: ServerStoreLike;
      workspaceServers?: Ref<any[]>;
      refreshExploreDirectory?: () => Promise<void>;
    }) {
      const { token, serverId, patch, serverStore, refreshExploreDirectory } =
        opts;
      await patchEchoServerPreferences(
        token ?? '',
        serverId,
        patch as PatchEchoServerPreferencesBody,
      );
      syncServerLists({
        serverId,
        patch,
        serverStore,
        workspaceServers: opts.workspaceServers,
      });
      if (typeof refreshExploreDirectory === 'function') {
        await refreshExploreDirectory();
      }
    },
    async persistBranding(opts: {
      token?: string | null | undefined;
      serverId: string;
      patch: Pick<PatchEchoServerPreferencesBody, 'iconUrl' | 'bannerUrl'>;
      refreshExploreDirectory?: () => Promise<void>;
    }) {
      const { token, serverId, patch, refreshExploreDirectory } = opts;
      await patchEchoServerPreferences(
        token ?? '',
        serverId,
        patch as PatchEchoServerPreferencesBody,
      );
      if (typeof refreshExploreDirectory === 'function') {
        await refreshExploreDirectory();
      }
    },
  };
}
