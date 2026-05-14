import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';

export type FavoriteDmInboxSortFns = {
  isUserFavorite: (userId: string) => boolean;
  isGroupFavorite: (channelId: string) => boolean;
};

/**
 * Stable partition: favorites first (preserving recency order within that block),
 * then non-favorites (preserving recency order).
 */
export function sortFavoriteDmInboxFirst(
  entries: readonly DmPanelInboxEntry[],
  fav: FavoriteDmInboxSortFns,
): DmPanelInboxEntry[] {
  const favorite: DmPanelInboxEntry[] = [];
  const rest: DmPanelInboxEntry[] = [];
  for (const e of entries) {
    const isFav =
      e.kind === 'user' ? fav.isUserFavorite(e.id) : fav.isGroupFavorite(e.id);
    if (isFav) favorite.push(e);
    else rest.push(e);
  }
  return [...favorite, ...rest];
}
