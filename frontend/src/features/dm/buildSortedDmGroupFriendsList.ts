import { selectPresence } from '@/services/domain/presence';

export const DM_GROUP_FRIENDS_STATUS_ORDER = {
  online: 0,
  idle: 1,
  do_not_disturb: 2,
  offline: 3,
} as const;

export type DmGroupFriendRow = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
};

type WorkspaceUserRow = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
};

/** Friends list for group-DM picker: exclude self, stable status sort. */
export function buildSortedDmGroupFriendsList(opts: {
  currentUserId: string | undefined;
  users: readonly WorkspaceUserRow[];
  friendIds: readonly string[];
}): DmGroupFriendRow[] {
  const me = opts.currentUserId;
  if (!me) return [];
  const byId = new Map(opts.users.map((u) => [u.id, u]));
  return opts.friendIds
    .map((id) => byId.get(id))
    .filter((u): u is WorkspaceUserRow => u != null && u.id !== me)
    .map((u) => ({
      id: u.id,
      name: u.name,
      pfp: u.pfp,
      status: u.status,
    }))
    .sort((a, b) => {
      const sa = selectPresence({ rowStatus: a.status }).sortOrder;
      const sb = selectPresence({ rowStatus: b.status }).sortOrder;
      return sa - sb;
    });
}
