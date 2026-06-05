import { onScopeDispose, ref, watch, type Ref } from 'vue';
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
import { hasChannelMessageInBucket } from '@/services/realtime/channelMessageAuthority';
import { shouldSkipChannelMessagePrefetch } from '@/services/orchestration/echoWorkspaceChannelPrefetch';
import { useAuthSessionStore } from '@/stores/authSession';
import { useEchoAttentionStore } from '@/stores/echoAttention';

/**
 * Upper bound on how long a row may stay a "Loading mention…" stub before we
 * give up and surface the actionable failure preview. `echoFetch` has no request
 * timeout and the hydrate pipeline is gated behind a single in-flight promise, so
 * one stalled prefetch would otherwise pin the stub forever. The eager server
 * feed resolves rows in well under a second, so this only bites a genuine wedge.
 */
const STUB_WATCHDOG_MS = 12_000;

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
  let stubWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

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
    rows: readonly DmMentionNotificationRow[],
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

    for (const row of rows) {
      if (row.preview !== MENTION_NOTIFICATION_STUB_PREVIEW) continue;
      const channelId = row.channelId.trim();
      const messageId = row.messageId.trim();
      if (!channelId || !messageId) continue;
      if (!hasChannelMessageInBucket(channelId, messageId)) {
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
      if (hasLoadingStubs) {
        markHydrationFailures([], rows);
      }
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
      markHydrationFailures(targets, input.rows.value);
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

  function clearStubWatchdog(): void {
    if (stubWatchdogTimer != null) {
      clearTimeout(stubWatchdogTimer);
      stubWatchdogTimer = null;
    }
  }

  /**
   * Arm a one-shot timer that converts still-loading stubs into the actionable
   * failure preview. Intentionally not re-armed while running — re-arming on
   * every reactive tick would let attention churn reset it forever, the same
   * starvation that wedges the feed debounce.
   */
  function armStubWatchdog(): void {
    if (stubWatchdogTimer != null) return;
    stubWatchdogTimer = setTimeout(() => {
      stubWatchdogTimer = null;
      const rows = input.rows.value;
      if (!mentionNotificationRowsHaveLoadingStubs(rows)) return;
      // Flip unresolved stubs to MENTION_NOTIFICATION_FAILED_PREVIEW so the inbox
      // never shows an indefinite spinner. If a wedged fetch later lands, the row
      // self-heals on the next resolver-version recompute.
      markHydrationFailures([], rows);
      loading.value = false;
    }, STUB_WATCHDOG_MS);
  }

  function syncStubWatchdog(): void {
    if (mentionNotificationRowsHaveLoadingStubs(input.rows.value)) {
      armStubWatchdog();
    } else {
      clearStubWatchdog();
    }
  }

  watch(
    [
      channelAttentionByChannelId,
      readStateByChannelId,
      serverNotificationLevelByServerId,
      accessToken,
      isAuthenticated,
      () => rowsSignature(input.rows.value),
    ],
    () => {
      scheduleHydrate();
      syncStubWatchdog();
    },
    { immediate: true, deep: true },
  );

  onScopeDispose(clearStubWatchdog);

  return { loading, failedChannelIds };
}

function rowsSignature(rows: readonly DmMentionNotificationRow[]): string {
  return rows.map((row) => `${row.key}:${row.preview}`).join('|');
}
