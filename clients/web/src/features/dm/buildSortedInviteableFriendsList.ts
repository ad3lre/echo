import {
  activityRankForPeerUser,
  compareActivityRankDesc,
} from '@/features/dm/buildDmPanelUserList';

export type InviteableFriendRow = {
  id: string;
  name: string;
  pfp: string;
};

type MsgLike = { timestamp?: string };

/** Invite modal friend rows: recent DM activity first, then alphabetical. */
export function buildSortedInviteableFriendsList(input: {
  currentUserId: string | undefined;
  users: readonly { id: string; name: string; pfp: string }[];
  friendIds: readonly string[];
  echoPeerByChannelId: ReadonlyMap<string, string>;
  lastActivityAtMsByChannelId?: ReadonlyMap<string, number>;
  messageKeys: readonly string[];
  getMessages: (channelId: string) => readonly MsgLike[] | undefined;
}): InviteableFriendRow[] {
  const me = input.currentUserId?.trim();
  if (!me) return [];

  const friendIdSet = new Set(input.friendIds);
  const rows = input.users
    .filter((u) => u.id !== me && friendIdSet.has(u.id))
    .map((u) => ({ id: u.id, name: u.name, pfp: u.pfp }));

  const lastActivityAtMsByChannelId =
    input.lastActivityAtMsByChannelId ?? new Map<string, number>();

  const ranks = new Map(
    rows.map((row) => [
      row.id,
      activityRankForPeerUser(
        row.id,
        input.messageKeys,
        input.echoPeerByChannelId,
        input.getMessages,
        lastActivityAtMsByChannelId,
      ),
    ]),
  );

  return [...rows].sort((a, b) => {
    const byActivity = compareActivityRankDesc(
      ranks.get(a.id)!,
      ranks.get(b.id)!,
    );
    if (byActivity !== 0) return byActivity;
    return a.name.localeCompare(b.name);
  });
}
