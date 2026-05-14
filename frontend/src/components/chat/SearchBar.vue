<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from 'vue';
import {
  icons,
  channelIcons,
  getChannelIcon,
  getChannelDisplayName,
} from '@/assets/icons';
import type { FilterKey, FilterChip, HasType } from '@/composables/useSearch';
import type { UserForAuthor } from '@/features/chat/chatMessageTypes';
import type { MessageWithAuthor } from '@shared/types';
import SearchMessageRow from './SearchMessageRow.vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import {
  detectActiveSearchInlineFilter,
  removeInlineFilterToken,
  type ActiveSearchInlineFilter,
} from './searchInlineFilterInput';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    filterChips: FilterChip[];
    channels: { id: string; name: string }[];
    users: UserForAuthor[];
    searchResults?: (MessageWithAuthor & { channelName?: string })[];
    totalResults?: number;
    currentPage?: number;
    totalPages?: number;
    placeholder?: string;
    /** When true (e.g. in DMs), hide channel/user filters; only mentions and has: apply. */
    dmMode?: boolean;
    /**
     * How much horizontal space to reserve on the right for overlay panels.
     * Used to clamp the dropdown width so it doesn't visually collide.
     */
    reservedRightPx?: number;
    /**
     * Extra vertical gap (in px) between the input and the dropdown.
     * Useful for DM header alignment where we don't want extra spacing.
     */
    dropdownGapPx?: number;
    /** Extra horizontal padding added around the dropdown width/position. */
    dropdownHorizontalPadPx?: number;
    /** Live vs client-only search explanation (Echo production readiness). */
    searchScopeHint?: string;
    searchLoading?: boolean;
    searchError?: string | null;
    /** Teleported dropdown z-index (useful for full-screen mobile search overlays). */
    dropdownZIndex?: number;
  }>(),
  {
    dmMode: false,
    reservedRightPx: undefined,
    dropdownGapPx: undefined,
    dropdownHorizontalPadPx: undefined,
    searchScopeHint: '',
    searchLoading: false,
    searchError: null,
    dropdownZIndex: 100,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  addFilter: [key: FilterKey, value: string | boolean | HasType];
  removeFilter: [key: FilterKey];
  clearSearch: [];
  goToPage: [page: number];
  goToMessage: [channelId: string, messageId: string];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const dropdownRef = ref<HTMLDivElement | null>(null);
const isDropdownOpen = ref(false);
const dropdownMode = ref<'in' | 'from' | 'mentions' | 'has' | null>(null);
const filterPrefix = ref('');
const highlightedIndex = ref(0);
const caretIndex = ref(0);
const activeInlineFilter = ref<ActiveSearchInlineFilter | null>(null);
const recentSearches = ref<string[]>([]);
let persistSearchTimer: number | null = null;

const SEARCH_HISTORY_STORAGE_KEY = 'echo-search-history-v1';
const MAX_SEARCH_HISTORY = 3;

const inputValue = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
});

const HAS_TYPES: { id: HasType; label: string }[] = [
  { id: 'image', label: 'Image' },
  { id: 'gif', label: 'GIF' },
  { id: 'link', label: 'Link (excl. GIF links)' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'docs', label: 'Document' },
];

const filterOptionsFull = [
  { id: 'in' as const, label: 'In channel', icon: channelIcons.text },
  { id: 'from' as const, label: 'From user', icon: icons.usersAvatar },
  { id: 'mentions' as const, label: 'Mentions', icon: null },
  { id: 'has' as const, label: 'Has (image, gif, link…)', icon: icons.list },
];
const filterOptions = computed(() =>
  props.dmMode
    ? filterOptionsFull.filter((o) => o.id === 'mentions' || o.id === 'has')
    : filterOptionsFull,
);
const pickerFilterOptions = computed(() =>
  filterOptions.value.filter((o) => o.id !== dropdownMode.value),
);

function normalizeSearchTerm(term: string): string {
  return term.replace(/\s+/g, ' ').trim();
}

function loadSearchHistory() {
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) {
      recentSearches.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      recentSearches.value = [];
      return;
    }
    recentSearches.value = parsed
      .map((entry) =>
        typeof entry === 'string' ? normalizeSearchTerm(entry) : '',
      )
      .filter((entry) => entry.length > 0)
      .slice(0, MAX_SEARCH_HISTORY);
  } catch {
    recentSearches.value = [];
  }
}

