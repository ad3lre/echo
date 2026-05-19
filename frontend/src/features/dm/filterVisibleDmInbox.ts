import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';

export function filterVisibleDmInboxEntries(
  entries: readonly DmPanelInboxEntry[],
  hidden: {
    isUserHidden: (id: string) => boolean;
    isGroupHidden: (id: string) => boolean;
  },
): DmPanelInboxEntry[] {
  return entries.filter((e) => {
    if (e.kind === 'user') return !hidden.isUserHidden(e.id);
    return !hidden.isGroupHidden(e.id);
  });
}
