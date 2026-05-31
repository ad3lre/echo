import { ref, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import {
  buildCachedMessagesMapForPrefetch,
  resolveMentionNotificationScanChannelIds,
} from '@/features/dm/mentionNotificationAuthority';
import {
  prefetchMentionNotificationChannels,
  resolveMentionNotificationPrefetchTargets,
  type MentionNotificationPrefetchTarget,
} from '@/features/dm/prefetchMentionNotificationChannels';
import { hasChannelMessageInBucket } from '@/services/realtime/channelMessageAuthority';
import { shouldSkipChannelMessagePrefetch } from '@/services/orchestration/echoWorkspaceChannelPrefetch';
import { useAuthSessionStore } from '@/stores/authSession';
import { useEchoAttentionStore } from '@/stores/echoAttention';

/**
 * Background hydrate for mention notification rows: uses the attention snapshot
 * as the source of unread ping volume and `messageReadFacade` as the message cache.
 * Runs at app shell level so the inbox is warm before the notifications view opens.
 */
export function useMentionNotificationHydration(input: {
  rows: Ref<readonly DmMentionNotificationRow[]>;
  activeChannelId?: Ref<string | null | undefined>;
}) {
  const auth = useAuthSessionStore();
  const echoAttention = useEchoAttentionStore();
  const {
    channelAttentionByChannelId,
    readStateByChannelId,
    serverNotificationLevelByServerId,
  } = storeToRefs(echoAttention);

  const loading = ref(false);
  let hydrateSeq = 0;

  function targetsNeedHydration(
    targets: readonly MentionNotificationPrefetchTarget[],
  ): boolean {
    return targets.some((target) => {
      if (!shouldSkipChannelMessagePrefetch(target.channelId)) return true;
      const anchor = target.anchorMessageId?.trim();
      return !!anchor && !hasChannelMessageInBucket(target.channelId, anchor);
    });
  }

  async function hydrateMentionChannels(): Promise<void> {
    const token = auth.accessToken?.trim() ?? '';
    if (!token || !auth.isAuthenticated) {
      loading.value = false;
      return;
    }

    const scanChannelIds = resolveMentionNotificationScanChannelIds({
      channelAttentionByChannelId: channelAttentionByChannelId.value,
      readStateByChannelId: readStateByChannelId.value,
      serverNotificationLevelByServerId:
        serverNotificationLevelByServerId.value,
    });

    const targets = resolveMentionNotificationPrefetchTargets({
      channelAttentionByChannelId: channelAttentionByChannelId.value,
      readStateByChannelId: readStateByChannelId.value,
      serverNotificationLevelByServerId:
        serverNotificationLevelByServerId.value,
      messagesByChannelId: buildCachedMessagesMapForPrefetch(scanChannelIds),
    });

    if (targets.length === 0 || !targetsNeedHydration(targets)) {
      loading.value = false;
      return;
    }

    const expectRowsSoon =
      input.rows.value.length === 0 &&
      targets.some((target) => !!target.anchorMessageId);

    const seq = ++hydrateSeq;
    if (expectRowsSoon) loading.value = true;

    try {
      await prefetchMentionNotificationChannels({
        token,
        targets,
        activeChannelId: input.activeChannelId?.value?.trim() || undefined,
      });
    } finally {
      if (seq === hydrateSeq) loading.value = false;
    }
  }

  watch(
    [
      channelAttentionByChannelId,
      readStateByChannelId,
      serverNotificationLevelByServerId,
      () => input.rows.value.length,
    ],
    () => {
      void hydrateMentionChannels();
    },
    { immediate: true, deep: true },
  );

  return { loading };
}
