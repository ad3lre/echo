import type { Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { computeLatestDmPeerUserIdForRail } from '@/features/dm/computeLatestDmPeerUserIdForRail';

export function createLatestDmPeerUserIdForRailResolver(deps: {
  selfId: Ref<string | undefined>;
  echoPeerByChannelId: () => ReadonlyMap<string, string>;
  messages: () => Record<string, RawMessage[] | undefined>;
  users: { readonly value: Array<{ id: string }> };
  skipPeerUserId?: (userId: string) => boolean;
}) {
  return function getLatestDmPeerUserIdForRail(): string | null {
    return computeLatestDmPeerUserIdForRail({
      selfId: deps.selfId.value ?? '',
      echoPeerByChannelId: deps.echoPeerByChannelId(),
      messages: deps.messages(),
      orderedOtherUserIds: deps.users.value.map((user) => user.id),
      skipPeerUserId: deps.skipPeerUserId,
    });
  };
}
