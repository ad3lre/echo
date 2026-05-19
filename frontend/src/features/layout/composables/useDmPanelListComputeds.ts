import { computed, type ComputedRef, type Ref } from 'vue';
import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';
import { filterDmPanelInboxUserEntries } from '@/features/dm/filterDmPanelInboxUserEntries';
import {
  mapGroupDmsToPanelList,
  type GroupDmPanelRow,
} from '@/features/dm/mapGroupDmsToPanelList';

type GroupDmMap = Parameters<typeof mapGroupDmsToPanelList>[0];

export function useDmInboxUsersForPanelComputed(
  dmInboxEntriesForPanel: ComputedRef<readonly DmPanelInboxEntry[]>,
) {
  return computed(() =>
    filterDmPanelInboxUserEntries(dmInboxEntriesForPanel.value),
  );
}

export function useGroupDmPanelListComputed(groupDMs: Ref<GroupDmMap>) {
  return computed<GroupDmPanelRow[]>(() =>
    mapGroupDmsToPanelList(groupDMs.value),
  );
}
