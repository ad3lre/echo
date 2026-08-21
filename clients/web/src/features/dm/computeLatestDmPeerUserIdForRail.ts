import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  getActiveIndexMap,
  getChannelIndex,
} from '@/features/chat/domain/channelMessageIndex';
import { getLatestDmPeerUserId } from '@/features/dm/buildDmPanelUserList';

/**
 * DM rail “latest peer” uses the message index sorted view (same basis as {@link useAppLayoutMessageActions#getLatestDMUserId}).
 */
export function computeLatestDmPeerUserIdForRail(opts: {
  selfId: string;
  echoPeerByChannelId: ReadonlyMap<string, string>;
  messages: Record<string, RawMessage[] | undefined>;
  orderedOtherUserIds: readonly string[];
  skipPeerUserId?: (userId: string) => boolean;
}): string | null {
  const indexedMessages: Record<
    string,
    readonly { timestamp?: string }[] | undefined
  > = {};
  const channelIds = new Set<string>([
    ...Object.keys(opts.messages),
    ...getActiveIndexMap().keys(),
  ]);
  for (const channelId of channelIds) {
    indexedMessages[channelId] = getChannelIndex(
      channelId,
      opts.messages[channelId] ?? [],
    ).sorted.value as readonly { timestamp?: string }[];
  }
  return getLatestDmPeerUserId({
    selfId: opts.selfId,
    echoPeerByChannelId: opts.echoPeerByChannelId,
    messages: indexedMessages,
    orderedOtherUserIds: [...opts.orderedOtherUserIds],
    skipPeerUserId: opts.skipPeerUserId,
  });
}
