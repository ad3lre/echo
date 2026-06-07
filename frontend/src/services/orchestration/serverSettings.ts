import type { Ref } from 'vue';
import type { PatchEchoServerPreferencesBody } from '@/api/echoClient';
import { patchEchoServerPreferences } from '@/api/echoClient';
import type { Server } from '@shared/types';

type ServerPreferenceStorePatch = Partial<
  Pick<
    Server,
    | 'allowGlobalGuests'
    | 'applicationsEnabled'
    | 'automodSpamEnabled'
    | 'bannerBlackoutEnabled'
    | 'bannerBlurEnabled'
    | 'bannerImageUrl'
    | 'bannerPositionY'
    | 'description'
    | 'imageUrl'
    | 'inviteJoinEnabled'
    | 'listedInDirectory'
    | 'name'
    | 'tags'
    | 'vanityCode'
    | 'verificationRequireEmail'
  >
> & {
  applicationForm?: PatchEchoServerPreferencesBody['applicationForm'];
  raidJoinThresholdCount?: number;
  raidJoinWindowSeconds?: number;
  raidProtectionEnabled?: boolean;
};

export type ServerStoreLike = {
  updateServerBannerBlurEnabled: (id: string, v: boolean) => void;
  updateServerBannerBlackoutEnabled: (id: string, v: boolean) => void;
  updateServerBannerImageUrl: (id: string, url: string) => void;
  updateServerBannerPositionY: (id: string, y: number) => void;
  updateServerImageUrl: (id: string, url: string) => void;
  setServers: (next: Server[]) => void;
  servers: Server[];
  pinnedMoreServers: Server[];
};

type ServerListLike = ServerStoreLike['servers'];

function normalizeServerPreferencePatch(
  patch: Partial<PatchEchoServerPreferencesBody>,
): ServerPreferenceStorePatch {
  const { iconUrl, bannerUrl, ...rest } = patch;
  const normalized: ServerPreferenceStorePatch = { ...rest };
  if (iconUrl !== undefined) {
    normalized.imageUrl = iconUrl;
  }
  if (bannerUrl !== undefined) {
    normalized.bannerImageUrl = bannerUrl;
  }
  return normalized;
}

function mergeServerPatch(
  servers: ServerListLike,
  serverId: string,
  patch: Partial<PatchEchoServerPreferencesBody>,
): ServerListLike {
  const normalized = normalizeServerPreferencePatch(patch);
  return servers.map((server) =>
    server.id === serverId ? { ...server, ...normalized } : server,
  );
}

export function createServerSettingsService() {
  function syncServerLists(opts: {
    serverId: string;
    patch: Partial<PatchEchoServerPreferencesBody>;
    serverStore: ServerStoreLike;
    workspaceServers?: Ref<unknown[]>;
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
      workspaceServers?: Ref<unknown[]>;
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
