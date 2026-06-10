import {
  computed,
  ref,
  shallowRef,
  watch,
  getCurrentInstance,
  onUnmounted,
  type Ref,
} from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import type {
  RawMessage,
  UserForAuthor,
} from '@/features/chat/chatMessageTypes';
import type {
  FilterKey,
  HasType,
  SearchFilters,
  UseSearchApiModeOptions,
} from '@/features/chat/messageSearchTypes';
import type { ChannelCategory } from '@/composables/useChannels';
import { messageReadFacade } from '@/features/chat/domain/messageReadFacade';
import {
  CLIENT_SEARCH_CORPUS_DEBOUNCE_MS,
  CLIENT_SEARCH_FILTER_DEBOUNCE_MS,
  MESSAGES_PER_PAGE,
  apiSearchCriteriaSatisfied,
  applyFilters,
  buildFilterChips,
  categoriesToChannelList,
  channelNameByIdFromList,
  collectLocalSearchMessages,
  computeTotalPagesApiMode,
  computeTotalPagesClientMode,
  computeUseChannelSearchApi,
  computeUseServerSearchApi,
  extractInlineSearchFilters,
  isSearchActiveState,
  searchScopeHintFromFlags,
  shouldBuildLocalSearchCorpus,
  stripFilterPrefixes,
  type MessageWithOrder,
  type SearchApiModeSnapshot,
} from './messageSearchCore';

export type CreateMessageSearchControllerStateDeps = {
  categories: Ref<ChannelCategory[]>;
  activeChannelId: Ref<string>;
  users: Ref<UserForAuthor[]>;
  activeChannelMessages: Ref<MessageWithAuthor[]>;
  apiMode?: UseSearchApiModeOptions;
  apiAccumulated: Ref<MessageWithOrder[]>;
  apiExhausted: Ref<boolean>;
  searchResultPage: Ref<number>;
};

