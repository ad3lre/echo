import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import type { useEchoAttentionStore } from '@/features/layout/echoAttention';
import type { useServerStore } from '@/features/layout/server';
import { messageReadFacade } from '@/features/chat/domain/messageReadFacade';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import {
  collectMentionNotificationsFromAuthority,
  applyMentionNotificationHydrationFailures,
} from '@/features/dm/mentionNotificationAuthority';
import { useMentionNotificationHydration } from '@/features/dm/useMentionNotificationHydration';
import {
  mapServerMentionRowsToDmRows,
  mergeMentionNotificationRows,
} from '@/features/dm/mentionNotificationFeedMerge';
import { useMentionNotificationsFeedStore } from '@/features/layout/mentionNotificationsFeed';
import {
  resolveMentionNotificationAuthorName,
  resolveMentionNotificationChannelLabel,
  resolveMentionNotificationRowAuthorName,
  resolveMentionNotificationRowPreview,
} from '@/features/dm/resolveMentionNotificationDisplay';
import type { NotificationReadPreset } from '@/features/dm/filterDmMentionNotificationRows';

type ResolveChannelLabelArgs = Parameters<
  typeof resolveMentionNotificationChannelLabel
>[0];

/**
 * @mention / @everyone / @active notifications feed for the layout shell:
 * client-cache reconstruction merged with the server-authoritative mention
 * feed, hydration state, display resolvers, and the panel's controlled filter
 * refs. Reads attention maps directly off the store (reactive on access).
 */
