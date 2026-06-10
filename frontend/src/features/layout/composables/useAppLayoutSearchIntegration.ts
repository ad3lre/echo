import { computed, provide, ref, type Ref, type ComputedRef } from 'vue';
import { useSearch } from '@/composables/useSearch';
import type { UserForAuthor } from '@/features/chat/chatMessageTypes';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { useServerStore } from '@/stores/server';
import {
  APP_LAYOUT_SEARCH_PANEL_KEY,
  CHAT_SURFACE_SEARCH_KEY,
} from '@/features/layout/chatSurfaceContext';
import type { MessageWithAuthor, Server } from '@shared/types';
import type { ChannelCategory } from '@/composables/useChannels';

export function useAppLayoutSearchIntegration(deps: {
  categoriesForServer: ComputedRef<ChannelCategory[]>;
  activeChannelId: Ref<string>;
  activeChannelMessages: Ref<MessageWithAuthor[]>;
  /** Server members or DM thread participants — not the global Echo roster. */
  searchFilterUsers: ComputedRef<UserForAuthor[]>;
  authSession: ReturnType<typeof useAuthSessionStore>;
  serverStore: ReturnType<typeof useServerStore>;
  isInDMMode: ComputedRef<boolean>;
  echoDmThreadIds: Ref<Set<string>>;
  selectedServer: ComputedRef<Server | null | undefined>;
  handleGoToMessage: (channelId: string, messageId: string) => void;
}) {
  const {
    categoriesForServer,
    activeChannelId,
    activeChannelMessages,
    searchFilterUsers,
    authSession,
    serverStore,
    isInDMMode,
    echoDmThreadIds,
    selectedServer,
    handleGoToMessage,
  } = deps;

  const {
    searchText,
    filterChips,
    allChannels,
    isSearchActive,
    paginatedSearchResults,
    searchResultMessages,
    searchResultPage,
    totalPages,
    goToSearchPage,
    addFilter,
    removeFilter,
    clearSearch,
    searchLoading,
    searchError,
    searchScopeHint,
  } = useSearch(
    categoriesForServer,
    activeChannelId,
    searchFilterUsers,
    activeChannelMessages,
    {
      authToken: computed(() => authSession.accessToken),
      echoSessionReady: computed(() => authSession.isAuthenticated),
      selectedServerId: computed(() => serverStore.selectedServerId),
      isInDMMode,
      echoDmThreadIds,
    },
  );

  function onSearchInput(v: string) {
    searchText.value = v;
  }

  /** Legacy expose fields for `AppLayoutControllerContext` / messaging slice (canonical search state is `useSearch` above). */
  const searchActiveTab = ref('all');
  const searchFilter = ref<Record<string, unknown>>({});
  const searchIsLoading = ref(false);
  const searchResults = ref<unknown[]>([]);
  const searchStatus = ref('idle');

  const searchPanelSelectedServerName = computed(
    () => selectedServer.value?.name ?? '',
  );

  provide(APP_LAYOUT_SEARCH_PANEL_KEY, {
    searchText,
    filterChips,
    allChannels,
    paginatedSearchResults,
    searchResultMessages,
    searchResultPage,
    totalPages,
    selectedServerName: searchPanelSelectedServerName,
    onSearchInput,
    addFilter,
    removeFilter,
    clearSearch,
    goToSearchPage,
    handleGoToMessage,
    searchLoading,
    searchError,
    searchScopeHint,
  });

  provide(CHAT_SURFACE_SEARCH_KEY, { searchText, onSearchInput, clearSearch });

  return {
    searchText,
    filterChips,
    allChannels,
    isSearchActive,
    paginatedSearchResults,
    searchResultMessages,
    searchResultPage,
    totalPages,
    goToSearchPage,
    addFilter,
    removeFilter,
    clearSearch,
    searchLoading,
    searchError,
    searchScopeHint,
    onSearchInput,
    searchActiveTab,
    searchFilter,
    searchIsLoading,
    searchResults,
    searchStatus,
  };
}
