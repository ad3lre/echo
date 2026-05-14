import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';

/** @deprecated Legacy DM panel list — user rows only from merged inbox. */
export function filterDmPanelInboxUserEntries(
  entries: readonly DmPanelInboxEntry[],
): DmPanelInboxEntry[] {
  return entries.filter((e) => e.kind === 'user');
}
