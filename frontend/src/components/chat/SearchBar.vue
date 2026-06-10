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
  parseSearchInputSegments,
  inlineFilterModeToChipKey,
  filterTagValueLabel,
  isFilterSegmentActive,
  type ActiveSearchInlineFilter,
  type SearchInputFilterSegment,
  type SearchInputSegment,
  type SearchInputTextSegment,
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
    /**
     * When set, dropdown width/position match the nearest matching ancestor
     * (e.g. `.members-column` for full-width member panel search).
     */
    dropdownPanelSelector?: string;
    /** Full-width mobile search modal layout (taller touch input). */
    mobilePanelLayout?: boolean;
  }>(),
  {
    dmMode: false,
    mobilePanelLayout: false,
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
  /** True while the search field is focused or has query text / filter chips. */
  engagedChange: [engaged: boolean];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const filterValueInputRef = ref<HTMLInputElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const dropdownRef = ref<HTMLDivElement | null>(null);
const isDropdownOpen = ref(false);
const dropdownMode = ref<'in' | 'from' | 'mentions' | 'has' | null>(null);
const filterPrefix = ref('');
const debouncedFilterPrefix = ref('');
let filterPrefixDebounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(filterPrefix, (prefix) => {
  if (filterPrefixDebounceTimer) clearTimeout(filterPrefixDebounceTimer);
  if (!prefix) {
    debouncedFilterPrefix.value = prefix;
    return;
  }
  filterPrefixDebounceTimer = setTimeout(() => {
    debouncedFilterPrefix.value = prefix;
    filterPrefixDebounceTimer = null;
  }, 150);
});
const highlightedIndex = ref(0);
const caretIndex = ref(0);
const activeInlineFilter = ref<ActiveSearchInlineFilter | null>(null);
const recentSearches = ref<string[]>([]);
let persistSearchTimer: number | null = null;

const SEARCH_HISTORY_STORAGE_KEY = 'echo-search-history-v1';
const MAX_SEARCH_HISTORY = 3;
/** Minimum gap between dropdown bottom and viewport edge (plus safe-area). */
const DROPDOWN_VIEWPORT_BOTTOM_PAD_PX = 8;

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

function syncFilterValueCaret(
  segment: SearchInputFilterSegment,
  target?: HTMLInputElement | null,
) {
  const el = target ?? filterValueInputRef.value;
  const valueLen = el?.selectionStart ?? segment.value.length;
  caretIndex.value = segment.start + `${segment.mode}:`.length + valueLen;
}

const parsedInputSegments = computed(() =>
  parseSearchInputSegments(inputValue.value),
);

/** Stable segment list for rendering; avoids swapping input elements when query goes empty → first char. */
const compositeInputSegments = computed((): SearchInputSegment[] => {
  const segments = parsedInputSegments.value;
  if (segments.length > 0) return segments;
  return [{ type: 'text', value: '', start: 0, end: 0 }];
});

const inlineFilterKeysInText = computed(() => {
  const keys = new Set<FilterKey>();
  for (const segment of parsedInputSegments.value) {
    if (segment.type === 'filter') {
      keys.add(inlineFilterModeToChipKey(segment.mode));
    }
  }
  return keys;
});

const pickerOnlyFilterChips = computed(() =>
  props.filterChips.filter(
    (chip) => !inlineFilterKeysInText.value.has(chip.key),
  ),
);

const lastTextSegmentIndex = computed(() => {
  for (let i = compositeInputSegments.value.length - 1; i >= 0; i -= 1) {
    if (compositeInputSegments.value[i]?.type === 'text') return i;
  }
  return -1;
});

const needsTrailingTextInput = computed(() => {
  const segments = parsedInputSegments.value;
  return (
    segments.length > 0 && segments[segments.length - 1]?.type === 'filter'
  );
});

const showSearchPlaceholder = computed(
  () =>
    pickerOnlyFilterChips.value.length === 0 && inputValue.value.length === 0,
);

function chipDisplayParts(chip: FilterChip): { key: string; value: string } {
  const colonIndex = chip.label.indexOf(':');
  if (colonIndex === -1) {
    return { key: chip.label, value: chip.value };
  }
  return {
    key: `${chip.label.slice(0, colonIndex + 1)}`,
    value: chip.label.slice(colonIndex + 1).trim(),
  };
}

function bindTextInputRef(el: unknown, segmentIndex: number) {
  if (segmentIndex === lastTextSegmentIndex.value) {
    inputRef.value = el as HTMLInputElement | null;
  }
}

function bindTrailingTextInputRef(el: unknown) {
  if (needsTrailingTextInput.value) {
    inputRef.value = el as HTMLInputElement | null;
  }
}

function textSegmentWidthCh(value: string): string {
  return `${Math.max(1, value.length || 1)}ch`;
}

function updateTextSegment(segment: SearchInputTextSegment, nextValue: string) {
  inputValue.value =
    inputValue.value.slice(0, segment.start) +
    nextValue +
    inputValue.value.slice(segment.end);
}

function onTextSegmentInput(segment: SearchInputTextSegment, event: Event) {
  const el = event.target as HTMLInputElement;
  syncCaretFromInput(el);
  updateTextSegment(segment, el.value);
}

function onFilterValueInput(segment: SearchInputFilterSegment, event: Event) {
  const el = event.target as HTMLInputElement;
  const nextToken = `${segment.mode}:${el.value}`;
  inputValue.value =
    inputValue.value.slice(0, segment.start) +
    nextToken +
    inputValue.value.slice(segment.end);
  syncFilterValueCaret(
    {
      ...segment,
      value: el.value,
      end: segment.start + nextToken.length,
    },
    el,
  );
}

function onFilterValueFocus(segment: SearchInputFilterSegment) {
  syncFilterValueCaret(segment);
}

function removeEmbeddedFilter(segment: SearchInputFilterSegment) {
  inputValue.value = removeInlineFilterToken(inputValue.value, segment);
  emit('removeFilter', inlineFilterModeToChipKey(segment.mode));
  nextTick(() => focusPrimaryTextInput());
}

function removePickerFilterChip(key: FilterKey) {
  emit('removeFilter', key);
  nextTick(() => focusPrimaryTextInput());
}

function onTextSegmentKeydown(event: KeyboardEvent, segmentIndex: number) {
  onKeydown(event);
  if (event.defaultPrevented) return;

  if (event.key !== 'Backspace') return;
  const el = event.target as HTMLInputElement;
  if (el.selectionStart !== 0 || el.selectionEnd !== 0) return;

  const previous = parsedInputSegments.value[segmentIndex - 1];
  if (previous?.type !== 'filter') return;

  event.preventDefault();
  removeEmbeddedFilter(previous);
}

function onFilterValueKeydown(
  event: KeyboardEvent,
  segment: SearchInputFilterSegment,
) {
  onKeydown(event);
  if (event.defaultPrevented) return;

  if (event.key !== 'Backspace') return;
  const el = event.target as HTMLInputElement;
  if (el.value.length > 0) return;

  event.preventDefault();
  removeEmbeddedFilter(segment);
}

function focusPrimaryTextInput(selectAll = false) {
  inputRef.value?.focus();
  isDropdownOpen.value = true;
  if (selectAll && inputRef.value) {
    inputRef.value.select();
  }
  syncCaretFromInput();
}

function focusActiveFilterValueInput() {
  filterValueInputRef.value?.focus();
  filterValueInputRef.value?.select();
}

function editFilterSegment(segment: SearchInputFilterSegment) {
  caretIndex.value = segment.end;
  nextTick(() => focusActiveFilterValueInput());
}

function onTrailingTextInput(event: Event) {
  const el = event.target as HTMLInputElement;
  const addition = el.value;
  if (!addition) return;
  const base = inputValue.value;
  inputValue.value =
    base.length > 0 && !/\s$/.test(base)
      ? `${base} ${addition}`
      : `${base}${addition}`;
  syncCaretFromInput(el);
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

watch(activeInlineFilter, (active, previous) => {
  if (!active) return;
  // Only refocus when entering a new inline filter token, not on each value keystroke.
  if (
    previous &&
    previous.start === active.start &&
    previous.mode === active.mode
  ) {
    return;
  }
  nextTick(() => focusActiveFilterValueInput());
});

const dropdownOptions = computed(() => {
  if (!dropdownMode.value) return [];
  const raw = debouncedFilterPrefix.value.toLowerCase();
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
  if (props.dmMode && (mode === 'in' || mode === 'from')) return;

  const cur = inputValue.value;
  const needsSpace = cur.length > 0 && !/\s$/.test(cur);
  inputValue.value = `${cur}${needsSpace ? ' ' : ''}${mode}:`;
  caretIndex.value = inputValue.value.length;

  const detected = detectActiveSearchInlineFilter(
    inputValue.value,
    caretIndex.value,
  );
  activeInlineFilter.value = detected;
  dropdownMode.value = detected?.mode ?? mode;
  filterPrefix.value = detected?.prefix ?? '';
  highlightedIndex.value = 0;
  isDropdownOpen.value = true;

  nextTick(() => {
    if (detected) {
      focusActiveFilterValueInput();
    } else {
      focusPrimaryTextInput();
    }
  });
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
    nextTick(() => focusPrimaryTextInput());
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

function onCompositeShellFocusIn(event: FocusEvent) {
  if ((event.target as HTMLElement).closest('.search-filter-tag__remove'))
    return;
  onInputFocus();
}

function applyRecentSearch(term: string) {
  inputValue.value = term;
  isDropdownOpen.value = true;
  nextTick(() => {
    focusPrimaryTextInput();
    if (!inputRef.value) return;
    const len = inputRef.value.value.length;
    inputRef.value.setSelectionRange(len, len);
    syncCaretFromInput(inputRef.value);
  });
}

function focusSearchInput(selectAll = false) {
  focusPrimaryTextInput(selectAll);
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

const isSearchEngaged = computed(
  () => isSearchActive.value || isDropdownOpen.value,
);

watch(
  isSearchEngaged,
  (engaged) => {
    emit('engagedChange', engaged);
  },
  { immediate: true },
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

const isEditingPage = ref(false);
const pageInputValue = ref('');
const pageInputRef = ref<HTMLInputElement | null>(null);

const displayedPage = computed(() => (props.currentPage ?? 0) + 1);
const maxPages = computed(() => props.totalPages ?? 1);

function startEditingPage() {
  pageInputValue.value = String(displayedPage.value);
  isEditingPage.value = true;
  nextTick(() => {
    pageInputRef.value?.focus();
    pageInputRef.value?.select();
  });
}

function cancelPageInput() {
  isEditingPage.value = false;
}

function commitPageInput() {
  isEditingPage.value = false;
  const parsed = Number.parseInt(pageInputValue.value.trim(), 10);
  if (Number.isNaN(parsed)) return;
  const clamped = Math.max(1, Math.min(parsed, maxPages.value));
  emit('goToPage', clamped - 1);
}

function onPageInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    commitPageInput();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    cancelPageInput();
  }
}

watch(
  () => [props.currentPage, props.totalPages] as const,
  () => {
    isEditingPage.value = false;
  },
);

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
        const inputRect = el.getBoundingClientRect();
        const panelEl = props.dropdownPanelSelector
          ? el.closest(props.dropdownPanelSelector)
          : null;
        const panelRect = panelEl?.getBoundingClientRect();
        const gap =
          props.dropdownGapPx ??
          (props.dmMode ? 0 : showSearchResults.value ? 4 : 8);
        const horizontalPad = panelEl
          ? 0
          : (props.dropdownHorizontalPadPx ?? 16);
        const top = inputRect.bottom + gap;
        const viewportWidth =
          window.innerWidth || document.documentElement.clientWidth;
        let left = panelRect ? panelRect.left : inputRect.left - horizontalPad;
        let widthPx = panelRect
          ? panelRect.width
          : inputRect.width + horizontalPad * 2;
        if (!panelEl) {
          const reservedRight =
            props.reservedRightPx ?? (props.dmMode ? 360 : 680);
          const maxRight = viewportWidth - reservedRight;
          if (left + widthPx > maxRight) {
            widthPx = Math.max(260, maxRight - left);
          }
        }
        const bottomPad = DROPDOWN_VIEWPORT_BOTTOM_PAD_PX;
        dropdownPosition.value = {
          top,
          left,
          width: `${widthPx}px`,
          height: `calc(100dvh - ${top}px - max(${bottomPad}px, env(safe-area-inset-bottom, 0px)))`,
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
  if (filterPrefixDebounceTimer) clearTimeout(filterPrefixDebounceTimer);
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

.search-filter-dropdown-inner {
  position: relative;
  z-index: 1;
  min-height: 0;
}

.search-filter-option:hover {
  background-color: var(--vue-auto-001);
}

.search-page-input {
  caret-color: var(--text);
}

.search-composite-input {
  border-radius: 0.375rem;
}

.search-text-segment {
  caret-color: var(--text);
  field-sizing: content;
}

.search-filter-tag {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 0.125rem;
  border-radius: 0.375rem;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  background: color-mix(in srgb, var(--glass-3) 88%, var(--elevated));
  padding: 0.125rem 0.375rem;
  font-size: 0.75rem;
  line-height: 1.25rem;
}

.search-filter-tag--active {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
}

.search-filter-tag__key {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--muted);
}

.search-filter-tag__value,
.search-filter-tag__value-input {
  min-width: 0;
  color: var(--foreground);
}

.search-filter-tag__value-input {
  width: auto;
  min-width: 1.5ch;
  max-width: 12rem;
  border: 0;
  background: transparent;
  padding: 0;
  outline: none;
  caret-color: var(--text);
  font: inherit;
}

.search-filter-tag__remove {
  flex-shrink: 0;
  margin-left: 0.125rem;
  border-radius: 0.25rem;
  padding: 0 0.125rem;
  color: var(--muted);
  transition:
    color 120ms ease,
    background-color 120ms ease;
}

.search-filter-tag__remove:hover {
  color: var(--foreground);
  background: var(--glass-hover);
}
</style>

<template>
  <div
    ref="containerRef"
    class="search-bar relative flex h-full w-full min-w-0"
  >
    <!-- Composite input: embedded filter tags + free-text segments -->
    <div
      class="search-composite-input relative flex h-full flex-1 flex-wrap items-center gap-x-0.5 gap-y-1 px-3 py-1.5 min-w-0"
      :class="mobilePanelLayout ? 'min-h-[2.75rem]' : ''"
      @focusin="onCompositeShellFocusIn"
    >
      <span
        v-for="chip in pickerOnlyFilterChips"
        :key="`picker-chip-${chip.key}-${chip.value}`"
        class="search-filter-tag max-w-full"
      >
        <span class="search-filter-tag__key">{{
          chipDisplayParts(chip).key
        }}</span>
        <span class="search-filter-tag__value truncate">{{
          chipDisplayParts(chip).value
        }}</span>
        <button
          type="button"
          class="search-filter-tag__remove"
          :aria-label="`Remove ${chip.label}`"
          @click.stop="removePickerFilterChip(chip.key)"
        >
          ×
        </button>
      </span>

      <template
        v-for="(segment, segmentIndex) in compositeInputSegments"
        :key="`${segment.type}-${segment.start}`"
      >
        <input
          v-if="segment.type === 'text'"
          :ref="(el) => bindTextInputRef(el, segmentIndex)"
          :value="segment.value"
          type="text"
          name="echo-message-search-native"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          data-lpignore="true"
          :placeholder="
            showSearchPlaceholder &&
            segmentIndex === compositeInputSegments.length - 1
              ? placeholder || 'Search'
              : undefined
          "
          class="search-text-segment search-bar-input min-w-0 bg-transparent text-foreground placeholder:text-muted outline-none"
          :class="[
            mobilePanelLayout ? 'text-base' : 'text-sm',
            segmentIndex === compositeInputSegments.length - 1
              ? 'flex-1 min-w-[3rem]'
              : 'flex-none',
          ]"
          :style="
            segmentIndex === compositeInputSegments.length - 1
              ? undefined
              : { width: textSegmentWidthCh(segment.value) }
          "
          @input="onTextSegmentInput(segment, $event)"
          @focus="onInputFocus"
          @click="syncCaretFromInput()"
          @keydown="onTextSegmentKeydown($event, segmentIndex)"
          @keyup="syncCaretFromInput()"
          @select="syncCaretFromInput()"
        />

        <span
          v-else
          class="search-filter-tag max-w-full"
          :class="{
            'search-filter-tag--active': isFilterSegmentActive(
              segment,
              activeInlineFilter,
            ),
          }"
        >
          <span class="search-filter-tag__key">{{ segment.mode }}:</span>
          <input
            v-if="isFilterSegmentActive(segment, activeInlineFilter)"
            ref="filterValueInputRef"
            :value="segment.value"
            type="text"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            data-lpignore="true"
            class="search-filter-tag__value-input"
            :aria-label="`${segment.mode} filter value`"
            :placeholder="segment.mode === 'has' ? 'type…' : 'search…'"
            @input="onFilterValueInput(segment, $event)"
            @focus="onFilterValueFocus(segment)"
            @keydown="onFilterValueKeydown($event, segment)"
            @keyup="syncFilterValueCaret(segment)"
            @click.stop
          />
          <span
            v-else
            class="search-filter-tag__value truncate cursor-text"
            :title="filterTagValueLabel(segment.mode, segment.value)"
            @click.stop="editFilterSegment(segment)"
          >
            {{ filterTagValueLabel(segment.mode, segment.value) || '…' }}
          </span>
          <button
            type="button"
            class="search-filter-tag__remove"
            :aria-label="`Remove ${segment.mode} filter`"
            @click.stop="removeEmbeddedFilter(segment)"
          >
            ×
          </button>
        </span>
      </template>

      <input
        v-if="needsTrailingTextInput"
        :ref="bindTrailingTextInputRef"
        value=""
        type="text"
        name="echo-message-search-native-tail"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        data-lpignore="true"
        :placeholder="placeholder || 'Search'"
        class="search-text-segment search-bar-input flex-1 min-w-[3rem] bg-transparent text-foreground placeholder:text-muted outline-none"
        :class="mobilePanelLayout ? 'text-base' : 'text-sm'"
        @input="onTrailingTextInput"
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
        class="ml-auto flex-shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-glass-hover hover:text-foreground"
        @click="closeSearch"
      >
        ×
      </button>
      <img
        v-else
        :src="icons.search"
        alt=""
        class="ml-auto h-4 w-4 flex-shrink-0 filter invert opacity-40"
      />
    </div>

    <!-- Dropdown: chips + filter options or search results (opens on focus) -->
    <Teleport to="body">
      <div
        v-show="isDropdownOpen"
        ref="dropdownRef"
        class="search-filter-dropdown fixed flex min-w-[280px] flex-col overflow-hidden"
        :style="dropdownStyle"
      >
        <div
          class="search-filter-dropdown-inner flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div
            class="search-filter-dropdown-scroll flex min-h-0 flex-1 flex-col overflow-y-auto py-1.5 custom-scrollbar"
            v-scrollbar-on-scroll
          >
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
              <template v-if="dmMode">
                <SearchMessageRow
                  v-for="(msg, idx) in searchResults ?? []"
                  :key="msg.id ?? `sr-dm-${idx}`"
                  :message="msg"
                  @go-to-message="
                    (chId, msgId) => emit('goToMessage', chId, msgId)
                  "
                />
              </template>
              <template v-else>
                <template
                  v-for="group in searchResultsByChannel"
                  :key="group.channelName"
                >
                  <div
                    class="px-4 py-1.5 mt-2 first:mt-0 text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-2"
                  >
                    <img
                      :src="
                        getChannelIcon({
                          name: group.channelName,
                          type: 'text',
                        })
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
                <span
                  class="inline-flex items-center gap-0.5 text-xs text-muted tabular-nums"
                >
                  <input
                    v-if="isEditingPage"
                    ref="pageInputRef"
                    v-model="pageInputValue"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    class="search-page-input w-[3ch] min-w-[1.5rem] max-w-[3rem] rounded border border-border bg-glass-2 px-0.5 py-0 text-center text-xs text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-accent"
                    aria-label="Page number"
                    @keydown="onPageInputKeydown"
                    @blur="commitPageInput"
                    @click.stop
                  />
                  <button
                    v-else
                    type="button"
                    class="text-foreground underline decoration-dotted underline-offset-2 hover:text-accent"
                    :aria-label="`Page ${displayedPage} of ${maxPages}. Click to jump to a page.`"
                    @click.stop="startEditingPage"
                  >
                    {{ displayedPage }}
                  </button>
                  <span>/ {{ maxPages }}</span>
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
