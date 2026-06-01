import type { EchoAttentionChannelSummary } from '@shared/types';
import { resolveEchoUnreadUpperBoundMessageId } from '@shared/attentionPing';
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
  /**
   * Explicit mark-read actions should advance the server cursor even when the local
   * read map already matches the target (stale attention volume can still show badges).
   */
  ignoreLocalCursor?: boolean;
}): EchoServerMarkReadPlan {
  const serverId = params.serverId.trim();
  if (!serverId) return { targets: [], channelIdsMissingLatestUnread: [] };

  const targets: EchoServerMarkReadTarget[] = [];
  const channelIdsMissingLatestUnread: string[] = [];

  for (const summary of Object.values(params.channelAttentionByChannelId)) {
    if (summary.kind !== 'server' || summary.serverId !== serverId) continue;
    if (summary.unreadCount <= 0) continue;

    let markTarget = resolveEchoUnreadUpperBoundMessageId(summary);
    if (!markTarget) {
      const fb =
        params.latestMessageIdByChannelId?.[summary.channelId]?.trim() ?? '';
      if (fb) markTarget = fb;
    }
    if (!markTarget) {
      channelIdsMissingLatestUnread.push(summary.channelId);
      continue;
    }

    if (!params.ignoreLocalCursor) {
      const currentCursor =
        params.readStateByChannelId[summary.channelId] ??
        summary.lastReadMessageId;
      const lr = currentCursor?.trim() ?? '';
      if (lr && compareEchoTimelineIds(lr, markTarget) >= 0) continue;
    }

    targets.push({
      channelId: summary.channelId,
      lastReadMessageId: markTarget,
    });
  }

  return { targets, channelIdsMissingLatestUnread };
}

/** Resolve mark-read targets for channels whose attention row lacks unread anchors. */
export async function resolveEchoMarkReadTargetsForMissingChannels(params: {
  channelIds: string[];
  fetchLatestMessageId: (channelId: string) => Promise<string | null>;
}): Promise<{
  targets: EchoServerMarkReadTarget[];
  unresolvedChannelIds: string[];
}> {
  const targets: EchoServerMarkReadTarget[] = [];
  const unresolvedChannelIds: string[] = [];
  for (const rawId of params.channelIds) {
    const channelId = rawId.trim();
    if (!channelId) continue;
    try {
      const lastReadMessageId = (
        await params.fetchLatestMessageId(channelId)
      )?.trim();
      if (lastReadMessageId) {
        targets.push({ channelId, lastReadMessageId });
      } else {
        unresolvedChannelIds.push(channelId);
      }
    } catch {
      unresolvedChannelIds.push(channelId);
    }
  }
  return { targets, unresolvedChannelIds };
}

export function buildEchoDmMarkReadPlan(params: {
  channelAttentionByChannelId: Record<string, EchoAttentionChannelSummary>;
  readStateByChannelId: Record<string, string | null>;
  latestMessageIdByChannelId?: Record<string, string | null | undefined>;
  ignoreLocalCursor?: boolean;
}): EchoServerMarkReadPlan {
  const targets: EchoServerMarkReadTarget[] = [];
  const channelIdsMissingLatestUnread: string[] = [];

  for (const summary of Object.values(params.channelAttentionByChannelId)) {
    if (summary.kind !== 'dm') continue;
    if (summary.unreadCount <= 0) continue;

    let markTarget = resolveEchoUnreadUpperBoundMessageId(summary);
    if (!markTarget) {
      const fb =
        params.latestMessageIdByChannelId?.[summary.channelId]?.trim() ?? '';
      if (fb) markTarget = fb;
    }
    if (!markTarget) {
      channelIdsMissingLatestUnread.push(summary.channelId);
      continue;
    }

    if (!params.ignoreLocalCursor) {
      const currentCursor =
        params.readStateByChannelId[summary.channelId] ??
        summary.lastReadMessageId;
      const lr = currentCursor?.trim() ?? '';
      if (lr && compareEchoTimelineIds(lr, markTarget) >= 0) continue;
    }

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
