import type { EchoAttentionChannelSummary } from '@shared/types';
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

export function resolveMentionNotificationPrefetchTargets(input: {
  channelAttentionByChannelId: Readonly<
    Record<string, EchoAttentionChannelSummary>
  >;
  readStateByChannelId: Readonly<Record<string, string | null | undefined>>;
  serverNotificationLevelByServerId: Readonly<
    Record<string, ServerNotificationLevel | undefined>
  >;
  messagesByChannelId: Readonly<Record<string, readonly unknown[] | undefined>>;
  limit?: number;
}): MentionNotificationPrefetchTarget[] {
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 48);
  const targets: MentionNotificationPrefetchTarget[] = [];
  const seen = new Set<string>();

  for (const summary of Object.values(input.channelAttentionByChannelId)) {
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
