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
    const markTarget =
      latestUnread ||
      (summary.unreadCount === 1 && firstUnread ? firstUnread : '');
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
