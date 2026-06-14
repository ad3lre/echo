<script setup lang="ts">
import {
  ref,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
  computed,
  toRef,
} from 'vue';
import type { EmojiEntry } from '@/composables/useEmojiData';
import { useEmojiPicker } from '@/composables/useEmojiPicker';
import { useRecentlyUsedEmojis } from '@/composables/useRecentlyUsedEmojis';
import EmojiCategorySection from '@/components/EmojiCategorySection.vue';
import { preloadEmojiImagesOnce } from '@/composables/useEmojiPreload';
import { useServerEmojiLibrary } from '@/composables/useServerEmojiLibrary';
import { useUserEmojiLibrary } from '@/composables/useUserEmojiLibrary';
import { useChannelCustomEmojiPickerAllowed } from '@/composables/useChannelCustomEmojiPickerAllowed';

const props = defineProps<{
  modelValue: boolean;
  triggerRect?: DOMRect | null;
  serverId?: string;
  channelId?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  select: [emoji: string];
}>();

const popoverRef = ref<HTMLElement | null>(null);
const { addRecentlyUsed } = useRecentlyUsedEmojis();

const serverIdRef = toRef(() => props.serverId);
const channelIdRef = toRef(() => props.channelId);
const allowCustomEmoji = useChannelCustomEmojiPickerAllowed(channelIdRef);
const library = useServerEmojiLibrary(serverIdRef);
const userLibrary = useUserEmojiLibrary();
const serverPackCategories = computed(() => library.pickerPackCategories());
const customEmojiSearchList = computed(() => [
  ...library.flatCustomEmojis.value,
  ...userLibrary.savedEntries.value,
]);
const userPackCategories = computed(
  () => userLibrary.pickerPackCategories.value,
);

const {
  searchQuery,
  scrollContainerRef,
  browsingCategories,
  renderedCategories,
  activeCategory,
  setSectionRef,
  scrollToCategory,
  advanceToPhase2,
} = useEmojiPicker({
  serverId: serverIdRef,
  serverPackCategories,
  customEmojiSearchList,
  userPackCategories,
  allowCustomEmoji,
});

const popoverStyle = ref({ left: '0px', top: '0px' });

function updatePosition() {
  nextTick(() => {
    const rect = props.triggerRect;
    if (!rect) return;
    const popoverWidth = 360;
    const popoverHeight =
      popoverRef.value?.getBoundingClientRect().height || 340;
    const pad = 8;
    const gap = 8;
    const spaceBelow = window.innerHeight - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    const placeBelow = spaceBelow >= popoverHeight || spaceBelow >= spaceAbove;
    let left = rect.left;
    if (left < pad) left = pad;
    if (left + popoverWidth > window.innerWidth - pad)
      left = window.innerWidth - popoverWidth - pad;
    let top = placeBelow ? rect.bottom + gap : rect.top - popoverHeight - gap;
    if (placeBelow) {
      if (top + popoverHeight > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - popoverHeight - pad);
      }
    } else if (top < pad) {
      top = pad;
    }
    popoverStyle.value = { left: `${left}px`, top: `${top}px` };
  });
}

watch(
  () => [props.modelValue, props.triggerRect],
  () => {
    if (props.modelValue) {
      preloadEmojiImagesOnce();
      updatePosition();
      nextTick(() => requestAnimationFrame(advanceToPhase2));
    }
  },
  { immediate: true },
);

function close() {
  emit('update:modelValue', false);
}

