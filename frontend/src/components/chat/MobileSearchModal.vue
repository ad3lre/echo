<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useEdgeSwipe } from '@/composables/useEdgeSwipe';
import SearchBar from '@/components/chat/SearchBar.vue';
import type { FilterChip, FilterKey, HasType } from '@/composables/useSearch';
import type { UserForAuthor } from '@/features/chat/chatMessageTypes';
import type { MessageWithAuthor } from '@shared/types';

const props = withDefaults(
  defineProps<{
    title?: string;
    modelValue: string;
    filterChips: FilterChip[];
    channels: { id: string; name: string }[];
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

onMounted(() => {
  // SearchBar listens for this and focuses/selects. On mobile we want immediate focus.
  try {
    window.dispatchEvent(
      new CustomEvent('echo:focus-search', { detail: { selectAll: true } }),
    );
  } catch {
    /* ignore */
  }
});
</script>

<template>
  <Transition name="search-mobile-modal">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[220] bg-[var(--echo-server-rail-bg)] text-foreground"
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
          class="flex items-center justify-between gap-3 border-b border-border px-4 py-3"
          style="padding-top: calc(env(safe-area-inset-top, 0px) + 0.75rem)"
        >
          <div class="min-w-0">
            <div
              class="text-xs font-semibold uppercase tracking-[0.18em] text-fg-soft"
            >
              {{ title }}
            </div>
            <div class="mt-1 text-sm text-fg-soft">
              Swipe right or tap Exit to leave.
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-white"
            @click="close"
          >
            Exit
          </button>
        </header>

        <div class="flex min-h-0 flex-1 flex-col px-4 py-3">
          <SearchBar
            :model-value="modelValue"
            :filter-chips="filterChips"
            :channels="channels"
            :users="users"
            :dm-mode="dmMode"
            :search-results="searchResults"
            :total-results="totalResults"
            :current-page="currentPage"
            :total-pages="totalPages"
            :placeholder="placeholder || 'Search'"
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

        <!-- Spacer: SearchBar dropdown is teleported+fixed; this keeps the modal layout stable. -->
        <div
          class="shrink-0"
          :style="{ height: 'max(0px, env(safe-area-inset-bottom, 0px))' }"
        />
      </div>
    </div>
  </Transition>
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
</style>
