import type { EchoAttentionChannelSummary, MentionKind } from '@shared/types';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import {
  applyAttentionNotificationLevel,
  isDmChannelMentionUnread,
  isServerChannelUnreadForPingBubble,
  resolveEchoUnreadUpperBoundMessageId,
} from '@shared/attentionPing';
import { messageReadFacade } from '@/features/chat/domain/messageReadFacade';
import { hasChannelMessageInBucket } from '@/services/realtime/channelMessageAuthority';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import {
  collectDmMentionNotifications,
  type DmMentionNotificationRow,
} from '@/features/dm/collectDmMentionNotifications';

/** Preview text for inbox rows waiting on background message hydrate. */
export const MENTION_NOTIFICATION_STUB_PREVIEW = 'Loading mention…';

/** Preview text when background hydrate could not load the mention body. */
export const MENTION_NOTIFICATION_FAILED_PREVIEW =
  'Could not load this mention — open the channel to view it.';

export function mentionNotificationRowsHaveLoadingStubs(
  rows: readonly Pick<DmMentionNotificationRow, 'preview'>[],
): boolean {
  return rows.some((row) => row.preview === MENTION_NOTIFICATION_STUB_PREVIEW);
}

export function applyMentionNotificationHydrationFailures(
  rows: readonly DmMentionNotificationRow[],
  failedChannelIds: ReadonlySet<string>,
): DmMentionNotificationRow[] {
  if (failedChannelIds.size === 0) return [...rows];
  return rows.map((row) => {
    if (
      row.preview !== MENTION_NOTIFICATION_STUB_PREVIEW ||
      !failedChannelIds.has(row.channelId.trim())
    ) {
      return row;
    }
    return {
      ...row,
      preview: MENTION_NOTIFICATION_FAILED_PREVIEW,
    };
  });
}

function pingKindToMentionKinds(
  pingKind: NonNullable<EchoAttentionChannelSummary['pingKind']>,
): MentionKind[] {
  if (pingKind === 'personal') return ['user'];
  if (pingKind === 'role') return ['role'];
  return ['everyone'];
}

function sortMentionNotificationRows(
  rows: DmMentionNotificationRow[],
): DmMentionNotificationRow[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);
    const na = Number.isFinite(ta) ? ta : 0;
    const nb = Number.isFinite(tb) ? tb : 0;
    if (na !== nb) return nb - na;
    return b.messageId.localeCompare(a.messageId);
  });
}

/** Union of locally cached channels and attention channels with unread mention-tier pings. */
export function resolveMentionNotificationScanChannelIds(input: {
  channelAttentionByChannelId: Readonly<
    Record<string, EchoAttentionChannelSummary>
  >;
  readStateByChannelId: Readonly<Record<string, string | null | undefined>>;
  serverNotificationLevelByServerId: Readonly<
    Record<string, ServerNotificationLevel | undefined>
  >;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (channelId: string) => {
    const id = channelId.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  for (const channelId of messageReadFacade.listCachedChannelIds()) {
    add(channelId);
  }

  for (const summary of Object.values(input.channelAttentionByChannelId)) {
    const channelId = summary.channelId.trim();
    if (!channelId) continue;

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
    if (unreadPing) add(channelId);
  }

  return out;
}

/** Placeholder rows from the server attention snapshot when message bodies are not local yet. */
export function buildAttentionStubMentionRows(input: {
  channelAttentionByChannelId: Readonly<
    Record<string, EchoAttentionChannelSummary>
  >;
  readStateByChannelId: Readonly<Record<string, string | null | undefined>>;
  serverNotificationLevelByServerId: Readonly<
    Record<string, ServerNotificationLevel | undefined>
  >;
  resolveChannelLabel: (channelId: string) => string;
}): DmMentionNotificationRow[] {
  const rows: DmMentionNotificationRow[] = [];

  for (const summary of Object.values(input.channelAttentionByChannelId)) {
    const channelId = summary.channelId.trim();
    if (!channelId) continue;

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
    if (!unreadPing) continue;

    const messageId = resolveEchoUnreadUpperBoundMessageId(summary);
    if (!messageId || hasChannelMessageInBucket(channelId, messageId)) continue;

    rows.push({
      key: `${channelId}:${messageId}`,
      channelId,
      channelLabel: input.resolveChannelLabel(channelId),
      messageId,
      authorId: '',
      authorName: '…',
      preview: MENTION_NOTIFICATION_STUB_PREVIEW,
      timestamp:
        summary.latestUnreadMessageAt?.trim() || new Date(0).toISOString(),
      mentionKinds: pingKindToMentionKinds(effectivePing),
    });
  }

  return rows;
}

/**
 * Single feed builder for the mention notifications inbox: server attention for
 * unread ping volume + `messageReadFacade` for hydrated message bodies.
 */
export function collectMentionNotificationsFromAuthority(input: {
  channelAttentionByChannelId: Readonly<
    Record<string, EchoAttentionChannelSummary>
  >;
  readStateByChannelId: Readonly<Record<string, string | null | undefined>>;
  serverNotificationLevelByServerId: Readonly<
    Record<string, ServerNotificationLevel | undefined>
  >;
  selfUserId: string;
  resolveChannelLabel: (channelId: string) => string;
  resolveUserName: (userId: string, authorDisplayName?: string) => string;
  maxItems?: number;
}): DmMentionNotificationRow[] {
  void messageReadFacade.globalResolverVersion.value;

  const max = Math.min(Math.max(input.maxItems ?? 80, 1), 500);
  const channelIds = resolveMentionNotificationScanChannelIds({
    channelAttentionByChannelId: input.channelAttentionByChannelId,
    readStateByChannelId: input.readStateByChannelId,
    serverNotificationLevelByServerId: input.serverNotificationLevelByServerId,
  });

  const messagesByChannelId: Record<string, readonly unknown[]> = {};
  for (const channelId of channelIds) {
    const list = messageReadFacade.getChannelMessages(channelId);
    if (list.length > 0) messagesByChannelId[channelId] = list;
  }

  const fromMessages = collectDmMentionNotifications({
    messagesByChannelId: messagesByChannelId as Record<
      string,
      readonly RawMessage[] | undefined
    >,
    selfUserId: input.selfUserId,
    resolveChannelLabel: input.resolveChannelLabel,
    resolveUserName: input.resolveUserName,
    maxItems: max,
  });

  const byKey = new Map<string, DmMentionNotificationRow>();
  for (const row of buildAttentionStubMentionRows(input)) {
    byKey.set(row.key, row);
  }
  for (const row of fromMessages) {
    byKey.set(row.key, row);
  }

  return sortMentionNotificationRows([...byKey.values()]).slice(0, max);
}

export function buildCachedMessagesMapForPrefetch(
  channelIds: readonly string[],
): Record<string, readonly unknown[]> {
  const out: Record<string, readonly unknown[]> = {};
  for (const channelId of channelIds) {
    const list = messageReadFacade.getChannelMessages(channelId);
    if (list.length > 0) out[channelId] = list;
  }
  return out;
}