function saveSearchHistory() {
  try {
    window.localStorage.setItem(
      SEARCH_HISTORY_STORAGE_KEY,
      JSON.stringify(recentSearches.value),
    );
  } catch {
    /* ignore storage write errors */
  }
}

function persistRecentSearch(term: string) {
  const normalized = normalizeSearchTerm(term);
  if (!normalized) return;
  const withoutDupes = recentSearches.value.filter(
    (item) => item.toLowerCase() !== normalized.toLowerCase(),
  );
  recentSearches.value = [normalized, ...withoutDupes].slice(
    0,
    MAX_SEARCH_HISTORY,
  );
  saveSearchHistory();
}

function scheduleRecentSearchPersist(term: string) {
  if (persistSearchTimer !== null) {
    window.clearTimeout(persistSearchTimer);
    persistSearchTimer = null;
  }
  const normalized = normalizeSearchTerm(term);
  if (normalized.length < 2) return;
  persistSearchTimer = window.setTimeout(() => {
    persistRecentSearch(normalized);
    persistSearchTimer = null;
  }, 550);
}

function syncCaretFromInput(target?: HTMLInputElement | null) {
  const el = target ?? inputRef.value;
  if (!el) {
    caretIndex.value = inputValue.value.length;
    return;
  }
  caretIndex.value = el.selectionStart ?? el.value.length;
}

function onInput(event: Event) {
  const el = event.target as HTMLInputElement;
  syncCaretFromInput(el);
  inputValue.value = el.value;
}

watch([inputValue, caretIndex], ([val]) => {
  const detected = detectActiveSearchInlineFilter(val, caretIndex.value);
  if (detected) {
    if (props.dmMode && (detected.mode === 'in' || detected.mode === 'from')) {
      activeInlineFilter.value = null;
      dropdownMode.value = null;
      return;
    }
    activeInlineFilter.value = detected;
    dropdownMode.value = detected.mode;
    filterPrefix.value = detected.prefix;
    isDropdownOpen.value = true;
    highlightedIndex.value = 0;
  } else {
    activeInlineFilter.value = null;
    dropdownMode.value = null;
  }
});
watch(inputValue, (val) => {
  scheduleRecentSearchPersist(val);
});

