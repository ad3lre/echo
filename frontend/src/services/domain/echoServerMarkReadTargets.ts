import type { EchoAttentionChannelSummary } from '@shared/types';
import { compareEchoTimelineIds } from '@/services/domain/echoMessageReadState';

export type EchoServerMarkReadTarget = {
  channelId: string;
  lastReadMessageId: string;
};

export type EchoServerMarkReadPlan = {
  targets: EchoServerMarkReadTarget[];
  channelIdsMissingLatestUnread: string[];
};

export function buildEchoServerMarkReadPlan(params: {
  serverId: string;
  channelAttentionByChannelId: Record<string, EchoAttentionChannelSummary>;
  readStateByChannelId: Record<string, string | null>;
  /**
   * Newest message id we have locally per channel (e.g. from workspace buckets).
   * Used when attention reports unreads but omits `latestUnreadMessageId` / `firstUnreadMessageId`
   * (common for voice channels) so “mark server read” can still advance the cursor.
   */
  latestMessageIdByChannelId?: Record<string, string | null | undefined>;
}): EchoServerMarkReadPlan {
  const serverId = params.serverId.trim();
  if (!serverId) return { targets: [], channelIdsMissingLatestUnread: [] };

  const targets: EchoServerMarkReadTarget[] = [];
  const channelIdsMissingLatestUnread: string[] = [];

  for (const summary of Object.values(params.channelAttentionByChannelId)) {
    if (summary.kind !== 'server' || summary.serverId !== serverId) continue;
    if (summary.unreadCount <= 0) continue;

    const latestUnread = summary.latestUnreadMessageId?.trim() ?? '';
    const firstUnread = summary.firstUnreadMessageId?.trim() ?? '';
    let markTarget =
      latestUnread ||
      (summary.unreadCount === 1 && firstUnread ? firstUnread : '');
    if (!markTarget) {
      const fb =
        params.latestMessageIdByChannelId?.[summary.channelId]?.trim() ?? '';
      if (fb) markTarget = fb;
    }
    if (!markTarget) {
      channelIdsMissingLatestUnread.push(summary.channelId);
      continue;
    }

    const currentCursor =
      params.readStateByChannelId[summary.channelId] ??
      summary.lastReadMessageId;
    const lr = currentCursor?.trim() ?? '';
    if (lr && compareEchoTimelineIds(lr, markTarget) >= 0) continue;

    targets.push({
      channelId: summary.channelId,
      lastReadMessageId: markTarget,
    });
  }

  return { targets, channelIdsMissingLatestUnread };
}

/** DM scope: all unread threads (1:1 + group) for rail “mark all as read”. */
export function buildEchoDmMarkReadPlan(params: {
  channelAttentionByChannelId: Record<string, EchoAttentionChannelSummary>;
  readStateByChannelId: Record<string, string | null>;
  latestMessageIdByChannelId?: Record<string, string | null | undefined>;
}): EchoServerMarkReadPlan {
  const targets: EchoServerMarkReadTarget[] = [];
  const channelIdsMissingLatestUnread: string[] = [];

  for (const summary of Object.values(params.channelAttentionByChannelId)) {
    if (summary.kind !== 'dm') continue;
    if (summary.unreadCount <= 0) continue;

    const latestUnread = summary.latestUnreadMessageId?.trim() ?? '';
    const firstUnread = summary.firstUnreadMessageId?.trim() ?? '';
    let markTarget =
      latestUnread ||
      (summary.unreadCount === 1 && firstUnread ? firstUnread : '');
    if (!markTarget) {
      const fb =
        params.latestMessageIdByChannelId?.[summary.channelId]?.trim() ?? '';
      if (fb) markTarget = fb;
    }
    if (!markTarget) {
      channelIdsMissingLatestUnread.push(summary.channelId);
      continue;
    }

    const currentCursor =
      params.readStateByChannelId[summary.channelId] ??
      summary.lastReadMessageId;
    const lr = currentCursor?.trim() ?? '';
    if (lr && compareEchoTimelineIds(lr, markTarget) >= 0) continue;

    targets.push({
      channelId: summary.channelId,
      lastReadMessageId: markTarget,
    });
  }

  return { targets, channelIdsMissingLatestUnread };
}

/** Newest loaded message id per channel for a server (sidebar + attention fallbacks). */
export function buildLatestMessageIdByChannelIdForServer(params: {
  serverId: string;
  categoriesByServer: Record<
    string,
    Array<{ channels: Array<{ id: string }> }> | undefined
  >;
  messagesByChannelId: Record<
    string,
    Array<{ id?: string | null }> | undefined
  >;
}): Record<string, string> {
  const sid = params.serverId.trim();
  if (!sid) return {};
  const out: Record<string, string> = {};
  const push = (channelId: string) => {
    const cid = channelId.trim();
    if (!cid || out[cid]) return;
    const msgs = params.messagesByChannelId[cid] ?? [];
    const last =
      msgs.length > 0 ? String(msgs[msgs.length - 1]?.id ?? '').trim() : '';
    if (last) out[cid] = last;
  };
  for (const cat of params.categoriesByServer[sid] ?? []) {
    for (const ch of cat.channels) push(ch.id);
  }
  return out;
}