export function useAppLayoutMentionNotifications(deps: {
  findChannelContextById: ResolveChannelLabelArgs['findChannelContextById'];
  workspace: WorkspaceStateApi;
  echoDmPeerByChannelId: Ref<ResolveChannelLabelArgs['echoDmPeerByChannelId']>;
  echoDmThreadIds: Ref<ResolveChannelLabelArgs['echoDmThreadIds']>;
  groupDMs: Ref<ResolveChannelLabelArgs['groupDMs']>;
  currentUserIdForSocket: ComputedRef<string | undefined>;
  authSession: ReturnType<typeof useAuthSessionStore>;
  echoAttention: ReturnType<typeof useEchoAttentionStore>;
  serverStore: ReturnType<typeof useServerStore>;
  activeChannelId: Ref<string>;
  handleGoToMessage: (channelId: string, messageId: string) => void;
  markEchoChannelAsRead: (
    channelId: string,
    opts?: { emptyMessage?: string; successMessage?: string; silent?: boolean },
  ) => Promise<void>;
}) {
  const {
    findChannelContextById,
    workspace,
    echoDmPeerByChannelId,
    echoDmThreadIds,
    groupDMs,
    currentUserIdForSocket,
    authSession,
    echoAttention,
    serverStore,
    activeChannelId,
    handleGoToMessage,
    markEchoChannelAsRead,
  } = deps;

  function resolveDmMentionNotificationChannelLabel(channelId: string): string {
    return resolveMentionNotificationChannelLabel({
      channelId,
      findChannelContextById,
      categoriesByServer: workspace.categoriesByServer.value,
      echoDmPeerByChannelId: echoDmPeerByChannelId.value,
      echoDmThreadIds: echoDmThreadIds.value,
      groupDMs: groupDMs.value,
      users: workspace.users.value,
    });
  }

  function resolveDmMentionNotificationAuthorName(
    row: DmMentionNotificationRow,
  ): string {
    void messageReadFacade.globalResolverVersion.value;
    const cached = messageReadFacade.getChannelEntity(
      row.channelId,
      row.messageId,
    );
    return resolveMentionNotificationRowAuthorName({
      row,
      cachedAuthorId: cached?.authorId,
      authorDisplayName: cached?.authorDisplayName,
      users: workspace.users.value,
      selfUserId: currentUserIdForSocket.value ?? undefined,
      selfDisplayName: authSession.backendUser?.username?.trim(),
      categoriesByServer: workspace.categoriesByServer.value,
      serverMemberNicknames: workspace.serverMemberNicknames.value,
    });
  }

  function resolveDmMentionNotificationRowPreview(
    row: DmMentionNotificationRow,
  ): string {
    void messageReadFacade.globalResolverVersion.value;
    const cached = messageReadFacade.getChannelEntity(
      row.channelId,
      row.messageId,
    );
    return resolveMentionNotificationRowPreview({
      row,
      cachedMessage: cached,
    });
  }

  /** Rows reconstructed from the in-memory message cache (live socket updates). */
  const dmMentionNotificationsClient = computed(() => {
    // Depend on the global resolver version so this re-computes when messages
    // are prefetched/loaded into the cache, replacing "Loading mention…" stubs.
    void messageReadFacade.globalResolverVersion.value;
    return collectMentionNotificationsFromAuthority({
      channelAttentionByChannelId: echoAttention.channelAttentionByChannelId,
      readStateByChannelId: echoAttention.readStateByChannelId,
      serverNotificationLevelByServerId:
        echoAttention.serverNotificationLevelByServerId,
      selfUserId: currentUserIdForSocket.value ?? '',
      resolveChannelLabel: resolveDmMentionNotificationChannelLabel,
      resolveUserName: (userId, authorDisplayName) =>
        resolveMentionNotificationAuthorName({
          userId,
          authorDisplayName,
          users: workspace.users.value,
          selfUserId: currentUserIdForSocket.value ?? undefined,
          selfDisplayName: authSession.backendUser?.username?.trim(),
          serverMemberNicknames: workspace.serverMemberNicknames.value,
        }),
      maxItems: 120,
    });
  });

  const {
    loading: mentionNotificationLegacyHydrationLoading,
    failedChannelIds: mentionNotificationFailedChannelIds,
  } = useMentionNotificationHydration({
    rows: dmMentionNotificationsClient,
    activeChannelId,
  });

  // Server-authoritative mention feed: hydrated rows from `GET /attention/mentions`.
  // Once loaded it becomes the source of truth (no per-channel prefetch needed);
  // live socket rows not yet in the feed are merged in from the client cache.
  const mentionFeed = useMentionNotificationsFeedStore();
  const {
    rows: mentionFeedRows,
    loaded: mentionFeedLoaded,
    loading: mentionFeedLoading,
  } = storeToRefs(mentionFeed);

  const mentionNotificationHydrationLoading = computed(() => {
    if (mentionFeedLoaded.value) return false;
    return (
      mentionFeedLoading.value ||
      mentionNotificationLegacyHydrationLoading.value
    );
  });

  const dmMentionNotificationsBase = computed(() => {
    if (!mentionFeedLoaded.value) return dmMentionNotificationsClient.value;
    return mergeMentionNotificationRows(
      mapServerMentionRowsToDmRows(mentionFeedRows.value),
      dmMentionNotificationsClient.value,
      120,
    );
  });

  watch(
    [
      () => authSession.accessToken,
      () => echoAttention.channelAttentionByChannelId,
    ],
    () => {
      const token = authSession.accessToken?.trim() ?? '';
      if (!token) {
        mentionFeed.reset();
        return;
      }
      mentionFeed.scheduleRefresh(token);
    },
    { immediate: true, deep: true },
  );

  const dmMentionNotifications = computed(() => {
    void workspace.users.value;
    void workspace.serverMemberNicknames.value;
    void messageReadFacade.globalResolverVersion.value;
    return applyMentionNotificationHydrationFailures(
      dmMentionNotificationsBase.value.map((row) => ({
        ...row,
        channelLabel: resolveDmMentionNotificationChannelLabel(row.channelId),
        authorName: resolveDmMentionNotificationAuthorName(row),
        preview: resolveDmMentionNotificationRowPreview(row),
      })),
      mentionNotificationFailedChannelIds.value,
    );
  });

  /** Proxies the attention store's read-state map for the notifications panel. */
  const dmNotificationReadStateByChannelId = computed(
    () => echoAttention.readStateByChannelId,
  );

  const mentionNotificationCategoriesByServer = computed(
    () => workspace.categoriesByServer.value,
  );

  /**
   * Controlled filter state for the notifications panel.
   * Persisted in the parent (AppLayout) across tab switches via v-model emits;
   * the panel resets these on first mount if the parent does not provide them.
   */
  const dmNotificationsReadPreset = ref<NotificationReadPreset>('unread');
  const dmNotificationsSourceKey = ref('all');

  const mentionNotificationServers = computed(() =>
    serverStore.servers.map((s) => ({
      id: s.id,
      name: String(s.name ?? '').trim() || 'Server',
      imageUrl: String(s.imageUrl ?? '').trim() || undefined,
    })),
  );

  /** Navigates to the channel containing the notification, then scrolls to the specific message. */
  function onOpenMentionNotification(row: DmMentionNotificationRow) {
    handleGoToMessage(row.channelId, row.messageId);
  }

  async function onMarkMentionNotificationRead(
    row: DmMentionNotificationRow,
  ): Promise<void> {
    await markEchoChannelAsRead(row.channelId, {
      emptyMessage: 'Nothing unread in this thread.',
      successMessage: 'Marked thread as read.',
    });
  }

  return {
    dmMentionNotifications,
    mentionNotificationHydrationLoading,
    resolveDmMentionNotificationChannelLabel,
    resolveDmMentionNotificationAuthorName,
    resolveDmMentionNotificationRowPreview,
    dmNotificationReadStateByChannelId,
    mentionNotificationCategoriesByServer,
    mentionNotificationServers,
    dmNotificationsReadPreset,
    dmNotificationsSourceKey,
    onOpenMentionNotification,
    onMarkMentionNotificationRead,
  };
}