const dropdownOptions = computed(() => {
  if (!dropdownMode.value) return [];
  const raw = filterPrefix.value.toLowerCase();
  const p =
    dropdownMode.value === 'in'
      ? raw.replace(/^#/, '')
      : dropdownMode.value === 'from' || dropdownMode.value === 'mentions'
        ? raw.replace(/^@/, '')
        : raw;
  if (dropdownMode.value === 'in') {
    return props.channels.filter((c) => c.name.toLowerCase().includes(p));
  }
  if (dropdownMode.value === 'from' || dropdownMode.value === 'mentions') {
    return props.users.filter((u) => u.name.toLowerCase().includes(p));
  }
  if (dropdownMode.value === 'has') {
    return HAS_TYPES.filter(
      (t) => t.label.toLowerCase().includes(p) || t.id.includes(p),
    );
  }
  return [];
});

const channelOptions = computed(() =>
  dropdownMode.value === 'in'
    ? (dropdownOptions.value as { id: string; name: string }[])
    : [],
);
const userOptions = computed(() =>
  dropdownMode.value === 'from' || dropdownMode.value === 'mentions'
    ? (dropdownOptions.value as UserForAuthor[])
    : [],
);
const hasTypeOptions = computed(() =>
  dropdownMode.value === 'has'
    ? (dropdownOptions.value as { id: HasType; label: string }[])
    : [],
);

function openFilterPicker(mode: 'in' | 'from' | 'mentions' | 'has') {
  activeInlineFilter.value = null;
  dropdownMode.value = mode;
  filterPrefix.value = '';
  highlightedIndex.value = 0;
  isDropdownOpen.value = true;
}

function selectOption(
  opt: { id: string; name: string } | { id: HasType; label: string },
) {
  if (dropdownMode.value) {
    const mode = dropdownMode.value;
    if (activeInlineFilter.value?.mode === mode) {
      inputValue.value = removeInlineFilterToken(
        inputValue.value,
        activeInlineFilter.value,
      );
    }
    if (mode === 'has') {
      emit('addFilter', 'hasType', (opt as { id: HasType }).id);
    } else {
      const channelOrUser = opt as { id: string; name: string };
      emit('addFilter', mode, channelOrUser.name ?? channelOrUser.id);
    }
    activeInlineFilter.value = null;
    dropdownMode.value = null;
    inputRef.value?.focus();
    syncCaretFromInput();
  }
}

function scrollHighlightedIntoView() {
  nextTick(() => {
    const el = dropdownRef.value?.querySelector(
      `[data-option-index="${highlightedIndex.value}"]`,
    );
    (el as HTMLElement)?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  });
}

function onInputFocus() {
  syncCaretFromInput();
  isDropdownOpen.value = true;
}

function applyRecentSearch(term: string) {
  inputValue.value = term;
  isDropdownOpen.value = true;
  nextTick(() => {
    if (!inputRef.value) return;
    const len = inputRef.value.value.length;
    inputRef.value.focus();
    inputRef.value.setSelectionRange(len, len);
    syncCaretFromInput(inputRef.value);
  });
}

function focusSearchInput(selectAll = false) {
  inputRef.value?.focus();
  isDropdownOpen.value = true;
  if (selectAll && inputRef.value) {
    inputRef.value.select();
  }
  syncCaretFromInput();
}

function closeDropdown() {
  isDropdownOpen.value = false;
  dropdownMode.value = null;
}

/**
 * Dropdown visibility is focus-driven, not content-driven.
 * It closes on: blur/outside-click, Escape, or explicit close (× button).
 * No watcher force-closes it based on whether text is empty — the "Add filter"
 * suggestions panel is useful when focused with no input.
 */

function closeSearch() {
  emit('clearSearch');
  closeDropdown();
  inputRef.value?.blur();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (dropdownMode.value) {
      dropdownMode.value = null;
    } else {
      isDropdownOpen.value = false;
    }
    return;
  }
  if (e.key === 'Enter' && !dropdownMode.value) {
    const normalized = normalizeSearchTerm(inputValue.value);
    if (normalized.length >= 2) persistRecentSearch(normalized);
    return;
  }
  if (!dropdownMode.value || dropdownOptions.value.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightedIndex.value = Math.min(
      highlightedIndex.value + 1,
      dropdownOptions.value.length - 1,
    );
    scrollHighlightedIntoView();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
    scrollHighlightedIntoView();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const opt = dropdownOptions.value[highlightedIndex.value];
    if (opt) selectOption(opt);
  }
}

const isSearchActive = computed(
  () => props.modelValue.trim().length > 0 || props.filterChips.length > 0,
);

const showSearchResults = computed(
  () => isSearchActive.value && !dropdownMode.value,
);

type MessageWithChannel = MessageWithAuthor & { channelName?: string };
const searchResultsByChannel = computed(() => {
  const results = (props.searchResults ?? []) as MessageWithChannel[];
  const groups: { channelName: string; messages: MessageWithChannel[] }[] = [];
  const seen = new Map<string, number>();
  for (const msg of results) {
    const name = msg.channelName ?? 'Unknown';
    const idx = seen.get(name);
    if (idx !== undefined) {
      groups[idx]!.messages.push(msg);
    } else {
      seen.set(name, groups.length);
      groups.push({ channelName: name, messages: [msg] });
    }
  }
  return groups;
});

const dropdownPosition = ref({ top: 0, left: 0, width: '', height: '' });
const dropdownStyle = computed(() => ({
  top: `${dropdownPosition.value.top}px`,
  left: `${dropdownPosition.value.left}px`,
  width: dropdownPosition.value.width,
  zIndex: props.dropdownZIndex,
  ...(dropdownPosition.value.height && {
    height: dropdownPosition.value.height,
  }),
}));

