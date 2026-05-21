/** User rows passed to the guild member panel (may include `isGuest`). */
export type MemberListPanelUser = {
  id: string;
  isGuest?: boolean;
};

/**
 * Guild member panel visibility: guests are hidden unless the viewer toggles them on.
 * The signed-in user always remains visible when they are a guest.
 */
export function filterMemberListUsersForPanel<T extends MemberListPanelUser>(
  users: readonly T[],
  opts: { showGuests: boolean; currentUserId?: string | null },
): T[] {
  if (opts.showGuests) return [...users];
  const selfId = opts.currentUserId?.trim();
  return users.filter((u) => !u.isGuest || (selfId != null && u.id === selfId));
}

export function countMemberListGuests(users: readonly MemberListPanelUser[]): number {
  return users.reduce((n, u) => (u.isGuest ? n + 1 : n), 0);
}
