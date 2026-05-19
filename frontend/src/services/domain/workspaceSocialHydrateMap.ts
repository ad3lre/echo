import type { EchoDmThreadFromApi } from '@/api/echoClient';
import type {
  FriendRequestIncomingEntry,
  FriendRequestOutgoingEntry,
  MessageRequestEntry,
} from '@/composables/workspace/types';

export function mapFriendIds(friends: { peerId: string }[]) {
  return friends.map((f) => f.peerId);
}

export function mapFriendRequestsIncoming(
  incoming: { id: string; fromUserId: string }[],
) {
  return incoming.map((r) => ({
    id: r.id,
    fromUserId: r.fromUserId,
  }));
}

export function mapFriendRequestsOutgoing(
  outgoing: { id: string; toUserId: string }[],
) {
  return outgoing.map((r) => ({
    id: r.id,
    toUserId: r.toUserId,
  }));
}

export function mapMessageRequests(
  requests: {
    id: string;
    channelId: string;
    fromUserId: string;
    preview?: string;
  }[],
) {
  return requests.map((r) => ({
    id: r.id,
    channelId: r.channelId,
    fromUserId: r.fromUserId,
    preview: r.preview || '',
  }));
}

/** Social graph + DM threads + blocks (full hydrate path). */
export type WorkspaceSocialSnapshot = {
  friendIds: string[];
  friendRequestsIncoming: FriendRequestIncomingEntry[];
  friendRequestsOutgoing: FriendRequestOutgoingEntry[];
  messageRequests: MessageRequestEntry[];
  dmThreads: EchoDmThreadFromApi[];
  blockedUserIds: string[];
};

/** Friends + message requests only (lightweight refresh path). */
export type WorkspaceSocialRefreshSlice = Pick<
  WorkspaceSocialSnapshot,
  | 'friendIds'
  | 'friendRequestsIncoming'
  | 'friendRequestsOutgoing'
  | 'messageRequests'
  | 'blockedUserIds'
>;

export function workspaceSocialFromHydrateResults(
  friendsRes: { friends: { peerId: string; status: string }[] },
  dmThreadsRes: { threads: EchoDmThreadFromApi[] },
  blockedRes: { blockedUserIds?: string[] },
  friendReqRes: {
    incoming: { id: string; fromUserId: string }[];
    outgoing: { id: string; toUserId: string }[];
  },
  dmReqRes: {
    requests: {
      id: string;
      channelId: string;
      fromUserId: string;
      preview?: string;
    }[];
  },
): WorkspaceSocialSnapshot {
  return {
    friendIds: mapFriendIds(friendsRes.friends),
    friendRequestsIncoming: mapFriendRequestsIncoming(friendReqRes.incoming),
    friendRequestsOutgoing: mapFriendRequestsOutgoing(friendReqRes.outgoing),
    messageRequests: mapMessageRequests(dmReqRes.requests),
    dmThreads: dmThreadsRes.threads,
    blockedUserIds: blockedRes.blockedUserIds ?? [],
  };
}

export function workspaceSocialFromRefreshResults(
  friendsRes: { friends: { peerId: string; status: string }[] },
  blockedRes: { blockedUserIds?: string[] },
  friendReqRes: {
    incoming: { id: string; fromUserId: string }[];
    outgoing: { id: string; toUserId: string }[];
  },
  dmReqRes: {
    requests: {
      id: string;
      channelId: string;
      fromUserId: string;
      preview?: string;
    }[];
  },
): WorkspaceSocialRefreshSlice {
  return {
    friendIds: mapFriendIds(friendsRes.friends),
    friendRequestsIncoming: mapFriendRequestsIncoming(friendReqRes.incoming),
    friendRequestsOutgoing: mapFriendRequestsOutgoing(friendReqRes.outgoing),
    messageRequests: mapMessageRequests(dmReqRes.requests),
    blockedUserIds: blockedRes.blockedUserIds ?? [],
  };
}