watch(
  [
    isDropdownOpen,
    dropdownMode,
    showSearchResults,
    () => dropdownOptions.value.length,
  ],
  async () => {
    if (isDropdownOpen.value && containerRef.value) {
      await nextTick();
      requestAnimationFrame(() => {
        const el = containerRef.value;
        if (!el || !isDropdownOpen.value) return;
        const rect = el.getBoundingClientRect();
        const gap =
          props.dropdownGapPx ??
          (props.dmMode ? 0 : showSearchResults.value ? 4 : 8);
        const horizontalPad = props.dropdownHorizontalPadPx ?? 16;
        const top = rect.bottom + gap;
        const viewportWidth =
          window.innerWidth || document.documentElement.clientWidth;
        let left = rect.left - horizontalPad;
        let widthPx = rect.width + horizontalPad * 2;
        const reservedRight =
          props.reservedRightPx ?? (props.dmMode ? 360 : 680);
        const maxRight = viewportWidth - reservedRight;
        if (left + widthPx > maxRight) {
          widthPx = Math.max(260, maxRight - left);
        }
        dropdownPosition.value = {
          top,
          left,
          width: `${widthPx}px`,
          height: showSearchResults.value ? `calc(100vh - ${top}px)` : '',
        };
      });
    }
  },
);

function handlePointerDown(event: PointerEvent) {
  if (!isDropdownOpen.value) return;

  const target = event.target as Node | null;
  if (!target) return;

  if (
    containerRef.value?.contains(target) ||
    dropdownRef.value?.contains(target)
  ) {
    return;
  }

  closeDropdown();
  inputRef.value?.blur();
}

function onGlobalSearchFocus(event: Event) {
  const custom = event as CustomEvent<{ selectAll?: boolean }>;
  focusSearchInput(!!custom.detail?.selectAll);
}

onMounted(() => {
  loadSearchHistory();
  window.addEventListener('pointerdown', handlePointerDown, true);
  window.addEventListener(
    'echo:focus-search',
    onGlobalSearchFocus as EventListener,
  );
});

onBeforeUnmount(() => {
  if (persistSearchTimer !== null) {
    window.clearTimeout(persistSearchTimer);
    persistSearchTimer = null;
  }
  window.removeEventListener('pointerdown', handlePointerDown, true);
  window.removeEventListener(
    'echo:focus-search',
    onGlobalSearchFocus as EventListener,
  );
});
</script>

<style scoped lang="scss">
/* Theme-aware caret (input used `text-white` before; caret must follow --text). */
.search-bar-input {
  caret-color: var(--text);
}

/* Square panel — override global .chat-liquid-glass-menu radius */
.search-filter-dropdown {
  border-radius: 0;
}

.search-filter-dropdown-inner {
  position: relative;
  z-index: 1;
  min-height: 0;
}

.search-filter-option:hover {
  background-color: var(--vue-auto-001);
}
</style>

