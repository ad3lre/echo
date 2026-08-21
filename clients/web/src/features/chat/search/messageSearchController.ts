import type { MessageWithAuthor } from '@shared/types';
import {
  computed,
  ref,
  watch,
  onUnmounted,
  getCurrentInstance,
  type Ref,
} from 'vue';
import {
  fetchEchoChannelMessageSearch,
  fetchEchoServerMessageSearch,
  type EchoApiMessage,
} from '@/api/echoClient';
import type {
  RawMessage,
  UserForAuthor,
} from '@/features/chat/chatMessageTypes';
import type { UseSearchApiModeOptions } from '@/features/chat/messageSearchTypes';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import {
  API_BATCH_LIMIT,
  MESSAGES_PER_PAGE,
  SEARCH_DEBOUNCE_MS,
  apiMessagesToDisplay,
  buildEchoMessageSearchParams,
  extractInlineSearchFilters,
  markApiSearchExhaustedFromBatch,
  type MessageWithOrder,
} from './messageSearchCore';
import { createMessageSearchControllerState } from './messageSearchControllerState';

/** Controller owns API timing/cancellation; search view state lives in `messageSearchControllerState`. */
export function createMessageSearchController(
  categories: Ref<ChannelCategory[]>,
  activeChannelId: Ref<string>,
  users: Ref<UserForAuthor[]>,
  activeChannelMessages: Ref<MessageWithAuthor[]>,
  apiMode?: UseSearchApiModeOptions,
) {
  const apiAccumulated = ref<MessageWithOrder[]>([]);
  const apiExhausted = ref(false);
  const apiLoading = ref(false);
  const apiError = ref<string | null>(null);
  const searchResultPage = ref(0);
  let apiRequestSeq = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let apiAbortController: AbortController | null = null;

  const vm = createMessageSearchControllerState({
    categories,
    activeChannelId,
    users,
    activeChannelMessages,
    apiMode,
    apiAccumulated,
    apiExhausted,
    searchResultPage,
  });
  const {
    searchText,
    filters,
    allChannels,
    channelNameById,
    useApiSearch,
    useServerSearchApi,
    isSearchActive,
    clientSearchResultMessages,
    apiCriteriaSatisfied,
  } = vm;
  let normalizingInlineFilters = false;

  function clearDebounceTimer() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function cancelApiSearch(opts?: { exhausted?: boolean }) {
    apiRequestSeq += 1;
    apiAbortController?.abort();
    apiAbortController = null;
    clearDebounceTimer();
    apiAccumulated.value = [];
    apiExhausted.value = opts?.exhausted ?? false;
    apiError.value = null;
    apiLoading.value = false;
  }

  async function runApiSearch(reset: boolean) {
    if (!apiMode || !useApiSearch.value || !isSearchActive.value) return;
    if (!apiCriteriaSatisfied.value) {
      apiAccumulated.value = [];
      apiExhausted.value = true;
      apiError.value = null;
      return;
    }
    const token = apiMode.authToken.value ?? '';

    const seq = ++apiRequestSeq;
    apiAbortController?.abort();
    const abortController = new AbortController();
    apiAbortController = abortController;
    if (reset) {
      apiAccumulated.value = [];
      apiExhausted.value = false;
      searchResultPage.value = 0;
    }
    apiLoading.value = true;
    apiError.value = null;

    const beforeCursor =
      !reset && apiAccumulated.value.length > 0
        ? apiAccumulated.value[apiAccumulated.value.length - 1]!.id
        : undefined;

    try {
      const params = buildEchoMessageSearchParams({
        searchTextRaw: searchText.value,
        filters: filters.value,
        allChannels: allChannels.value,
        users: users.value,
        before: beforeCursor,
      });
      let rows: EchoApiMessage[];
      if (useServerSearchApi.value) {
        const sid = apiMode.selectedServerId.value!;
        const res = await fetchEchoServerMessageSearch(token, sid, params, {
          signal: abortController.signal,
        });
        rows = res.messages;
      } else {
        const cid = activeChannelId.value;
        const res = await fetchEchoChannelMessageSearch(token, cid, params, {
          signal: abortController.signal,
        });
        rows = res.messages;
      }
      if (seq !== apiRequestSeq) return;
      const mapped = apiMessagesToDisplay(
        rows,
        users.value,
        channelNameById.value,
      );
      if (reset) {
        apiAccumulated.value = mapped;
      } else {
        apiAccumulated.value = [...apiAccumulated.value, ...mapped];
      }
      if (markApiSearchExhaustedFromBatch(rows.length)) {
        apiExhausted.value = true;
      }
    } catch (e) {
      if (seq !== apiRequestSeq) return;
      if (e instanceof DOMException && e.name === 'AbortError') return;
      apiError.value = e instanceof Error ? e.message : 'Search failed';
      if (reset) apiAccumulated.value = [];
    } finally {
      if (seq === apiRequestSeq) {
        apiLoading.value = false;
        if (apiAbortController === abortController) apiAbortController = null;
      }
    }
  }

  function scheduleApiSearch() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runApiSearch(true);
    }, SEARCH_DEBOUNCE_MS);
  }

  watch(searchText, (value) => {
    if (normalizingInlineFilters) return;
    // Parse inline filters (e.g. `from:beemo`) but do NOT overwrite the input text.
    // Overwriting the text causes the UI to clear the partially-typed filter value,
    // so `from:beemo` effectively becomes `from:b`.
    const { searchText: _normalizedText, parsedFilters } =
      extractInlineSearchFilters(value);
    const nextFilters = {
      ...filters.value,
      ...parsedFilters,
    };
    const filtersChanged =
      nextFilters.in !== filters.value.in ||
      nextFilters.from !== filters.value.from ||
      nextFilters.mentions !== filters.value.mentions ||
      nextFilters.hasType !== filters.value.hasType;
    if (!filtersChanged) return;
    normalizingInlineFilters = true;
    if (filtersChanged) {
      filters.value = nextFilters;
    }
    queueMicrotask(() => {
      normalizingInlineFilters = false;
    });
  });

  watch(
    [
      searchText,
      filters,
      useApiSearch,
      apiCriteriaSatisfied,
      activeChannelId,
      () => users.value.length,
      () => apiMode?.selectedServerId.value,
    ],
    () => {
      if (!useApiSearch.value || !isSearchActive.value) {
        cancelApiSearch();
        return;
      }
      if (!apiCriteriaSatisfied.value) {
        cancelApiSearch({ exhausted: true });
        return;
      }
      scheduleApiSearch();
    },
    { deep: true },
  );

  async function ensureApiResultsForPage(page: number) {
    if (!useApiSearch.value || !isSearchActive.value) return;
    while (true) {
      const need = (page + 1) * MESSAGES_PER_PAGE;
      if (apiAccumulated.value.length >= need) return;
      if (apiExhausted.value) return;
      if (apiLoading.value) return;
      await runApiSearch(false);
    }
  }

  watch(searchResultPage, (page) => {
    void ensureApiResultsForPage(page);
  });

  watch(
    () =>
      [useApiSearch.value, clientSearchResultMessages.value.length] as const,
    ([api]) => {
      if (!api) searchResultPage.value = 0;
    },
  );

  if (getCurrentInstance()) {
    onUnmounted(() => {
      cancelApiSearch();
    });
  }

  return {
    ...vm,
    searchLoading: computed(() => apiLoading.value),
    searchError: computed(() => apiError.value),
  };
}
