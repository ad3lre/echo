import { ref, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import {
  prefetchMentionNotificationChannels,
  resolveMentionNotificationPrefetchTargets,
  type MentionNotificationPrefetchTarget,
} from '@/features/dm/prefetchMentionNotificationChannels';
import { hasChannelMessageInBucket } from '@/services/realtime/channelMessageAuthority';
import { shouldSkipChannelMessagePrefetch } from '@/services/orchestration/echoWorkspaceChannelPrefetch';
import { useAuthSessionStore } from '@/stores/authSession';
import { useEchoAttentionStore } from '@/stores/echoAttention';
import { useEchoSessionStore } from '@/stores/echoSession';

/**
 * When the notifications view opens, hydrate local message buckets for channels
 * that still have mention-tier unread volume in the attention snapshot.
 */
export function useMentionNotificationHydration(input: {
  rows: Ref<readonly DmMentionNotificationRow[]>;
  activeChannelId?: Ref<string>;
}) {
  const auth = useAuthSessionStore();
  const echoSession = useEchoSessionStore();
  const echoAttention = useEchoAttentionStore();
  const { messages } = storeToRefs(echoSession);
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

    const targets = resolveMentionNotificationPrefetchTargets({
      channelAttentionByChannelId: channelAttentionByChannelId.value,
      readStateByChannelId: readStateByChannelId.value,
      serverNotificationLevelByServerId:
        serverNotificationLevelByServerId.value,
      messagesByChannelId: messages.value,
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
        activeChannelId: input.activeChannelId?.value,
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
      messages,
      () => input.rows.value.length,
    ],
    () => {
      void hydrateMentionChannels();
    },
    { immediate: true, deep: true },
  );

  return { loading };
}
