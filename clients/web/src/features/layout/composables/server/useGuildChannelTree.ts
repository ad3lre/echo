import { computed, watch, type ComputedRef, type Ref } from 'vue';
import type { RolePreviewState } from '@/features/server-settings/composables/useRolePreview';
import type { useServerStore } from '@/features/layout/server';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import {
  findChannelContextById as findChannelContextInServerTree,
  resolvePreviewChannelPermission as resolvePreviewChannelPermissionCore,
  type PreviewChannelPermission,
} from '@/features/chat/domain/chatRolePreviewPermissions';
import type { ChannelPermissionKey, ChannelSummary } from '@shared/types';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import type { Server } from '@shared/types/server';
import { logShellNav } from '@/features/layout/shellNavDebugLog';

export function useGuildChannelTree(deps: {
  serverStore: ReturnType<typeof useServerStore>;
  workspace: WorkspaceStateApi;
  selectedServer: ComputedRef<Server | undefined>;
  rolePreview: ComputedRef<RolePreviewState | null>;
  isRolePreviewActiveForServer: ComputedRef<boolean>;
  previewHasUiPermission: (permission: string) => boolean;
}) {
  const {
    serverStore,
    workspace,
    selectedServer,
    rolePreview,
    isRolePreviewActiveForServer,
    previewHasUiPermission,
  } = deps;

  const rawCategoriesForServer = computed(() => {
    const sid =
      selectedServer.value?.id ?? serverStore.selectedServerId ?? null;
    if (!sid || sid === 'echo') return [];
    return workspace.categoriesByServer.value[sid] ?? [];
  });

  function resolvePreviewChannelPermission(
    channel: ChannelSummary | null | undefined,
    categoryDefaults:
      | Partial<Record<ChannelPermissionKey, boolean>>
      | undefined,
    permission: PreviewChannelPermission,
  ): boolean {
    return resolvePreviewChannelPermissionCore(
      rolePreview.value ?? undefined,
      selectedServer.value?.id,
      channel,
      categoryDefaults,
      permission,
      previewHasUiPermission,
    );
  }

  function findChannelContextById(channelId: string | null | undefined): {
    channel: ChannelSummary;
    category: ChannelCategory;
  } | null {
    return findChannelContextInServerTree(
      rawCategoriesForServer.value,
      channelId,
    );
  }

  const categoriesForServer = computed(() => {
    const categories = rawCategoriesForServer.value;
    if (isRolePreviewActiveForServer.value) {
      return categories.flatMap((category) => {
        const hadChannelsBeforeVisibilityFilter = category.channels.length > 0;
        const channels = category.channels.filter((channel) =>
          resolvePreviewChannelPermission(
            channel,
            category.channelPermissionDefaults,
            'viewChannel',
          ),
        );
        const keep = channels.length > 0 || !hadChannelsBeforeVisibilityFilter;
        return keep ? [{ ...category, channels }] : [];
      });
    }
    /** Workspace omits no-view channels server-side; drop any row explicitly marked false (stale cache / dev). */
    return categories.flatMap((category) => {
      const hadChannelsBeforeVisibilityFilter = category.channels.length > 0;
      const channels = category.channels.filter(
        (ch) =>
          (ch as ChannelSummary & { canViewChannel?: boolean })
            .canViewChannel !== false,
      );
      const keep = channels.length > 0 || !hadChannelsBeforeVisibilityFilter;
      return keep ? [{ ...category, channels }] : [];
    });
  });

  function getFirstTextChannelId(
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ): string {
    for (const cat of cats) {
      const ch = cat.channels.find(
        (c) => c.type === 'text' || c.type === 'forum',
      );
      if (ch) return ch.id;
    }
    return cats[0]?.channels?.[0]?.id ?? '';
  }

  /**
   * When the selected server or its channel tree changes, ensure `activeChannelId` still exists
   * in that server — otherwise pick the first text channel.
   * Skip when the selection is a DM / persisted DM thread id (not in guild categories); rewriting
   * those to `#general` incorrectly “pulls” users out of 1:1 calls and DM threads.
   */
  function watchActiveChannelWithServerChange(
    activeChannelId: Ref<string>,
    shouldPreserveChannel?: (channelId: string) => boolean,
  ) {
    watch(
      [() => serverStore.selectedServerId, categoriesForServer],
      ([newServerId, cats]) => {
        if (newServerId === 'echo') return;
        const cur = activeChannelId.value;
        if (cur && shouldPreserveChannel?.(cur)) return;
        const list = cats as {
          name: string;
          channels: { id: string; type: string }[];
        }[];
        const firstId = getFirstTextChannelId(list);
        /** Match URL resolution / deep links: existence in the raw server tree, not the filtered sidebar. */
        const inTree = rawCategoriesForServer.value.some((c) =>
          c.channels.some((ch) => ch.id === activeChannelId.value),
        );
        if (!inTree && firstId) {
          logShellNav(
            'watchActiveChannelWithServerChange',
            'rewrite_to_first_text',
            {
              from: activeChannelId.value,
              to: firstId,
            },
          );
          activeChannelId.value = firstId;
          return;
        }
        if (!inTree && !firstId && activeChannelId.value) {
          logShellNav(
            'watchActiveChannelWithServerChange',
            'clear_stale_channel',
            {
              from: activeChannelId.value,
            },
          );
          activeChannelId.value = '';
        }
      },
      { immediate: true },
    );
  }

  return {
    rawCategoriesForServer,
    categoriesForServer,
    resolvePreviewChannelPermission,
    findChannelContextById,
    getFirstTextChannelId,
    watchActiveChannelWithServerChange,
  };
}
