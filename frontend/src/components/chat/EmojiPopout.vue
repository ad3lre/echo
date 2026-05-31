<script setup lang="ts">
import { computed, ref, toRef, watch, onMounted, nextTick } from 'vue';
import type { EmojiCategory, EmojiEntry } from '@/composables/useEmojiData';
import { ensureEmojiCategoriesLoaded } from '@/composables/useEmojiData';
import EmojiCategorySection from '@/components/EmojiCategorySection.vue';
import AppIconPickerPanel from '@/components/AppIconPickerPanel.vue';
import type { AppIconEntry } from '@/composables/useAppIconSearch';
import { linkTokenAppIcon } from '@/utils/idTokens';
import { useEmojiPicker } from '@/composables/useEmojiPicker';
import { preloadEmojiImagesOnce } from '@/composables/useEmojiPreload';
import { ensureEmojiSearchPrebuildLoaded } from '@/composables/useEmojiSearchIndex';
import { useServerEmojiLibrary } from '@/composables/useServerEmojiLibrary';
import { useUserEmojiLibrary } from '@/composables/useUserEmojiLibrary';
import { useChannelCustomEmojiPickerAllowed } from '@/composables/useChannelCustomEmojiPickerAllowed';
import { useSimpleContextMenu } from '@/composables/useSimpleContextMenu';
import { UIErrorBus } from '@/utils/uiErrorBus';
import StickerPickerPanel from '@/components/chat/StickerPickerPanel.vue';
import { stickerToPayload } from '@/composables/useServerStickerLibrary';
import type { EchoStickerLibraryStickerApi } from '@/composables/useServerStickerLibrary';

const props = defineProps<{
  serverId?: string;
  channelId?: string;
  placement?: 'up' | 'down';
  theme?: 'default' | 'forum';
}>();

const emit = defineEmits<{
  insert: [emoji: string];
  sendSticker: [
    stickerId: string,
    preview?: import('@shared/types').MessageStickerPayload,
  ];
  close: [];
}>();

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
  menuOpen: packMenuOpen,
  menuRef: packMenuRef,
  menuPosition: packMenuPosition,
  openAtEvent: openPackMenuAtEvent,
  closeMenu: closePackMenu,
} = useSimpleContextMenu();
const contextPackCategory = ref<EmojiCategory | null>(null);

const savedUserPacks = computed(() => userLibrary.packs.value);
const canSaveNewUserPack = computed(
  () => savedUserPacks.value.length < userLibrary.maxPacks,
);

watch(packMenuOpen, (open) => {
  if (!open) contextPackCategory.value = null;
});

function isCopyableCustomPackCategory(category: EmojiCategory): boolean {
  if (!category.emojis.length) return false;
  for (const e of category.emojis) {
    if (e.kind !== 'custom') return false;
    if (!e.id || !e.serverId || !e.imageUrl || !e.emoji) return false;
    if (typeof e.animated !== 'boolean') return false;
  }
  return true;
}

function resolvePackCategoryForEntry(entry: EmojiEntry): EmojiCategory | null {
  if (entry.kind !== 'custom' || !entry.id || !entry.serverId) return null;
  const packs = [...serverPackCategories.value, ...userPackCategories.value];
  for (const cat of packs) {
    if (
      cat.emojis.some(
        (e) =>
          e.kind === 'custom' &&
          e.id === entry.id &&
          e.serverId === entry.serverId,
      )
    ) {
      return cat;
    }
  }
  return null;
}

async function openPackCopyMenu(
  ev: MouseEvent,
  category: EmojiCategory,
  entry?: EmojiEntry,
) {
  const target = isCopyableCustomPackCategory(category)
    ? category
    : entry
      ? resolvePackCategoryForEntry(entry)
      : null;
  if (!target || !isCopyableCustomPackCategory(target)) return;
  contextPackCategory.value = target;
  await openPackMenuAtEvent(ev);
}

function closePackCopyMenu() {
  closePackMenu();
  contextPackCategory.value = null;
}

function savePackAsNew() {
  const cat = contextPackCategory.value;
  if (!cat) return;
  const result = userLibrary.saveEmojiPackFromCategory(cat);
  if (result === 'saved') {
    UIErrorBus.emit({
      context: 'emoji-pack-copy',
      severity: 'info',
      userMessage: `Copied "${cat.name}" as a new emoji pack.`,
    });
  } else if (result === 'full') {
    UIErrorBus.emit({
      context: 'emoji-pack-copy',
      severity: 'error',
      userMessage: `You can only save ${userLibrary.maxPacks} packs.`,
    });
  } else {
    UIErrorBus.emit({
      context: 'emoji-pack-copy',
      severity: 'error',
      userMessage: 'Could not copy this pack.',
    });
  }
  closePackCopyMenu();
}

