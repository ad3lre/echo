type OutgoingReq = { toUserId: string };
type IncomingReq = { fromUserId: string };

/** Profile / popout friendship predicates over workspace social refs. */
export function createWorkspaceFriendshipQueries(deps: {
  friendIds: () => readonly string[];
  friendRequestsOutgoing: () => readonly OutgoingReq[];
  friendRequestsIncoming: () => readonly IncomingReq[];
}) {
  return {
    isEchoUserOutgoingFriendRequest: (uid: string) =>
      deps.friendRequestsOutgoing().some((r) => r.toUserId === uid),
    isEchoUserFriend: (uid: string) => deps.friendIds().includes(uid),
    isEchoUserIncomingFriendRequest: (uid: string) =>
      deps.friendRequestsIncoming().some((r) => r.fromUserId === uid),
  };
}