<template>
  <div
    ref="containerRef"
    class="search-bar relative flex h-full w-full min-w-0"
  >
    <!-- Input row - compact, no chips above -->
    <div class="relative flex h-full flex-1 items-center gap-2 px-3 py-1.5">
      <input
        ref="inputRef"
        :value="inputValue"
        type="text"
        name="echo-message-search-native"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        data-lpignore="true"
        :placeholder="placeholder || 'Search'"
        class="search-bar-input flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
        @input="onInput"
        @focus="onInputFocus"
        @click="syncCaretFromInput()"
        @keydown="onKeydown"
        @keyup="syncCaretFromInput()"
        @select="syncCaretFromInput()"
      />
      <button
        v-if="isSearchActive || isDropdownOpen"
        type="button"
        aria-label="Close search"
        class="flex-shrink-0 p-0.5 rounded hover:bg-glass-hover transition-colors text-muted hover:text-foreground"
        @click="closeSearch"
      >
        ×
      </button>
      <img
        v-else
        :src="icons.search"
        alt=""
        class="h-4 w-4 flex-shrink-0 filter invert opacity-40"
      />
    </div>

    <!-- Dropdown: chips + filter options or search results (opens on focus) -->
    <Teleport to="body">
      <div
        v-show="isDropdownOpen"
        ref="dropdownRef"
        class="search-filter-dropdown chat-liquid-glass-menu fixed z-[100] flex min-w-[280px] flex-col overflow-hidden"
        :style="dropdownStyle"
      >
        <div
          class="search-filter-dropdown-inner flex min-h-full flex-col overflow-hidden"
          :class="showSearchResults ? 'flex-1 min-h-0' : 'max-h-64'"
        >
          <div
            class="search-filter-dropdown-scroll flex flex-1 min-h-0 flex-col py-1.5"
            :class="
              showSearchResults
                ? 'overflow-y-auto custom-scrollbar'
                : 'overflow-y-auto custom-scrollbar max-h-64'
            "
            v-scrollbar-on-scroll
          >
            <!-- Applied filters as bubbles -->
            <div
              v-if="filterChips.length > 0"
              class="flex flex-wrap items-center gap-1.5 px-3 pb-1.5 mb-1.5 shrink-0"
            >
              <button
                v-for="chip in filterChips"
                :key="`${chip.key}-${chip.value}`"
                type="button"
                class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-glass-3 text-foreground hover:bg-glass-active transition-colors"
                @click="emit('removeFilter', chip.key)"
              >
                <span>{{ chip.label }}</span>
                <span class="opacity-70 hover:opacity-100">×</span>
              </button>
            </div>

            <!-- Search results: messages list (compact side panel) -->
            <template v-if="showSearchResults">
              <div class="px-4 py-1.5 text-xs text-muted">
                {{ totalResults ?? 0 }} message{{
                  (totalResults ?? 0) === 1 ? '' : 's'
                }}
                found
              </div>
              <div
                v-if="searchScopeHint"
                class="px-4 pb-1 text-[11px] leading-snug text-muted opacity-90"
              >
                {{ searchScopeHint }}
              </div>
              <div v-if="searchLoading" class="px-4 py-0.5 text-xs text-muted">
                Searching…
              </div>
              <div
                v-if="searchError"
                class="px-4 py-0.5 text-xs text-foreground opacity-80"
                role="alert"
              >
                {{ searchError }}
              </div>
              <template
                v-for="group in searchResultsByChannel"
                :key="group.channelName"
              >
                <div
                  class="px-4 py-1.5 mt-2 first:mt-0 text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-2"
                >
                  <img
                    :src="
                      getChannelIcon({ name: group.channelName, type: 'text' })
                    "
                    alt=""
                    class="h-3.5 w-3.5 filter invert opacity-60"
                  />
                  <span>{{ getChannelDisplayName(group.channelName) }}</span>
                </div>
                <SearchMessageRow
                  v-for="(msg, idx) in group.messages"
                  :key="msg.id ?? `sr-${group.channelName}-${idx}`"
                  :message="msg"
                  @go-to-message="
                    (chId, msgId) => emit('goToMessage', chId, msgId)
                  "
                />
              </template>
              <div
                v-if="(totalPages ?? 1) > 1"
                class="flex items-center justify-between gap-2 px-4 py-2"
              >
                <button
                  type="button"
                  class="text-xs text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  :disabled="(currentPage ?? 0) <= 0"
                  @click="emit('goToPage', (currentPage ?? 0) - 1)"
                >
                  ← Previous
                </button>
                <span class="text-xs text-muted">
                  {{ (currentPage ?? 0) + 1 }} / {{ totalPages ?? 1 }}
                </span>
                <button
                  type="button"
                  class="text-xs text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  :disabled="(currentPage ?? 0) >= (totalPages ?? 1) - 1"
                  @click="emit('goToPage', (currentPage ?? 0) + 1)"
                >
                  Next →
                </button>
              </div>
            </template>

            <!-- Picker mode: channel/user list -->
            <template v-else-if="dropdownMode === 'in'">
              <div
                v-if="pickerFilterOptions.length > 0"
                class="mb-1 shrink-0 border-b border-border pb-1.5"
              >
                <div
                  class="px-3 py-1.5 text-xs text-muted uppercase tracking-wider"
                >
                  Add filter
                </div>
                <button
                  v-for="opt in pickerFilterOptions"
                  :key="`picker-top-${opt.id}`"
                  type="button"
                  class="search-filter-option flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors"
                  @click.stop="openFilterPicker(opt.id)"
                >
                  <span
                    v-if="opt.icon"
                    class="flex h-5 w-5 flex-shrink-0 items-center justify-center"
                  >
                    <img
                      :src="opt.icon"
                      alt=""
                      class="h-4 w-4 filter invert opacity-60"
                    />
                  </span>
                  <span
                    v-else
                    class="flex h-5 w-5 flex-shrink-0 items-center justify-center text-base font-semibold text-muted"
                  >
                    @
                  </span>
                  <span class="text-foreground">{{ opt.label }}</span>
                </button>
              </div>
              <div
                class="px-3 py-1.5 text-xs text-muted uppercase tracking-wider"
              >
                Select channel
              </div>
              <button
                v-for="(ch, idx) in channelOptions"
                :key="ch.id"
                type="button"
                :data-option-index="idx"
                class="search-filter-option flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors"
                :class="{ 'bg-glass-3': idx === highlightedIndex }"
                @click.stop="selectOption(ch)"
              >
                <img
                  :src="getChannelIcon({ name: ch.name, type: 'text' })"
                  alt=""
                  class="h-4 w-4 filter invert opacity-50"
                />
                <span class="text-foreground">{{
                  getChannelDisplayName(ch.name)
                }}</span>
              </button>
              <div
                v-if="channelOptions.length === 0"
                class="px-3 py-4 text-sm text-muted text-center"
              >
                No channels match
              </div>
            </template>
            <template v-else-if="dropdownMode === 'from'">
              <div
                v-if="pickerFilterOptions.length > 0"
                class="mb-1 shrink-0 border-b border-border pb-1.5"
              >
                <div
                  class="px-3 py-1.5 text-xs text-muted uppercase tracking-wider"
                >
                  Add filter
                </div>
                <button
                  v-for="opt in pickerFilterOptions"
                  :key="`picker-top-${opt.id}`"
                  type="button"
                  class="search-filter-option flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors"
                  @click.stop="openFilterPicker(opt.id)"
                >
                  <span
                    v-if="opt.icon"
                    class="flex h-5 w-5 flex-shrink-0 items-center justify-center"
                  >
                    <img
                      :src="opt.icon"
                      alt=""
                      class="h-4 w-4 filter invert opacity-60"
                    />
                  </span>
                  <span
                    v-else
                    class="flex h-5 w-5 flex-shrink-0 items-center justify-center text-base font-semibold text-muted"
                  >
                    @
                  </span>
                  <span class="text-foreground">{{ opt.label }}</span>
                </button>
              </div>
              <div
                class="px-3 py-1.5 text-xs text-muted uppercase tracking-wider"
              >
                From user
              </div>
              <button
                v-for="(u, idx) in userOptions"
                :key="u.id"
                type="button"
                :data-option-index="idx"
                class="search-filter-option flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors"
                :class="{ 'bg-glass-3': idx === highlightedIndex }"
                @click.stop="selectOption(u)"
              >
                <div class="relative h-6 w-6 overflow-hidden rounded-full">
                  <PausedGifAvatar
                    :src="safeImageUrl(u.pfp)"
                    :alt="u.name"
                    :session-key="u.id"
                    img-class="rounded-full object-cover"
                  />
                </div>
                <span class="text-foreground">{{ u.name }}</span>
              </button>
              <div
                v-if="userOptions.length === 0"
                class="px-3 py-4 text-sm text-muted text-center"
              >
                No users match
              </div>
            </template>
            <template v-else-if="dropdownMode === 'mentions'">
              <div
                v-if="pickerFilterOptions.length > 0"
                class="mb-1 shrink-0 border-b border-border pb-1.5"
              >
                <div
                  class="px-3 py-1.5 text-xs text-muted uppercase tracking-wider"
                >
                  Add filter
                </div>
                <button
                  v-for="opt in pickerFilterOptions"
                  :key="`picker-top-${opt.id}`"
                  type="button"
                  class="search-filter-option flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors"
                  @click.stop="openFilterPicker(opt.id)"
                >
                  <span
                    v-if="opt.icon"
                    class="flex h-5 w-5 flex-shrink-0 items-center justify-center"
                  >
                    <img
                      :src="opt.icon"
                      alt=""
                      class="h-4 w-4 filter invert opacity-60"
                    />
                  </span>
                  <span
                    v-else
                    class="flex h-5 w-5 flex-shrink-0 items-center justify-center text-base font-semibold text-muted"
                  >
                    @
                  </span>
                  <span class="text-foreground">{{ opt.label }}</span>
                </button>
              </div>
              <div
                class="px-3 py-1.5 text-xs text-muted uppercase tracking-wider"
              >
                Mentions
              </div>
              <button
                v-for="(u, idx) in userOptions"
                :key="u.id"
                type="button"
                :data-option-index="idx"
                class="search-filter-option flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors"
                :class="{ 'bg-glass-3': idx === highlightedIndex }"
                @click.stop="selectOption(u)"
              >
                <div class="relative h-6 w-6 overflow-hidden rounded-full">
                  <PausedGifAvatar
                    :src="safeImageUrl(u.pfp)"
                    :alt="u.name"
                    :session-key="u.id"
                    img-class="rounded-full object-cover"
                  />
                </div>
                <span class="text-foreground">@{{ u.name }}</span>
              </button>
              <div
                v-if="userOptions.length === 0"
                class="px-3 py-4 text-sm text-muted text-center"
              >
                No users match
              </div>
            </template>
            <template v-else-if="dropdownMode === 'has'">
              <div
                v-if="pickerFilterOptions.length > 0"
                class="mb-1 shrink-0 border-b border-border pb-1.5"
              >
                <div
                  class="px-3 py-1.5 text-xs text-muted uppercase tracking-wider"
                >
                  Add filter
                </div>
                <button
                  v-for="opt in pickerFilterOptions"
                  :key="`picker-top-${opt.id}`"
                  type="button"
                  class="search-filter-option flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors"
                  @click.stop="openFilterPicker(opt.id)"
                >
                  <span
                    v-if="opt.icon"
                    class="flex h-5 w-5 flex-shrink-0 items-center justify-center"
                  >
                    <img
                      :src="opt.icon"
                      alt=""
                      class="h-4 w-4 filter invert opacity-60"
                    />
                  </span>
                  <span
                    v-else
                    class="flex h-5 w-5 flex-shrink-0 items-center justify-center text-base font-semibold text-muted"
                  >
                    @
                  </span>
                  <span class="text-foreground">{{ opt.label }}</span>
                </button>
              </div>
              <div
                class="px-3 py-1.5 text-xs text-muted uppercase tracking-wider"
              >
                Has media type
              </div>
              <button
                v-for="(t, idx) in hasTypeOptions"
                :key="t.id"
                type="button"
                :data-option-index="idx"
                class="search-filter-option flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors"
                :class="{ 'bg-glass-3': idx === highlightedIndex }"
                @click.stop="selectOption(t)"
              >
                <span class="text-foreground">{{ t.label }}</span>
                <span class="text-xs text-muted">has:{{ t.id }}</span>
              </button>
              <div
                v-if="hasTypeOptions.length === 0"
                class="px-3 py-4 text-sm text-muted text-center"
              >
                No types match
              </div>
            </template>

            <!-- Filter options: selectable like before (when not in picker mode) -->
            <template v-else>
              <div
                v-if="recentSearches.length > 0"
                class="mb-1 shrink-0 border-b border-border pb-1.5"
              >
                <div
                  class="px-3 py-1.5 text-xs text-muted uppercase tracking-wider"
                >
                  Recent searches
                </div>
                <button
                  v-for="term in recentSearches"
                  :key="`recent-${term}`"
                  type="button"
                  class="search-filter-option flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors"
                  @click.stop="applyRecentSearch(term)"
                >
                  <img
                    :src="icons.search"
                    alt=""
                    class="h-3.5 w-3.5 filter invert opacity-50"
                  />
                  <span class="text-foreground truncate">{{ term }}</span>
                </button>
              </div>
              <div
                class="px-3 py-1.5 text-xs text-muted uppercase tracking-wider"
              >
                Add filter
              </div>
              <button
                v-for="opt in filterOptions"
                :key="opt.id"
                type="button"
                class="search-filter-option flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors"
                @click.stop="openFilterPicker(opt.id)"
              >
                <span
                  v-if="opt.icon"
                  class="flex h-5 w-5 flex-shrink-0 items-center justify-center"
                >
                  <img
                    :src="opt.icon"
                    alt=""
                    class="h-4 w-4 filter invert opacity-60"
                  />
                </span>
                <span
                  v-else
                  class="flex h-5 w-5 flex-shrink-0 items-center justify-center text-base font-semibold text-muted"
                >
                  @
                </span>
                <span class="text-foreground">{{ opt.label }}</span>
              </button>
              <p class="px-3 pt-2 text-xs text-muted">
                Or type <code class="bg-glass-2 px-1 rounded">in:</code>,
                <code class="bg-glass-2 px-1 rounded">from:</code>,
                <code class="bg-glass-2 px-1 rounded">mentions:</code>,
                <code class="bg-glass-2 px-1 rounded">has:image</code> etc.
              </p>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
