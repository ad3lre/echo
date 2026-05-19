import type { EchoAttentionDmSummary } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';

/**
 * Single fallback order for the best available read-state candidate in one channel:
 * latest loaded message id first, then persisted attention snapshot.
 */
export function resolveEchoHistoryLastReadCandidate(params: {
  channelId: string;
  messagesByChannel: Record<string, RawMessage[] | undefined>;
  dmAttentionByChannelId: Record<string, EchoAttentionDmSummary | undefined>;
}): string | null {
  const channelId = params.channelId.trim();
  if (!channelId) return null;

  const list = params.messagesByChannel[channelId];
  const latestMessageId = list?.[list.length - 1]?.id ?? null;
  if (latestMessageId) return latestMessageId;

  const attentionMessageId =
    params.dmAttentionByChannelId[channelId]?.lastMessageId;
  return typeof attentionMessageId === 'string' && attentionMessageId.trim()
    ? attentionMessageId.trim()
    : null;
}
