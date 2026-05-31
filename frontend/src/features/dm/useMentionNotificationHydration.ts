import { ref, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import {
  buildCachedMessagesMapForPrefetch,
  mentionNotificationRowsHaveLoadingStubs,
  MENTION_NOTIFICATION_STUB_PREVIEW,
  resolveMentionNotificationScanChannelIds,
} from '@/features/dm/mentionNotificationAuthority';
import {
  mergeMentionNotificationPrefetchTargets,
  prefetchMentionNotificationChannels,
  resolveMentionNotificationPrefetchTargets,
  resolveMentionNotificationPrefetchTargetsFromStubRows,
  type MentionNotificationPrefetchTarget,
} from '@/features/dm/prefetchMentionNotificationChannels';
import { messageReadFacade } from '@/features/chat/domain/messageReadFacade';
import { hasChannelMessageInBucket } from '@/services/realtime/channelMessageAuthority';
import { shouldSkipChannelMessagePrefetch } from '@/services/orchestration/echoWorkspaceChannelPrefetch';
import { useAuthSessionStore } from '@/stores/authSession';
import { useEchoAttentionStore } from '@/stores/echoAttention';

function resolveStubChannelIds(
  rows: readonly DmMentionNotificationRow[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.preview !== MENTION_NOTIFICATION_STUB_PREVIEW) continue;
    const channelId = row.channelId.trim();
    if (!channelId || seen.has(channelId)) continue;
    seen.add(channelId);
    out.push(channelId);
  }
  return out;
}

function filterHydrationTargets(
  targets: readonly MentionNotificationPrefetchTarget[],
  failedChannelIds: ReadonlySet<string>,
  retryChannelIds: ReadonlySet<string>,
): MentionNotificationPrefetchTarget[] {
  if (failedChannelIds.size === 0) return [...targets];
  return targets.filter((target) => {
    const channelId = target.channelId.trim();
    if (retryChannelIds.has(channelId)) return true;
    return !failedChannelIds.has(channelId);
  });
}

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
  const { accessToken, isAuthenticated } = storeToRefs(auth);
  const echoAttention = useEchoAttentionStore();
  const {
    channelAttentionByChannelId,
    readStateByChannelId,
    serverNotificationLevelByServerId,
  } = storeToRefs(echoAttention);

  const loading = ref(false);
  const failedChannelIds = ref<ReadonlySet<string>>(new Set());

  let hydrateInFlight: Promise<void> | null = null;
  let hydrateQueued = false;

  function targetsNeedHydration(
    targets: readonly MentionNotificationPrefetchTarget[],
  ): boolean {
    return targets.some((target) => {
      const channelId = target.channelId.trim();
      const anchor = target.anchorMessageId?.trim();
      if (anchor && hasChannelMessageInBucket(channelId, anchor)) {
        return false;
      }
      if (!shouldSkipChannelMessagePrefetch(channelId)) return true;
      return !!anchor;
    });
  }

  function markHydrationFailures(
    targets: readonly MentionNotificationPrefetchTarget[],
  ): void {
    const next = new Set(failedChannelIds.value);
    for (const target of targets) {
      const channelId = target.channelId.trim();
      const anchor = target.anchorMessageId?.trim();
      if (!channelId || !anchor) continue;
      if (!hasChannelMessageInBucket(channelId, anchor)) {
        next.add(channelId);
      } else {
        next.delete(channelId);
      }
    }
    failedChannelIds.value = next;
  }

  async function hydrateMentionChannels(): Promise<void> {
    if (!isAuthenticated.value) {
      loading.value = false;
      return;
    }

    const token = accessToken.value?.trim() ?? '';
    if (!token) {
      loading.value = false;
      return;
    }

    const rows = input.rows.value;
    const stubChannelIds = resolveStubChannelIds(rows);
    const retryChannelIds = new Set(stubChannelIds);

    const scanChannelIds = resolveMentionNotificationScanChannelIds({
      channelAttentionByChannelId: channelAttentionByChannelId.value,
      readStateByChannelId: readStateByChannelId.value,
      serverNotificationLevelByServerId:
        serverNotificationLevelByServerId.value,
    });

    const attentionTargets = resolveMentionNotificationPrefetchTargets({
      channelAttentionByChannelId: channelAttentionByChannelId.value,
      readStateByChannelId: readStateByChannelId.value,
      serverNotificationLevelByServerId:
        serverNotificationLevelByServerId.value,
      messagesByChannelId: buildCachedMessagesMapForPrefetch(scanChannelIds),
      prioritizeChannelIds: stubChannelIds,
    });
    const stubTargets =
      resolveMentionNotificationPrefetchTargetsFromStubRows(rows);
    const allTargets = mergeMentionNotificationPrefetchTargets(
      attentionTargets,
      stubTargets,
    );
    const targets = filterHydrationTargets(
      allTargets,
      failedChannelIds.value,
      retryChannelIds,
    );

    const hasLoadingStubs = mentionNotificationRowsHaveLoadingStubs(rows);

    if (targets.length === 0) {
      loading.value = false;
      return;
    }

    if (!targetsNeedHydration(targets) && !hasLoadingStubs) {
      loading.value = false;
      return;
    }

    const expectInitialLoad =
      rows.length === 0 && targets.some((target) => !!target.anchorMessageId);

    if (expectInitialLoad) loading.value = true;

    try {
      await prefetchMentionNotificationChannels({
        token,
        targets,
        activeChannelId: input.activeChannelId?.value?.trim() || undefined,
      });
    } finally {
      loading.value = false;
      markHydrationFailures(targets);
    }
  }

  function scheduleHydrate(): void {
    if (hydrateInFlight) {
      hydrateQueued = true;
      return;
    }

    hydrateInFlight = hydrateMentionChannels()
      .catch(() => {
        // Prefetch is best-effort; failures surface via failedChannelIds.
      })
      .finally(() => {
        hydrateInFlight = null;
        if (hydrateQueued) {
          hydrateQueued = false;
          scheduleHydrate();
        }
      });
  }

  watch(
    [
      channelAttentionByChannelId,
      readStateByChannelId,
      serverNotificationLevelByServerId,
      accessToken,
      isAuthenticated,
      () => messageReadFacade.globalResolverVersion.value,
      () => rowsSignature(input.rows.value),
    ],
    () => {
      scheduleHydrate();
    },
    { immediate: true, deep: true },
  );

  return { loading, failedChannelIds };
}

function rowsSignature(rows: readonly DmMentionNotificationRow[]): string {
  return rows.map((row) => `${row.key}:${row.preview}`).join('|');
}