function replaceSavedPack(replacePackId: string) {
  const cat = contextPackCategory.value;
  if (!cat) return;
  const targetName =
    savedUserPacks.value.find((p) => p.id === replacePackId)?.name ?? 'pack';
  const result = userLibrary.saveEmojiPackFromCategory(cat, { replacePackId });
  if (result === 'replaced') {
    UIErrorBus.emit({
      context: 'emoji-pack-copy',
      severity: 'info',
      userMessage: `Replaced "${targetName}" with "${cat.name}".`,
    });
  } else {
    UIErrorBus.emit({
      context: 'emoji-pack-copy',
      severity: 'error',
      userMessage: 'Could not replace that pack.',
    });
  }
  closePackCopyMenu();
}

const {
  searchQuery,
  scrollContainerRef,
  browsingCategories,
  renderedCategories,
  activeCategory,
  addRecentlyUsed,
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

const pickerTab = ref<'emoji' | 'icons' | 'stickers'>('emoji');

function handleStickerSend(sticker: EchoStickerLibraryStickerApi) {
  emit('sendSticker', sticker.id, stickerToPayload(sticker));
  emit('close');
}

const emojiSearchSelectedIndex = ref(0);

const iconSearchQuery = ref('');
const iconFilterDebounced = ref('');
let iconSearchTimer: ReturnType<typeof setTimeout> | null = null;

watch(iconSearchQuery, (q) => {
  if (iconSearchTimer) clearTimeout(iconSearchTimer);
  if (!q.trim()) {
    iconFilterDebounced.value = q;
  } else {
    iconSearchTimer = setTimeout(() => {
      iconFilterDebounced.value = q;
    }, 150);
  }
});

const searchInputModel = computed({
  get() {
    if (pickerTab.value === 'emoji') return searchQuery.value;
    if (pickerTab.value === 'icons') return iconSearchQuery.value;
    return '';
  },
  set(v: string) {
    if (pickerTab.value === 'emoji') searchQuery.value = v;
    else if (pickerTab.value === 'icons') iconSearchQuery.value = v;
  },
});

const searchPlaceholder = computed(() => {
  if (pickerTab.value === 'emoji') return 'Search emoji...';
  if (pickerTab.value === 'icons') return 'Search icons...';
  return 'Stickers (coming soon)';
});

const emojiSearchResults = computed<EmojiEntry[]>(() => {
  if (pickerTab.value !== 'emoji') return [];
  if (!searchQuery.value.trim()) return [];
  const first = renderedCategories.value[0];
  if (!first || first.slug !== 'search') return [];
  return first.emojis;
});

function scrollActiveSearchResultIntoView() {
  const root = scrollContainerRef.value;
  if (!root) return;
  const idx = emojiSearchSelectedIndex.value;
  const btn = root.querySelector(
    `[data-search-index="${String(idx)}"]`,
  ) as HTMLElement | null;
  btn?.scrollIntoView({ block: 'nearest' });
}

function handleSearchInputKeydown(e: KeyboardEvent) {
  if (pickerTab.value !== 'emoji') return;
  if (!searchQuery.value.trim()) return;
  const list = emojiSearchResults.value;
  if (list.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    emojiSearchSelectedIndex.value =
      (emojiSearchSelectedIndex.value + 1) % list.length;
    nextTick(scrollActiveSearchResultIntoView);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    emojiSearchSelectedIndex.value =
      (emojiSearchSelectedIndex.value - 1 + list.length) % list.length;
    nextTick(scrollActiveSearchResultIntoView);
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const idx = Math.max(
      0,
      Math.min(emojiSearchSelectedIndex.value, list.length - 1),
    );
    const picked = list[idx];
    if (picked) handleInsert(picked);
  }
}

watch(
  [pickerTab, () => searchQuery.value, () => emojiSearchResults.value],
  () => {
    emojiSearchSelectedIndex.value = 0;
    nextTick(scrollActiveSearchResultIntoView);
  },
  { immediate: true, flush: 'post' },
);

function handleIconInsert(entry: AppIconEntry) {
  emit('insert', linkTokenAppIcon(entry.id));
}

onMounted(async () => {
  await ensureEmojiCategoriesLoaded();
  await ensureEmojiSearchPrebuildLoaded();
  preloadEmojiImagesOnce();
  nextTick(() => requestAnimationFrame(advanceToPhase2));
});

function handleInsert(entry: EmojiEntry) {
  addRecentlyUsed(entry);
  if (entry.kind === 'custom' && entry.id) void library.recordUsage(entry.id);
  emit('insert', entry.emoji);
}
</script>

<template>
  <div
    class="chat-popout chat-liquid-glass-menu absolute right-4 w-[min(360px,calc(100%-2rem))] overflow-hidden"
    :class="props.placement === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'"
    role="menu"
  >
    <div class="chat-popout-inner max-h-[340px] flex flex-col overflow-hidden">
      <input
        v-model="searchInputModel"
        type="text"
        :placeholder="searchPlaceholder"
        :disabled="pickerTab === 'stickers'"
        class="mx-2 mt-2 mb-1.5 rounded-lg border-none bg-scrim-2 px-3 py-2 text-sm outline-none backdrop-blur-sm"
        :class="
          props.theme === 'forum'
            ? 'text-foreground placeholder:text-fg-subtle disabled:text-fg-subtle'
            : 'text-foreground placeholder:text-muted disabled:opacity-50'
        "
        @keydown="handleSearchInputKeydown"
      />
      <div
        class="flex items-center gap-1 px-2 pb-1.5"
        role="tablist"
        aria-label="Picker content"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="pickerTab === 'emoji'"
          class="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
          :class="
            pickerTab === 'emoji'
              ? props.theme === 'forum'
                ? 'bg-glass-2 text-foreground ring-1 ring-border'
                : 'bg-[var(--vue-auto-003)] text-foreground ring-1 ring-border'
              : props.theme === 'forum'
                ? 'text-fg-soft hover:bg-glass-hover hover:text-fg-soft'
                : 'text-muted hover:bg-glass-hover hover:text-foreground'
          "
          @click="pickerTab = 'emoji'"
        >
          Emoji
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="pickerTab === 'icons'"
          class="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
          :class="
            pickerTab === 'icons'
              ? props.theme === 'forum'
                ? 'bg-glass-2 text-foreground ring-1 ring-border'
                : 'bg-[var(--vue-auto-003)] text-foreground ring-1 ring-border'
              : props.theme === 'forum'
                ? 'text-fg-soft hover:bg-glass-hover hover:text-fg-soft'
                : 'text-muted hover:bg-glass-hover hover:text-foreground'
          "
          @click="pickerTab = 'icons'"
        >
          Icons
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="pickerTab === 'stickers'"
          class="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
          :class="
            pickerTab === 'stickers'
              ? props.theme === 'forum'
                ? 'bg-glass-2 text-foreground ring-1 ring-border'
                : 'bg-[var(--vue-auto-003)] text-foreground ring-1 ring-border'
              : props.theme === 'forum'
                ? 'text-fg-soft hover:bg-glass-hover hover:text-fg-soft'
                : 'text-muted hover:bg-glass-hover hover:text-foreground'
          "
          title="Coming soon"
          @click="pickerTab = 'stickers'"
        >
          Stickers
        </button>
      </div>
      <div v-if="pickerTab === 'emoji'" class="flex flex-1 min-h-0">
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
            @contextmenu.stop.prevent="openPackCopyMenu($event, cat)"
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
            :active-emoji-index="
              cat.slug === 'search' ? emojiSearchSelectedIndex : undefined
            "
            @insert-emoji="handleInsert"
            @emoji-context-menu="openPackCopyMenu"
            @emoji-category-context-menu="openPackCopyMenu"
          />
          <div
            v-if="searchQuery.trim() && renderedCategories.length === 0"
            class="py-8 text-center text-sm text-muted"
          >
            No emojis match "{{ searchQuery.trim() }}"
          </div>
        </div>
      </div>
      <AppIconPickerPanel
        v-else-if="pickerTab === 'icons'"
        :filter-query="iconFilterDebounced"
        channel-type="text"
        class="min-h-0 flex-1"
        @select="handleIconInsert"
      />
      <StickerPickerPanel
        v-else
        :server-id="props.serverId"
        :theme="props.theme"
        class="min-h-0 flex-1"
        @send="handleStickerSend"
      />
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="packMenuOpen && contextPackCategory"
      ref="packMenuRef"
      class="ellipsis-menu fixed z-[120] min-w-[240px] py-1"
      :style="{
        left: `${packMenuPosition.left}px`,
        top: `${packMenuPosition.top}px`,
      }"
      role="menu"
      aria-label="Emoji pack actions"
      @contextmenu.prevent
    >
      <div
        class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle truncate border-b border-border"
      >
        {{ contextPackCategory.name }}
      </div>

      <button
        v-if="canSaveNewUserPack"
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-glass-hover"
        role="menuitem"
        @click="savePackAsNew"
      >
        Copy whole pack
      </button>

      <div v-else class="px-3 py-2 text-xs text-fg-subtle">
        Pack limit reached ({{ userLibrary.maxPacks }}). Replace a saved pack:
      </div>
      <template v-if="!canSaveNewUserPack">
        <button
          v-for="p in savedUserPacks"
          :key="p.id"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-glass-hover"
          role="menuitem"
          @click="replaceSavedPack(p.id)"
        >
          Replace: {{ p.name }}
        </button>
      </template>

      <div class="my-1 h-px bg-glass-2" role="separator" />
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-glass-hover"
        role="menuitem"
        @click="closePackCopyMenu"
      >
        Cancel
      </button>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.chat-popout {
  z-index: 30;

  /* Glass + blur live on .chat-liquid-glass-menu (main.scss); avoid a second inner blur layer — it reads as muddy / non-glassy */
  .chat-popout-inner {
    position: relative;
    background-color: transparent;
  }

  &::after {
    content: '';
    position: absolute;
    bottom: -6px;
    right: 1.5rem;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--vue-auto-040);
  }
}

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

:deep(.emoji-section .emoji-btn--active) {
  background: var(--vue-auto-003);
  box-shadow: inset 0 0 0 2px
    color-mix(in srgb, var(--vue-auto-008) 55%, transparent);
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
