import type { EchoDmThreadFromApi } from '@/api/echoClient';
import {
  fetchEchoBlockedUsers,
  fetchEchoDmMessageRequests,
  fetchEchoDmThreads,
  fetchEchoFriendRequests,
  fetchEchoFriends,
} from '@/api/echoClient';
import {
  workspaceSocialFromHydrateResults,
  workspaceSocialFromRefreshResults,
  type WorkspaceSocialSnapshot,
  type WorkspaceSocialRefreshSlice,
} from '@/features/layout/echoWorkspace/workspaceSocialHydrateMap';

export type { WorkspaceSocialSnapshot, WorkspaceSocialRefreshSlice };

export async function fetchWorkspaceSocialForHydrate(
  token: string,
  isGuest: boolean,
): Promise<WorkspaceSocialSnapshot> {
  const [friendsRes, dmThreadsRes, blockedRes, friendReqRes, dmReqRes] =
    await Promise.all([
      isGuest
        ? Promise.resolve({
            friends: [] as { peerId: string; status: string }[],
          })
        : fetchEchoFriends(token),
      fetchEchoDmThreads(token),
      fetchEchoBlockedUsers(token),
      isGuest
        ? Promise.resolve({
            incoming: [] as { id: string; fromUserId: string }[],
            outgoing: [] as { id: string; toUserId: string }[],
          })
        : fetchEchoFriendRequests(token),
      isGuest
        ? Promise.resolve({
            requests: [] as {
              id: string;
              channelId: string;
              fromUserId: string;
              preview: string;
            }[],
          })
        : fetchEchoDmMessageRequests(token),
    ]);
  return workspaceSocialFromHydrateResults(
    friendsRes,
    dmThreadsRes,
    blockedRes,
    friendReqRes,
    dmReqRes,
  );
}

export async function fetchWorkspaceSocialForRefresh(
  token: string,
  isGuest: boolean,
): Promise<WorkspaceSocialRefreshSlice> {
  if (isGuest) {
    return {
      friendIds: [],
      friendRequestsIncoming: [],
      friendRequestsOutgoing: [],
      messageRequests: [],
      blockedUserIds: [],
    };
  }
  const [friendsRes, blockedRes, reqRes] = await Promise.all([
    fetchEchoFriends(token),
    fetchEchoBlockedUsers(token),
    fetchEchoFriendRequests(token),
  ]);
  const dmReqRes = await fetchEchoDmMessageRequests(token);
  return workspaceSocialFromRefreshResults(
    friendsRes,
    blockedRes,
    reqRes,
    dmReqRes,
  );
}