export function createMessageSearchControllerState(
  deps: CreateMessageSearchControllerStateDeps,
) {
  function getIndexedChannelMessages(channelId: string): readonly RawMessage[] {
    return messageReadFacade.getChannelMessages(channelId);
  }

  const searchText = ref('');
  const filters = ref<SearchFilters>({});

  const apiModeSnapshot = computed((): SearchApiModeSnapshot | null =>
    deps.apiMode
      ? {
          echoSessionReady: deps.apiMode.echoSessionReady.value,
          selectedServerId: deps.apiMode.selectedServerId.value,
          isInDMMode: deps.apiMode.isInDMMode.value,
          activeChannelId: deps.activeChannelId.value,
          echoDmThreadIds: deps.apiMode.echoDmThreadIds.value,
        }
      : null,
  );

  const useServerSearchApi = computed(() => {
    const snap = apiModeSnapshot.value;
    if (!snap) return false;
    return computeUseServerSearchApi(true, snap);
  });

  const useChannelSearchApi = computed(() => {
    const snap = apiModeSnapshot.value;
    if (!snap) return false;
    return computeUseChannelSearchApi(true, snap);
  });

  const useApiSearch = computed(
    () => useServerSearchApi.value || useChannelSearchApi.value,
  );

  const allChannels = computed(() =>
    categoriesToChannelList(deps.categories.value),
  );

  const channelNameById = computed(() =>
    channelNameByIdFromList(allChannels.value),
  );

  const filterChips = computed(() => buildFilterChips(filters.value));

  const isSearchActive = computed(() =>
    isSearchActiveState(searchText.value, filters.value),
  );

  const localSearchCorpus = shallowRef<MessageWithOrder[]>([]);
  let corpusDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function rebuildCorpusNow() {
    if (
      !isSearchActive.value ||
      useApiSearch.value ||
      !shouldBuildLocalSearchCorpus(searchText.value, filters.value)
    ) {
      localSearchCorpus.value = [];
      return;
    }
    localSearchCorpus.value = collectLocalSearchMessages({
      searchActive: isSearchActive.value,
      activeChannelId: deps.activeChannelId.value,
      allChannels: allChannels.value,
      users: deps.users.value,
      echoDmThreadIds: deps.apiMode?.echoDmThreadIds.value ?? new Set(),
      hasApiMode: !!deps.apiMode,
      getIndexedMessages: getIndexedChannelMessages,
    });
  }

  function scheduleDebouncedRebuild() {
    if (corpusDebounceTimer) clearTimeout(corpusDebounceTimer);
    corpusDebounceTimer = setTimeout(() => {
      corpusDebounceTimer = null;
      rebuildCorpusNow();
    }, CLIENT_SEARCH_CORPUS_DEBOUNCE_MS);
  }

  watch(
    [
      isSearchActive,
      useApiSearch,
      searchText,
      filters,
      deps.activeChannelId,
      allChannels,
      deps.users,
      () => deps.apiMode?.echoDmThreadIds.value,
    ],
    () => {
      rebuildCorpusNow();
    },
    { immediate: true, deep: true },
  );

  watch(
    () => messageReadFacade.globalResolverVersion.value,
    () => {
      if (!isSearchActive.value || useApiSearch.value) return;
      scheduleDebouncedRebuild();
    },
  );

  const clientSearchResultMessages = ref<MessageWithOrder[]>([]);
  let clientFilterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function recomputeClientSearchResultsNow() {
    if (useApiSearch.value || !isSearchActive.value) {
      clientSearchResultMessages.value = [];
      return;
    }
    const { searchText: normalizedText } = extractInlineSearchFilters(
      searchText.value,
    );
    const filtered = applyFilters(
      localSearchCorpus.value,
      stripFilterPrefixes(normalizedText),
      filters.value,
    );
    clientSearchResultMessages.value = [...filtered].sort(
      (a, b) => (a._order ?? 0) - (b._order ?? 0),
    ) as MessageWithOrder[];
  }

  function scheduleDebouncedClientFilter() {
    if (clientFilterDebounceTimer) clearTimeout(clientFilterDebounceTimer);
    clientFilterDebounceTimer = setTimeout(() => {
      clientFilterDebounceTimer = null;
      recomputeClientSearchResultsNow();
    }, CLIENT_SEARCH_FILTER_DEBOUNCE_MS);
  }

  watch(
    [searchText, filters, localSearchCorpus, useApiSearch, isSearchActive],
    () => {
      scheduleDebouncedClientFilter();
    },
    { deep: true, immediate: true },
  );

  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (corpusDebounceTimer) clearTimeout(corpusDebounceTimer);
      if (clientFilterDebounceTimer) clearTimeout(clientFilterDebounceTimer);
    });
  }

  const searchResultMessages = computed(() =>
    useApiSearch.value && isSearchActive.value
      ? deps.apiAccumulated.value
      : clientSearchResultMessages.value,
  );

  const totalPages = computed(() => {
    if (useApiSearch.value && isSearchActive.value) {
      return computeTotalPagesApiMode({
        accumulatedCount: deps.apiAccumulated.value.length,
        exhausted: deps.apiExhausted.value,
        currentPage: deps.searchResultPage.value,
      });
    }
    return computeTotalPagesClientMode(clientSearchResultMessages.value.length);
  });

  const paginatedSearchResults = computed(() => {
    const start = deps.searchResultPage.value * MESSAGES_PER_PAGE;
    if (useApiSearch.value && isSearchActive.value) {
      return deps.apiAccumulated.value.slice(start, start + MESSAGES_PER_PAGE);
    }
    const all = clientSearchResultMessages.value;
    return all.slice(start, start + MESSAGES_PER_PAGE);
  });

  const apiCriteriaSatisfiedComputed = computed(() =>
    apiSearchCriteriaSatisfied(
      searchText.value,
      filters.value,
      deps.users.value,
      allChannels.value,
    ),
  );

  const searchScopeHint = computed(() =>
    searchScopeHintFromFlags({
      hasApiMode: !!deps.apiMode,
      useServerSearchApi: useServerSearchApi.value,
      useChannelSearchApi: useChannelSearchApi.value,
    }),
  );

  function goToSearchPage(page: number) {
    deps.searchResultPage.value = Math.max(
      0,
      Math.min(page, totalPages.value - 1),
    );
  }

  function addFilter(key: FilterKey, value: string | boolean | HasType) {
    filters.value = { ...filters.value, [key]: value };
  }

  function removeFilter(key: FilterKey) {
    const next = { ...filters.value };
    delete next[key];
    filters.value = next;
  }

  function clearSearch() {
    searchText.value = '';
    filters.value = {};
    deps.searchResultPage.value = 0;
  }

  return {
    searchText,
    filters,
    filterChips,
    allChannels,
    channelNameById,
    users: deps.users,
    isSearchActive,
    displayMessages: computed(() => deps.activeChannelMessages.value),
    searchResultMessages,
    clientSearchResultMessages,
    paginatedSearchResults,
    searchResultPage: deps.searchResultPage,
    totalPages,
    goToSearchPage,
    addFilter,
    removeFilter,
    clearSearch,
    searchScopeHint,
    useApiSearch,
    useServerSearchApi,
    useChannelSearchApi,
    apiCriteriaSatisfied: apiCriteriaSatisfiedComputed,
  };
}
