import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';
import { selectPresence } from '@/services/domain/presence';

export type DMUser = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
  customStatus?: string;
};

export type DMMessageRequest = {
  id: string;
  channelId: string;
  fromUserId: string;
  preview: string;
};

export type DMMessageRequestWithUser = DMMessageRequest & {
  user: DMUser;
};

/**
 * Presentation logic for the DM Inbox Panel.
 * Authority: Data Merging and Domain Ordering.
 */
export const DmInboxPanel = {
  /**
   * Merge friend IDs with user objects and apply presence-based sorting.
   * Authority: Source-of-truth merging.
   */
  getFriendUsers(
    users: DMUser[],
    friendIds: string[],
    currentUserId: string,
  ): DMUser[] {
    const friendSet = new Set(friendIds);
    return users
      .filter((u) => u.id !== currentUserId && friendSet.has(u.id))
      .sort((a, b) => {
        const sa = selectPresence({ rowStatus: a.status }).sortOrder;
        const sb = selectPresence({ rowStatus: b.status }).sortOrder;
        return sa - sb;
      });
  },

  /**
   * Merge raw message requests with sender user details.
   * Authority: Source-of-truth merging.
   */
  getMessageRequestsWithUser(
    requests: DMMessageRequest[],
    users: DMUser[],
  ): DMMessageRequestWithUser[] {
    return requests
      .map((req) => {
        const user = users.find((u) => u.id === req.fromUserId);
        return user ? { ...req, user } : null;
      })
      .filter((r): r is DMMessageRequestWithUser => r !== null);
  },

  /**
   * Calculate total pending friend requests.
   * Authority: Logic consolidation.
   */
  getPendingFriendRequestCount(
    incoming: unknown[],
    outgoing: unknown[],
  ): number {
    return incoming.length + outgoing.length;
  },
};
