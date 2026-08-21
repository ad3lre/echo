import { computed, type ComputedRef } from 'vue';
import type { WireAppLayoutVoiceAndRealtimeResult } from '../controller/wireAppLayoutVoiceAndRealtime';
import { useAppLayoutMentionAutocompleteUsers } from './useAppLayoutMentionAutocompleteUsers';
import { useAppLayoutMentionAutocompleteRoles } from './useAppLayoutMentionAutocompleteRoles';
import { useAppLayoutSearchIntegration } from './useAppLayoutSearchIntegration';

type Phase2 = WireAppLayoutVoiceAndRealtimeResult;

export type UseAppLayoutMessagingSearchSetupExtras = {
  memberListUsers: ComputedRef<
    readonly {
      id: string;
      name: string;
      pfp: string;
      status?: string;
      timeZone?: string | null;
    }[]
  >;
};

function wireMentionAutocomplete(
  phase2: Phase2,
  extras: UseAppLayoutMessagingSearchSetupExtras,
) {
  const usersForMentionAutocomplete = useAppLayoutMentionAutocompleteUsers({
    activeChannelId: phase2.activeChannelId,
    mainSurface: phase2.mainSurface,
    isPersistedEchoDmThread: phase2.isPersistedEchoDmThread,
    isGroupDM: phase2.isGroupDMComputed,
    activeGroupDM: phase2.activeGroupDM,
    selectedDMUserId: phase2.selectedDMUserId,
    dmPartnerUser: phase2.dmPartnerUser,
    echoDmPeerByChannelId: phase2.echoDmPeerByChannelId,
    workspace: phase2.workspace,
    authSession: phase2.authSession,
    memberListUsers: extras.memberListUsers,
  });
  const rolesForMentionAutocomplete = useAppLayoutMentionAutocompleteRoles({
    mainSurface: phase2.mainSurface,
    selectedServerId: phase2.selectedServerIdRef,
    echoRoleCatalog: phase2.roleUi.echoRoleCatalog,
    echoCapabilitiesForServerId: phase2.roleUi.echoCapabilitiesForServerId,
    lightTheme: computed(() => phase2.themeStore.canonicalTheme === 'light'),
  });
  return { usersForMentionAutocomplete, rolesForMentionAutocomplete };
}

/**
 * Mention autocomplete + search integration. Call after profiles setup
 * (wiring-order markers).
 */
export function useAppLayoutMessagingSearchSetup(
  phase2: Phase2,
  extras: UseAppLayoutMessagingSearchSetupExtras,
) {
  const mentions = wireMentionAutocomplete(phase2, extras);
  const searchIntegration = useAppLayoutSearchIntegration({
    categoriesForServer: phase2.categoriesForServer,
    activeChannelId: phase2.activeChannelId,
    activeChannelMessages: phase2.activeChannelMessages,
    searchFilterUsers: mentions.usersForMentionAutocomplete,
    authSession: phase2.authSession,
    serverStore: phase2.serverStore,
    isInDMMode: phase2.isInDMModeComputed,
    echoDmThreadIds: phase2.echoDmThreadIds,
    selectedServer: phase2.selectedServerEcho,
    handleGoToMessage: phase2.handleGoToMessageDelegated,
  });
  return {
    ...mentions,
    ...searchIntegration,
    clearSearch: searchIntegration.clearSearch,
    assembly: {
      usersForMentionAutocomplete: mentions.usersForMentionAutocomplete,
      rolesForMentionAutocomplete: mentions.rolesForMentionAutocomplete,
      searchText: searchIntegration.searchText,
      filterChips: searchIntegration.filterChips,
      allChannels: searchIntegration.allChannels,
      isSearchActive: searchIntegration.isSearchActive,
      paginatedSearchResults: searchIntegration.paginatedSearchResults,
      searchResultMessages: searchIntegration.searchResultMessages,
      searchResultPage: searchIntegration.searchResultPage,
      totalPages: searchIntegration.totalPages,
      goToSearchPage: searchIntegration.goToSearchPage,
      addFilter: searchIntegration.addFilter,
      removeFilter: searchIntegration.removeFilter,
      clearSearch: searchIntegration.clearSearch,
      searchLoading: searchIntegration.searchLoading,
      searchError: searchIntegration.searchError,
      searchScopeHint: searchIntegration.searchScopeHint,
      onSearchInput: searchIntegration.onSearchInput,
      searchActiveTab: searchIntegration.searchActiveTab,
      searchFilter: searchIntegration.searchFilter,
      searchIsLoading: searchIntegration.searchIsLoading,
      searchResults: searchIntegration.searchResults,
      searchStatus: searchIntegration.searchStatus,
    },
  };
}
