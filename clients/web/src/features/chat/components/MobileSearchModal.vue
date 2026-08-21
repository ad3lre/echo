<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import { useEdgeSwipe } from '@/features/layout/useEdgeSwipe';
import SearchBar from '@/features/chat/components/SearchBar.vue';
import type {
  FilterChip,
  FilterKey,
  HasType,
} from '@/features/chat/composables/useSearch';
import type { UserForAuthor } from '@/features/chat/chatMessageTypes';
import type { MessageWithAuthor } from '@shared/types';
import type { ChannelListEntry } from '@/features/chat/search/messageSearchCore';

const MOBILE_SEARCH_PANEL_SELECTOR = '.mobile-search-modal-panel';

const props = withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    modelValue: string;
    filterChips: FilterChip[];
    channels: ChannelListEntry[];
    resolveChannelIcon?: (channel: {
      name: string;
      type?: import('@shared/types').EchoChannelType;
      iconKey?: string;
    }) => string;
    users: UserForAuthor[];
    searchResults?: (MessageWithAuthor & { channelName?: string })[];
    totalResults?: number;
    currentPage?: number;
    totalPages?: number;
    placeholder?: string;
    dmMode?: boolean;
    searchScopeHint?: string;
    searchLoading?: boolean;
    searchError?: string | null;
  }>(),
  {
    title: 'Search',
    subtitle: '',
    dmMode: false,
    searchScopeHint: '',
    searchLoading: false,
    searchError: null,
  },
);

const emit = defineEmits<{
  close: [];
  'update:modelValue': [value: string];
  addFilter: [key: FilterKey, value: string | boolean | HasType];
  removeFilter: [key: FilterKey];
  clearSearch: [];
  goToPage: [page: number];
  goToMessage: [channelId: string, messageId: string];
}>();

const modalRef = ref<HTMLElement | null>(null);
const trapActive = ref(true);
const isOpen = ref(true);
useFocusTrap(modalRef, trapActive);

function close() {
  emit('close');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

const edgeSwipe = useEdgeSwipe({
  onSwipeRight: close,
});

function onModalPointerDown(e: PointerEvent) {
  edgeSwipe.onPointerDown(e);
}
function onModalPointerUp(e: PointerEvent) {
  edgeSwipe.onPointerUp(e);
}
function onModalPointerCancel(e: PointerEvent) {
  edgeSwipe.onPointerCancel(e);
}

let previousBodyOverflow = '';

onMounted(() => {
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // SearchBar listens for this and focuses/selects. On mobile we want immediate focus.
  try {
    window.dispatchEvent(
      new CustomEvent('echo:focus-search', { detail: { selectAll: true } }),
    );
  } catch {
    /* ignore */
  }
});

onBeforeUnmount(() => {
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <Teleport to="body">
    <Transition name="search-mobile-modal">
      <div
        v-if="isOpen"
        class="mobile-search-modal fixed inset-0 z-[220] bg-[var(--echo-server-rail-bg)] text-foreground"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        @keydown="onKeydown"
      >
        <div
          ref="modalRef"
          class="flex h-[100dvh] w-full flex-col bg-[var(--echo-server-rail-bg)] text-foreground"
          @pointerdown="onModalPointerDown"
          @pointerup="onModalPointerUp"
          @pointercancel="onModalPointerCancel"
        >
          <header
            class="mobile-search-modal-header flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3"
            style="padding-top: calc(env(safe-area-inset-top, 0px) + 0.75rem)"
          >
            <div class="min-w-0">
              <div
                class="truncate text-base font-semibold tracking-tight text-foreground"
              >
                {{ title }}
              </div>
              <div class="mt-0.5 truncate text-xs text-fg-soft">
                {{ subtitle || 'Swipe right or tap Exit to close.' }}
              </div>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-white"
              @click="close"
            >
              Exit
            </button>
          </header>

          <div
            class="mobile-search-modal-panel flex min-h-0 flex-1 flex-col px-4 pb-3 pt-3"
          >
            <div
              class="mobile-search-modal-input-shell mb-2 shrink-0 overflow-hidden rounded-xl border border-border bg-[var(--glass-2)]"
            >
              <SearchBar
                mobile-panel-layout
                :model-value="modelValue"
                :filter-chips="filterChips"
                :channels="channels"
                :resolve-channel-icon="resolveChannelIcon"
                :users="users"
                :dm-mode="dmMode"
                :search-results="searchResults"
                :total-results="totalResults"
                :current-page="currentPage"
                :total-pages="totalPages"
                :placeholder="placeholder || 'Search'"
                :dropdown-panel-selector="MOBILE_SEARCH_PANEL_SELECTOR"
                :reserved-right-px="0"
                :dropdown-horizontal-pad-px="0"
                :dropdown-gap-px="8"
                :dropdown-z-index="240"
                :search-loading="searchLoading"
                :search-error="searchError"
                :search-scope-hint="searchScopeHint"
                @update:model-value="(v) => emit('update:modelValue', v)"
                @add-filter="(key, value) => emit('addFilter', key, value)"
                @remove-filter="(key) => emit('removeFilter', key)"
                @clear-search="() => emit('clearSearch')"
                @go-to-page="(page) => emit('goToPage', page)"
                @go-to-message="
                  (channelId, messageId) =>
                    emit('goToMessage', channelId, messageId)
                "
              />
            </div>
          </div>

          <div
            class="shrink-0"
            :style="{ height: 'max(0px, env(safe-area-inset-bottom, 0px))' }"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.search-mobile-modal-enter-active,
.search-mobile-modal-leave-active {
  transition: opacity 0.18s ease;
}

.search-mobile-modal-enter-from,
.search-mobile-modal-leave-to {
  opacity: 0;
}

.search-mobile-modal-enter-to,
.search-mobile-modal-leave-from {
  opacity: 1;
}

.mobile-search-modal-input-shell :deep(.search-bar) {
  min-height: 2.75rem;
}

.mobile-search-modal-input-shell :deep(.search-bar-input) {
  font-size: 1rem;
  line-height: 1.25rem;
}
</style>
