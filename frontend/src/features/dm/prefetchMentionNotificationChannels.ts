import type { EchoAttentionChannelSummary } from '@shared/types';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import { MENTION_NOTIFICATION_STUB_PREVIEW } from '@/features/dm/mentionNotificationAuthority';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import {
  applyAttentionNotificationLevel,
  isDmChannelMentionUnread,
  isServerChannelUnreadForPingBubble,
  resolveEchoUnreadUpperBoundMessageId,
} from '@shared/attentionPing';
import {
  fetchEchoChannelMessage,
  fetchEchoChannelMessages,
} from '@/api/echo/messages';
import { ECHO_CHANNEL_MESSAGE_PAGE_SIZE } from '@/constants/echoHistoryPageSize';
import { messageReadFacade } from '@/features/chat/domain/messageReadFacade';
import {
  hasChannelMessageInBucket,
  insertChannelMessageFromHistory,
} from '@/services/realtime/channelMessageAuthority';
import {
  mapEchoMessageToRaw,
  mapEchoMessagesToRaw,
} from '@/services/domain/echoMessageSnapshots';
import { applyEchoHistoryOlderPageFromApi } from '@/services/realtime/echoHistoryChannelApply';
import {
  prefetchChannelMessagesFirstPage,
  shouldSkipChannelMessagePrefetch,
} from '@/services/orchestration/echoWorkspaceChannelPrefetch';

export type MentionNotificationPrefetchTarget = {
  channelId: string;
  anchorMessageId?: string;
};

function cachedMessagesIncludeId(
  cached: readonly unknown[] | undefined,
  messageId: string,
): boolean {
  if (!cached?.length || !messageId) return false;
  return cached.some((row) => {
    const id = (row as { id?: string }).id?.trim();
    return !!id && id === messageId;
  });
}

function mentionPrefetchSummaryPriority(input: {
  summary: EchoAttentionChannelSummary;
  readStateByChannelId: Readonly<Record<string, string | null | undefined>>;
  serverNotificationLevelByServerId: Readonly<
    Record<string, ServerNotificationLevel | undefined>
  >;
  messagesByChannelId: Readonly<Record<string, readonly unknown[] | undefined>>;
  prioritizeChannelIds: ReadonlySet<string>;
}): number | null {
  const channelId = input.summary.channelId.trim();
  if (!channelId) return null;

  const effectivePing =
    input.summary.kind === 'server'
      ? applyAttentionNotificationLevel(
          input.serverNotificationLevelByServerId[
            input.summary.serverId ?? ''
          ] ?? 'mentions',
          input.summary.pingKind ?? null,
        )
      : (input.summary.pingKind ?? null);
  if (!effectivePing) return null;

  const effectiveRead =
    input.readStateByChannelId[channelId] ?? input.summary.lastReadMessageId;
  const unreadPing =
    input.summary.kind === 'server'
      ? isServerChannelUnreadForPingBubble(input.summary, effectiveRead ?? null)
      : isDmChannelMentionUnread(input.summary, effectiveRead ?? null);
  if (!unreadPing) return null;

  const anchor = resolveEchoUnreadUpperBoundMessageId(input.summary);
  const anchorMissing =
    !!anchor &&
    !cachedMessagesIncludeId(input.messagesByChannelId[channelId], anchor);
  const prioritized = input.prioritizeChannelIds.has(channelId);
  const at = Date.parse(input.summary.latestUnreadMessageAt?.trim() ?? '');
  const recency = Number.isFinite(at) ? at : 0;

  // Higher priority first: visible stubs, then missing anchors, then recency.
  return (
    (prioritized ? 1_000_000_000_000 : 0) +
    (anchorMissing ? 100_000_000_000 : 0) +
    recency
  );
}

export function resolveMentionNotificationPrefetchTargets(input: {
  channelAttentionByChannelId: Readonly<
    Record<string, EchoAttentionChannelSummary>
  >;
  readStateByChannelId: Readonly<Record<string, string | null | undefined>>;
  serverNotificationLevelByServerId: Readonly<
    Record<string, ServerNotificationLevel | undefined>
  >;
  messagesByChannelId: Readonly<Record<string, readonly unknown[] | undefined>>;
  prioritizeChannelIds?: readonly string[];
  limit?: number;
}): MentionNotificationPrefetchTarget[] {
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 48);
  const targets: MentionNotificationPrefetchTarget[] = [];
  const seen = new Set<string>();
  const prioritizeChannelIds = new Set(
    (input.prioritizeChannelIds ?? []).map((id) => id.trim()).filter(Boolean),
  );

  const summaries = Object.values(input.channelAttentionByChannelId)
    .map((summary) => ({
      summary,
      priority: mentionPrefetchSummaryPriority({
        summary,
        readStateByChannelId: input.readStateByChannelId,
        serverNotificationLevelByServerId:
          input.serverNotificationLevelByServerId,
        messagesByChannelId: input.messagesByChannelId,
        prioritizeChannelIds,
      }),
    }))
    .filter(
      (
        entry,
      ): entry is { summary: EchoAttentionChannelSummary; priority: number } =>
        entry.priority != null,
    )
    .sort((a, b) => b.priority - a.priority);

  for (const { summary } of summaries) {
    const channelId = summary.channelId.trim();
    if (!channelId || seen.has(channelId)) continue;

    const effectivePing =
      summary.kind === 'server'
        ? applyAttentionNotificationLevel(
            input.serverNotificationLevelByServerId[summary.serverId ?? ''] ??
              'mentions',
            summary.pingKind ?? null,
          )
        : (summary.pingKind ?? null);
    if (!effectivePing) continue;

    const effectiveRead =
      input.readStateByChannelId[channelId] ?? summary.lastReadMessageId;
    const unreadPing =
      summary.kind === 'server'
        ? isServerChannelUnreadForPingBubble(summary, effectiveRead ?? null)
        : isDmChannelMentionUnread(summary, effectiveRead ?? null);

    const cachedCount = input.messagesByChannelId[channelId]?.length ?? 0;
    if (!unreadPing && cachedCount > 0) continue;

    const anchor = unreadPing
      ? resolveEchoUnreadUpperBoundMessageId(summary)
      : undefined;

    seen.add(channelId);
    targets.push({
      channelId,
      ...(anchor ? { anchorMessageId: anchor } : {}),
    });
    if (targets.length >= limit) break;
  }

  return targets;
}

