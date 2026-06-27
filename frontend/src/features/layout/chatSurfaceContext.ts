import type { ComputedRef, InjectionKey, Ref } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import type { FilterChip, FilterKey, HasType } from '@/composables/useSearch';
import type { ChannelListEntry } from '@/services/orchestration/messageSearchCore';
/** Incremental migration: optional inject for chat surface; props remain the source of truth until consumers adopt. */
export type ChatSurfaceSearchContext = {
  searchText: Ref<string>;
  onSearchInput: (v: string) => void;
  clearSearch: () => void;
};

export const CHAT_SURFACE_SEARCH_KEY: InjectionKey<ChatSurfaceSearchContext> =
  Symbol('chatSurfaceSearch');

/** Full search UI context for chat header + member column (optional inject). */
export type AppLayoutSearchPanelContext = {
  searchText: Ref<string>;
  filterChips: ComputedRef<FilterChip[]>;
  allChannels: ComputedRef<ChannelListEntry[]>;
  paginatedSearchResults: ComputedRef<
    (MessageWithAuthor & { channelName?: string })[]
  >;
  searchResultMessages: ComputedRef<
    (MessageWithAuthor & { channelName?: string })[]
  >;
  searchResultPage: Ref<number>;
  totalPages: ComputedRef<number>;
  selectedServerName: ComputedRef<string>;
  onSearchInput: (v: string) => void;
  addFilter: (key: FilterKey, value: string | boolean | HasType) => void;
  removeFilter: (key: FilterKey) => void;
  clearSearch: () => void;
  goToSearchPage: (page: number) => void;
  handleGoToMessage: (channelId: string, messageId: string) => void;
  searchLoading: ComputedRef<boolean>;
  searchError: ComputedRef<string | null>;
  searchScopeHint: ComputedRef<string>;
};

export const APP_LAYOUT_SEARCH_PANEL_KEY: InjectionKey<AppLayoutSearchPanelContext> =
  Symbol('appLayoutSearchPanel');
