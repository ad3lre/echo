import { useAuthSessionStore } from '@/stores/authSession';
import {
  buildEchoChannelCategoriesForServer,
  postEchoServerChannel,
} from '@/api/echo/channels';
import {
  createEchoServer as apiCreateEchoServer,
  deleteEchoServer as apiDeleteEchoServer,
} from '@/api/echoClient';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { isEchoGraphId } from '@/utils/echoIds';
import { iconEchoRounded } from '@/assets/branding';
import { loadEchoExploreDirectoryRows } from './utils';
import type { WorkspaceStateRefs } from './types';
import {
  ensureChannelBucket,
  removeChannelMessageBucket,
  removeChannelMessageBucketsForIds,
} from '@/services/realtime/channelMessageAuthority';
import {
  addSingleMemberToServerMemberIds,
  appendCreatedServerRow,
  bootstrapCategoriesForNewServer,
  collectChannelIdsForServer,
  filterServersExcept,
  omitRecordKey,
  setCategoriesForServerId,
} from '@/services/domain/workspaceLocalServerGraphApply';
import type {
  ChannelPermissionKey,
  ChannelPermissionsState,
  ChannelSummary,
} from '@shared/types';

export function useWorkspaceServerActions(refs: WorkspaceStateRefs) {
  const {
    servers,
    categoriesByServer,
    serverMemberIds,
    discoverableServers,
    bannedUserIdsByServer,
    banMetaByServer,
    timeoutUntilByServerUser,
    memberRoleOverrides,
    serverNotificationOverrides,
  } = refs;

  async function addChannelToCategory(
    serverId: string,
    categoryId: string,
    channel: {
      name: string;
      type: 'text' | 'voice' | 'forum' | 'stage' | 'paper';
      iconKey?: string;
    },
  ): Promise<string | null> {
    const auth = useAuthSessionStore();
    if (!isEchoGraphId(serverId)) return null;
    try {
      const { channelId } = await postEchoServerChannel(
        auth.accessToken?.trim() ?? '',
        serverId,
        {
          name: channel.name,
          type: channel.type,
          categoryId,
          ...(channel.iconKey ? { iconKey: channel.iconKey } : {}),
        },
      );
      const cats = await buildEchoChannelCategoriesForServer(
        auth.accessToken?.trim() ?? '',
        serverId,
      );
      categoriesByServer.value = {
        ...categoriesByServer.value,
        [serverId]: cats,
      };
      return channelId;
    } catch (e) {
      reportPrimaryFlowFailure('createEchoChannel', e, {
        sid: serverId,
        payload: { categoryId, channel },
      });
      return null;
    }
  }

  /** Not implemented against Echo API yet — no-op. */
  function addCategoryToServer(_serverId: string, _rawName: string): boolean {
    return false;
  }

  async function createUserServer(
    rawName: string,
    opts?: { memberUserId?: string; imageUrl?: string },
  ): Promise<string | null> {
    const name = rawName.trim();
    if (!name) return null;
    const icon = opts?.imageUrl?.trim() ?? '';
    const auth = useAuthSessionStore();
    if (!auth.accessToken) return null;
    try {
      const resp = await apiCreateEchoServer(auth.accessToken, {
        name,
        ...(icon ? { iconUrl: icon } : {}),
      });
      const imageUrl = icon || iconEchoRounded;
      const ownerId = auth.backendUser?.id ?? '';
      servers.value = appendCreatedServerRow(servers.value, {
        id: resp.serverId,
        name,
        imageUrl,
        ownerId,
      });
      categoriesByServer.value = setCategoriesForServerId(
        categoriesByServer.value,
        resp.serverId,
        bootstrapCategoriesForNewServer(resp.serverId, resp.defaultChannelId),
      );
      ensureChannelBucket(resp.defaultChannelId);
      if (opts?.memberUserId) {
        serverMemberIds.value = addSingleMemberToServerMemberIds(
          serverMemberIds.value,
          resp.serverId,
          opts.memberUserId,
        );
      }
      try {
        discoverableServers.value = await loadEchoExploreDirectoryRows();
      } catch (e) {
        reportPrimaryFlowFailure(
          'refreshExploreDirectoryAfterCreate',
          e,
          { serverId: resp.serverId },
          { showBanner: false },
        );
        dispatchAppToast(
          'Your server was created, but the public list could not refresh. Try again later.',
          'warning',
        );
      }
      return resp.serverId;
    } catch (e) {
      reportPrimaryFlowFailure(
        'createEchoServer',
        e,
        { name },
        { showBanner: false },
      );
      dispatchAppToast(
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : 'Could not create the server. Try again.',
        'warning',
      );
      return null;
    }
  }

  async function deleteUserServer(serverId: string): Promise<boolean> {
    const auth = useAuthSessionStore();
    if (!auth.accessToken) return false;
    try {
      await apiDeleteEchoServer(auth.accessToken, serverId);
    } catch (e) {
      reportPrimaryFlowFailure(
        'deleteEchoServer',
        e,
        { serverId },
        { showBanner: false },
      );
      dispatchAppToast(
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : 'Could not delete the server. Try again.',
        'warning',
      );
      return false;
    }
    try {
      discoverableServers.value = await loadEchoExploreDirectoryRows();
    } catch (e) {
      reportPrimaryFlowFailure(
        'refreshExploreDirectoryAfterDelete',
        e,
        { serverId },
        { showBanner: false },
      );
      dispatchAppToast(
        'The server was removed, but the public list could not refresh.',
        'warning',
      );
    }
    if (!servers.value.some((s) => s.id === serverId)) return false;
    const channelIds = collectChannelIdsForServer(
      categoriesByServer.value,
      serverId,
    );
    removeChannelMessageBucketsForIds(channelIds);
    categoriesByServer.value = omitRecordKey(
      categoriesByServer.value,
      serverId,
    );
    servers.value = filterServersExcept(servers.value, serverId);
    serverMemberIds.value = omitRecordKey(serverMemberIds.value, serverId);
    bannedUserIdsByServer.value = omitRecordKey(
      bannedUserIdsByServer.value,
      serverId,
    );
    banMetaByServer.value = omitRecordKey(banMetaByServer.value, serverId);
    timeoutUntilByServerUser.value = omitRecordKey(
      timeoutUntilByServerUser.value,
      serverId,
    );
    memberRoleOverrides.value = omitRecordKey(
      memberRoleOverrides.value,
      serverId,
    );
    serverNotificationOverrides.value = omitRecordKey(
      serverNotificationOverrides.value,
      serverId,
    );
    return true;
  }

  function updateCategory(
    serverId: string,
    categoryId: string,
    patch: {
      newName?: string;
      channelPermissionDefaults?: Partial<
        Record<ChannelPermissionKey, boolean>
      >;
    },
  ): boolean {
    const list = categoriesByServer.value[serverId];
    if (list === undefined) return false;
    const idx = list.findIndex((c) => c.id === categoryId);
    if (idx === -1) return false;
    const cat = list[idx]!;
    const nextName =
      patch.newName !== undefined ? patch.newName.trim() : cat.name;
    if (!nextName) return false;
    if (patch.newName !== undefined && nextName !== cat.name) {
      if (list.some((c) => c.name === nextName)) return false;
    }
    const nextCat = {
      ...cat,
      name: nextName,
      ...(patch.channelPermissionDefaults !== undefined
        ? { channelPermissionDefaults: { ...patch.channelPermissionDefaults } }
        : {}),
    };
    const nextList = [...list];
    nextList[idx] = nextCat;
    categoriesByServer.value = {
      ...categoriesByServer.value,
      [serverId]: nextList,
    };
    return true;
  }

  function updateChannel(
    serverId: string,
    channelId: string,
    patch: {
      name?: string;
      categoryId?: string;
      iconKey?: string;
      slowModeSeconds?: number;
      userLimit?: number;
      nsfw?: boolean;
      messageHistoryAnchor?: 'top' | 'bottom';
      bitrateBps?: number | null;
      voiceE2eeEnabled?: boolean;
      channelPermissions?: ChannelPermissionsState;
      messageFormatTemplate?: string;
      messageFormatHard?: boolean;
    },
  ): boolean {
    const list = categoriesByServer.value[serverId];
    if (list === undefined) return false;
    let foundCatId: string | null = null;
    let foundCh: (typeof list)[number]['channels'][number] | undefined;
    for (const cat of list) {
      const ch = cat.channels.find((c) => c.id === channelId);
      if (ch) {
        foundCatId = cat.id;
        foundCh = ch;
        break;
      }
    }
    if (!foundCh || !foundCatId) return false;

    const nextName =
      patch.name !== undefined ? patch.name.trim() : foundCh.name;
    if (!nextName) return false;

    const targetCatId = patch.categoryId ?? foundCatId;
    const targetCat = list.find((c) => c.id === targetCatId);
    if (!targetCat) return false;

    const base = { ...foundCh, name: nextName } as ChannelSummary &
      Record<string, unknown>;
    if (patch.iconKey !== undefined) {
      if (patch.iconKey) {
        base.iconKey = patch.iconKey;
      } else {
        delete base.iconKey;
      }
    }
    if (patch.slowModeSeconds !== undefined) {
      base.slowModeSeconds = patch.slowModeSeconds;
    }
    if (patch.userLimit !== undefined) {
      base.userLimit = patch.userLimit;
    }
    if (patch.nsfw !== undefined) {
      base.nsfw = patch.nsfw;
    }
    if (patch.messageHistoryAnchor !== undefined) {
      if (patch.messageHistoryAnchor === 'top') {
        base.messageHistoryAnchor = 'top';
      } else {
        delete base.messageHistoryAnchor;
      }
    }
    if (patch.bitrateBps !== undefined) {
      base.bitrateBps = patch.bitrateBps;
    }
    if (patch.voiceE2eeEnabled !== undefined) {
      if (patch.voiceE2eeEnabled) {
        base.voiceE2eeEnabled = true;
      } else {
        delete base.voiceE2eeEnabled;
      }
    }
    if (patch.channelPermissions !== undefined) {
      base.channelPermissions = patch.channelPermissions;
    }
    if (patch.messageFormatTemplate !== undefined) {
      const t = patch.messageFormatTemplate;
      if (t.trim()) {
        base.messageFormatTemplate = t;
        if (patch.messageFormatHard !== undefined) {
          base.messageFormatHard = patch.messageFormatHard === true;
        }
      } else {
        delete base.messageFormatTemplate;
        delete base.messageFormatHard;
      }
    } else if (patch.messageFormatHard !== undefined) {
      base.messageFormatHard = patch.messageFormatHard === true;
    }
    const updated = base as (typeof list)[number]['channels'][number];

    if (targetCatId === foundCatId) {
      const nextList = list.map((c) =>
        c.id === foundCatId
          ? {
              ...c,
              channels: c.channels.map((ch) =>
                ch.id === channelId ? updated : ch,
              ),
            }
          : c,
      );
      categoriesByServer.value = {
        ...categoriesByServer.value,
        [serverId]: nextList,
      };
      return true;
    }

    const nextList = list.map((c) => {
      if (c.id === foundCatId) {
        return {
          ...c,
          channels: c.channels.filter((ch) => ch.id !== channelId),
        };
      }
      if (c.id === targetCatId) {
        return { ...c, channels: [...c.channels, updated] };
      }
      return c;
    });
    categoriesByServer.value = {
      ...categoriesByServer.value,
      [serverId]: nextList,
    };
    return true;
  }

  function deleteChannel(serverId: string, channelId: string): boolean {
    const list = categoriesByServer.value[serverId];
    if (list === undefined) return false;
    let removed = false;
    const nextList = list.map((cat) => {
      const channels = cat.channels.filter((ch) => {
        if (ch.id === channelId) {
          removed = true;
          return false;
        }
        return true;
      });
      return { ...cat, channels };
    });
    if (!removed) return false;
    categoriesByServer.value = {
      ...categoriesByServer.value,
      [serverId]: nextList,
    };
    removeChannelMessageBucket(channelId);
    return true;
  }

  function deleteCategory(serverId: string, categoryId: string): boolean {
    const list = categoriesByServer.value[serverId];
    if (list === undefined) return false;
    const idx = list.findIndex((c) => c.id === categoryId);
    if (idx === -1) return false;
    const cat = list[idx]!;
    const nextList = list.filter((_, i) => i !== idx);
    categoriesByServer.value = {
      ...categoriesByServer.value,
      [serverId]: nextList,
    };
    for (const ch of cat.channels) {
      removeChannelMessageBucket(ch.id);
    }
    return true;
  }

  return {
    addChannelToCategory,
    addCategoryToServer,
    createUserServer,
    deleteUserServer,
    updateCategory,
    updateChannel,
    deleteChannel,
    deleteCategory,
  };
}