/** Prefetch targets derived from visible stub rows (exact anchor message ids). */
export function resolveMentionNotificationPrefetchTargetsFromStubRows(
  rows: readonly Pick<
    DmMentionNotificationRow,
    'channelId' | 'messageId' | 'preview'
  >[],
): MentionNotificationPrefetchTarget[] {
  const targets: MentionNotificationPrefetchTarget[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.preview !== MENTION_NOTIFICATION_STUB_PREVIEW) continue;
    const channelId = row.channelId.trim();
    const anchorMessageId = row.messageId.trim();
    if (!channelId || !anchorMessageId || seen.has(channelId)) continue;
    if (hasChannelMessageInBucket(channelId, anchorMessageId)) continue;
    seen.add(channelId);
    targets.push({ channelId, anchorMessageId });
  }

  return targets;
}

export function mergeMentionNotificationPrefetchTargets(
  primary: readonly MentionNotificationPrefetchTarget[],
  secondary: readonly MentionNotificationPrefetchTarget[],
): MentionNotificationPrefetchTarget[] {
  const out = [...primary];
  const seen = new Set(primary.map((target) => target.channelId.trim()));

  for (const target of secondary) {
    const channelId = target.channelId.trim();
    if (!channelId || seen.has(channelId)) continue;
    seen.add(channelId);
    out.push(target);
  }

  return out;
}

/**
 * Best-effort background hydrate for mention notification rows: first page when
 * empty, then paginate (or direct fetch) until an unread ping anchor is local.
 */
export async function prefetchMentionNotificationChannelBackground(
  token: string,
  target: MentionNotificationPrefetchTarget,
  opts?: { maxPages?: number; activeChannelId?: string },
): Promise<void> {
  const channelId = target.channelId.trim();
  const anchorMessageId = target.anchorMessageId?.trim();
  const activeChannelId = opts?.activeChannelId?.trim() ?? '';
  const maxPages = Math.min(Math.max(opts?.maxPages ?? 8, 1), 16);
  if (!token.trim() || !channelId) return;

  if (!shouldSkipChannelMessagePrefetch(channelId)) {
    await prefetchChannelMessagesFirstPage(token, channelId, {
      flow: 'prefetchMentionNotificationChannels',
    });
  }

  if (
    !anchorMessageId ||
    hasChannelMessageInBucket(channelId, anchorMessageId)
  ) {
    return;
  }

  try {
    const { message } = await fetchEchoChannelMessage(
      token,
      channelId,
      anchorMessageId,
    );
    insertChannelMessageFromHistory(channelId, mapEchoMessageToRaw(message));
    return;
  } catch {
    // Fall back to paging older history from the cached head.
  }

  for (let page = 0; page < maxPages; page += 1) {
    if (hasChannelMessageInBucket(channelId, anchorMessageId)) return;

    const list = messageReadFacade.getChannelMessages(channelId);
    if (!list.length) break;

    const oldestId = list[0]?.id?.trim();
    if (!oldestId) break;

    const { messages: apiMsgs } = await fetchEchoChannelMessages(
      token,
      channelId,
      {
        before: oldestId,
        limit: ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
      },
    );
    if (!apiMsgs.length) break;

    applyEchoHistoryOlderPageFromApi(
      channelId,
      mapEchoMessagesToRaw(apiMsgs),
      apiMsgs.length,
      activeChannelId,
    );
  }
}

export async function prefetchMentionNotificationChannels(input: {
  token: string;
  targets: readonly MentionNotificationPrefetchTarget[];
  activeChannelId?: string;
}): Promise<void> {
  const token = input.token.trim();
  if (!token || input.targets.length === 0) return;

  await Promise.allSettled(
    input.targets.map((target) =>
      prefetchMentionNotificationChannelBackground(token, target, {
        activeChannelId: input.activeChannelId,
      }),
    ),
  );
}
