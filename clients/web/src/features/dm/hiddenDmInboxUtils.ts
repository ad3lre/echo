import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { dmPeerUserIdFromChannelId } from '@/features/dm/buildDmPanelUserList';

/**
 * Latest timestamp (ms) of a message **from** `peerId` in any DM channel that maps to that peer.
 */
export function maxIncomingPeerMessageMs(
  peerId: string,
  selfId: string,
  messages: Record<string, readonly RawMessage[] | undefined>,
  echoPeerByChannelId: ReadonlyMap<string, string>,
): number {
  if (!peerId || peerId === selfId) return 0;
  let max = 0;
  const channelIds = new Set<string>([
    ...Object.keys(messages),
    ...echoPeerByChannelId.keys(),
  ]);
  for (const channelId of channelIds) {
    if (dmPeerUserIdFromChannelId(channelId, echoPeerByChannelId) !== peerId) {
      continue;
    }
    const list = messages[channelId];
    if (!list?.length) continue;
    for (const m of list) {
      if (!m || m.authorId !== peerId || m.systemMessage) continue;
      const t = new Date(m.timestamp).getTime();
      if (!Number.isNaN(t) && t > max) max = t;
    }
  }
  return max;
}