function select(entry: EmojiEntry) {
  addRecentlyUsed(entry);
  if (entry.kind === 'custom' && entry.id) void library.recordUsage(entry.id);
  emit('select', entry.emoji);
  close();
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (popoverRef.value?.contains(target)) return;
  close();
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      ref="popoverRef"
      class="message-reaction-emoji-popover chat-liquid-glass-menu fixed z-[100] w-[min(360px,calc(100vw-2rem))] max-h-[340px] flex flex-col overflow-hidden"
      :style="popoverStyle"
    >
      <div
        class="message-reaction-emoji-popover-inner flex flex-1 flex-col min-h-0 rounded-xl overflow-hidden"
      >
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search emoji..."
          class="mx-2 mt-2 mb-1.5 rounded-lg border-none bg-scrim-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted backdrop-blur-sm"
        />
        <div class="flex flex-1 min-h-0 overflow-hidden">
          <div
            v-if="!searchQuery.trim()"
            class="emoji-nav-wrap flex flex-col items-center py-2.5 px-2 gap-1.5 shrink-0 overflow-y-auto overflow-x-hidden custom-scrollbar min-h-0"
            v-scrollbar-on-scroll
          >
            <button
              v-for="cat in browsingCategories"
              :key="cat.slug"
              type="button"
              class="emoji-nav-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-glass-3"
              :class="{ 'bg-glass-active': activeCategory === cat.slug }"
              :title="cat.name"
              @click="scrollToCategory(cat.slug)"
            >
              <img
                v-if="cat.navIconImageUrl"
                class="emoji custom-emoji h-[18px] w-[18px] object-contain"
                :src="cat.navIconImageUrl"
                :alt="cat.navIconImageAlt ?? cat.name"
                draggable="false"
              />
              <span v-else v-html="cat.navIconHtml" />
            </button>
          </div>
          <div
            ref="scrollContainerRef"
            class="emoji-picker-body-scroll flex-1 overflow-y-auto overflow-x-hidden pl-1.5 pr-2 py-1 pb-2.5 custom-scrollbar min-w-0"
            v-scrollbar-on-scroll
          >
            <EmojiCategorySection
              v-for="(cat, idx) in renderedCategories"
              :key="cat.slug === 'search' ? `search-${searchQuery}` : cat.slug"
              :ref="(el) => setSectionRef(cat.slug, el)"
              :category="cat"
              :scroll-root="scrollContainerRef"
              :priority="idx === 0"
              @insert-emoji="select"
            />
            <div
              v-if="searchQuery.trim() && renderedCategories.length === 0"
              class="py-8 text-center text-sm text-muted"
            >
              No emojis match "{{ searchQuery.trim() }}"
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
/* Glass: .chat-liquid-glass-menu on outer (main.scss) */

:deep(.emoji-section) {
  margin-bottom: 0.5rem;
}
:deep(.emoji-section:last-child) {
  margin-bottom: 0;
}
:deep(.emoji-section .emoji-section-header) {
  margin-bottom: 0.25rem;
  padding-top: 0.5rem;
  padding-bottom: 0.25rem;
}
:deep(.emoji-section:first-child .emoji-section-header) {
  padding-top: 0;
}
.emoji-picker-body-scroll {
  scrollbar-gutter: stable;
}

:deep(.emoji-section .emoji-grid) {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  grid-auto-rows: auto;
  gap: 2px;
  width: 100%;
  min-width: 0;
}

:deep(.emoji-section .emoji-btn) {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  aspect-ratio: 1;
  height: auto;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color 0.15s;
}

:deep(.emoji-section .emoji-btn:hover) {
  background: var(--vue-auto-003);
}

:deep(.emoji-section .emoji-btn .emoji) {
  width: min(22px, 78%) !important;
  height: min(22px, 78%) !important;
  min-width: 0 !important;
  min-height: 0 !important;
  object-fit: contain;
}

:deep(.emoji-section .emoji-skeleton) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  aspect-ratio: 1;
  height: auto;
  border-radius: 6px;
  background: var(--vue-auto-001);
  animation: emoji-skeleton-pulse 1.2s ease-in-out infinite;
}

@keyframes emoji-skeleton-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

.emoji-nav-btn :deep(.emoji) {
  width: 18px !important;
  height: 18px !important;
}

.emoji-nav-wrap {
  overflow-x: hidden;
}
.emoji-nav-wrap::-webkit-scrollbar:horizontal {
  display: none;
  height: 0;
}
</style>
