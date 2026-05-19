import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';

export function filterVisibleDmInboxEntries(
  entries: readonly DmPanelInboxEntry[],
  hidden: {
    isUserHidden: (id: string) => boolean;
    isGroupHidden: (id: string) => boolean;
    /** Never hide the Slack-style self row (`buildDmPanelInboxList` uses id === self). */
    selfUserId?: string;
  },
): DmPanelInboxEntry[] {
  const selfTrim = hidden.selfUserId?.trim();
  return entries.filter((e) => {
    if (e.kind === 'user' && selfTrim && e.id === selfTrim) return true;
    if (e.kind === 'user') return !hidden.isUserHidden(e.id);
    return !hidden.isGroupHidden(e.id);
  });
}
