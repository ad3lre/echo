<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
  toRef,
} from 'vue';
import {
  icons,
  makeCustomEmojiChannelIconKey,
  makeEmojiIconKey,
  parseCustomEmojiChannelIconKey,
  parseEmojiIconKey,
  resolveIconKeyToUrl,
} from '@/assets/icons';
import { ensureIconCatalogLoaded } from '@/assets/iconCatalog';
import type { AppIconEntry } from '@/composables/useAppIconSearch';
import { ensureEmojiCategoriesLoaded } from '@/composables/useEmojiData';
import type { EmojiEntry } from '@/composables/useEmojiData';
import { ensureEmojiSearchPrebuildLoaded } from '@/composables/useEmojiSearchIndex';
import { useEmojiPicker } from '@/composables/useEmojiPicker';
import { useServerEmojiLibrary } from '@/composables/useServerEmojiLibrary';
import { useUserEmojiLibrary } from '@/composables/useUserEmojiLibrary';
import { useChannelIconResolver } from '@/composables/useChannelIconResolver';
import { preloadEmojiImagesOnce } from '@/composables/useEmojiPreload';
import EmojiCategorySection from '@/components/EmojiCategorySection.vue';
import AppIconPickerPanel from '@/features/settings/components/AppIconPickerPanel.vue';
import {
  channelIconKeyUsesSvgInvertFilter,
  resolveChannelIconRasterUrl,
} from '@/utils/channelIconKeys';
import { safeCustomEmojiUrl } from '@/utils/customEmojiUrl';
import { UIErrorBus } from '@/utils/uiErrorBus';

const props = withDefaults(
  defineProps<{
    /** Curated key (e.g. `message`) or exact `icons/` filename (e.g. `volume up.svg`). */
    modelValue: string;
    /** Controls semantic sort: chat-like icons first vs voice-like icons first. */
    channelType?: 'text' | 'voice';
    /** `combined` = left segment inside a shared glass row (no separate box). */
    variant?: 'default' | 'combined';
    placement?: 'bottom' | 'top' | 'auto';
    /** Server scope for emoji picker packs (optional). */
    serverId?: string;
  }>(),
  { channelType: 'text', variant: 'default', placement: 'bottom' },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const serverIdRef = toRef(props, 'serverId');
const library = useServerEmojiLibrary(serverIdRef);
const userLibrary = useUserEmojiLibrary();
const channelIconResolver = useChannelIconResolver(serverIdRef);
const serverPackCategories = computed(() => library.pickerPackCategories());
const customEmojiSearchList = computed(() => [
  ...library.flatCustomEmojis.value,
  ...userLibrary.savedEntries.value,
]);
const userPackCategories = computed(
  () => userLibrary.pickerPackCategories.value,
);

const {
  searchQuery: emojiSearchQuery,
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
});

/* ---- state ---- */
const isOpen = ref(false);
const activeTab = ref<'icons' | 'emoji'>('icons');
const triggerRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const iconFilterRaw = ref('');
const debouncedQuery = ref('');
const popoverStyle = ref({ left: '0px', top: '0px' });
const emojiPrimedOnce = ref(false);
const emojiSearchSelectedIndex = ref(0);

/* ---- debounced icon search (instant on clear, 150 ms on typing) ---- */
let iconSearchTimer: ReturnType<typeof setTimeout> | null = null;

watch(iconFilterRaw, (q) => {
  if (iconSearchTimer) clearTimeout(iconSearchTimer);
  if (!q.trim()) {
    debouncedQuery.value = q;
  } else {
    iconSearchTimer = setTimeout(() => {
      debouncedQuery.value = q;
    }, 150);
  }
});

const combinedSearch = computed({
  get() {
    return activeTab.value === 'icons'
      ? iconFilterRaw.value
      : emojiSearchQuery.value;
  },
  set(v: string) {
    if (activeTab.value === 'icons') iconFilterRaw.value = v;
    else emojiSearchQuery.value = v;
  },
});

const emojiSearchResults = computed(() => {
  if (activeTab.value !== 'emoji') return [];
  if (!emojiSearchQuery.value.trim()) return [];
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
  if (activeTab.value !== 'emoji') return;
  if (!emojiSearchQuery.value.trim()) return;
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
    if (picked) handleEmojiPick(picked);
  }
}

watch(
  [activeTab, () => emojiSearchQuery.value, () => emojiSearchResults.value],
  () => {
    emojiSearchSelectedIndex.value = 0;
    nextTick(scrollActiveSearchResultIntoView);
  },
  { immediate: true, flush: 'post' },
);

async function primeEmojiPickerData(): Promise<void> {
  if (emojiPrimedOnce.value) {
    nextTick(() => requestAnimationFrame(advanceToPhase2));
    return;
  }
  await ensureEmojiSearchPrebuildLoaded();
  await ensureEmojiCategoriesLoaded();
  preloadEmojiImagesOnce();
  emojiPrimedOnce.value = true;
  nextTick(() => requestAnimationFrame(advanceToPhase2));
}

watch(activeTab, (t) => {
  if (t === 'emoji') void primeEmojiPickerData();
});

function lookupCustomEmojiUrl(emojiId: string): string | null {
  return channelIconResolver.lookupCustomEmojiUrl(emojiId) ?? null;
}

/* ---- trigger preview: catalog is lazy; resolve filename keys after load ---- */
const triggerDisplayUrl = ref(
  resolveChannelIconRasterUrl(props.modelValue, lookupCustomEmojiUrl) ??
    resolveIconKeyToUrl(props.modelValue, lookupCustomEmojiUrl),
);
const triggerEmoji = computed(() => parseEmojiIconKey(props.modelValue));
const triggerIsUnicodeEmoji = computed(() => !!triggerEmoji.value);
const triggerIsRasterImage = computed(
  () =>
    !triggerIsUnicodeEmoji.value &&
    !!resolveChannelIconRasterUrl(props.modelValue, lookupCustomEmojiUrl),
);
const triggerUsesSvgInvert = computed(() =>
  channelIconKeyUsesSvgInvertFilter(props.modelValue),
);

async function syncTriggerIconUrl() {
  if (parseEmojiIconKey(props.modelValue)) return;
  const raster = resolveChannelIconRasterUrl(
    props.modelValue,
    lookupCustomEmojiUrl,
  );
  if (raster) {
    triggerDisplayUrl.value = raster;
    return;
  }
  await ensureIconCatalogLoaded();
  triggerDisplayUrl.value = resolveIconKeyToUrl(
    props.modelValue,
    lookupCustomEmojiUrl,
  );
}

function updatePosition() {
  nextTick(() => {
    const el = triggerRef.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const w = Math.min(400, window.innerWidth - 32);
    let left = rect.left;
    if (left + w > window.innerWidth - 16) {
      left = window.innerWidth - 16 - w;
    }
    if (left < 16) left = 16;

    const gap = 8;
    const margin = 16;
    const popoverH =
      popoverRef.value?.getBoundingClientRect().height ||
      Math.min(360, window.innerHeight - margin * 2);

    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const shouldOpenTop =
      props.placement === 'top' ||
      (props.placement === 'auto' &&
        spaceBelow < popoverH &&
        spaceAbove > spaceBelow);

    let top = shouldOpenTop ? rect.top - gap - popoverH : rect.bottom + gap;
    if (top < margin) top = margin;
    if (top + popoverH > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - margin - popoverH);
    }

    popoverStyle.value = {
      left: `${left}px`,
      top: `${top}px`,
    };
  });
}

/* ---- open / close / select ---- */
function open() {
  iconFilterRaw.value = '';
  debouncedQuery.value = '';
  emojiSearchQuery.value = '';
  activeTab.value =
    parseEmojiIconKey(props.modelValue) ||
    parseCustomEmojiChannelIconKey(props.modelValue)
      ? 'emoji'
      : 'icons';

  isOpen.value = true;
  updatePosition();
  if (activeTab.value === 'emoji') void primeEmojiPickerData();
}

function select(entry: AppIconEntry) {
  emit('update:modelValue', entry.id);
  close();
}

function handleEmojiPick(entry: EmojiEntry) {
  if (entry.kind === 'custom') {
    const id = (entry.id ?? '').trim();
    const url = safeCustomEmojiUrl(entry.imageUrl);
    if (!id || !url) {
      UIErrorBus.emit({
        context: 'channel-icon-emoji',
        severity: 'info',
        userMessage:
          'This emoji cannot be used as the channel icon (untrusted or invalid image URL).',
      });
      return;
    }
    const sid = (props.serverId ?? '').trim();
    if (sid && entry.serverId === sid) {
      void library.recordUsage(id);
    }
    addRecentlyUsed(entry);
    emit('update:modelValue', makeCustomEmojiChannelIconKey(id));
    close();
    return;
  }
  addRecentlyUsed(entry);
  emit('update:modelValue', makeEmojiIconKey(entry.emoji));
  close();
}

function close() {
  isOpen.value = false;
}

/* ---- outside click ---- */
function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (popoverRef.value?.contains(target) || triggerRef.value?.contains(target))
    return;
  close();
}

watch(isOpen, (open) => {
  if (open) updatePosition();
});

watch(
  () => [props.modelValue, channelIconResolver.resolverRevision.value] as const,
  () => {
    void syncTriggerIconUrl();
  },
);

onMounted(() => {
  void syncTriggerIconUrl();
  document.addEventListener('mousedown', handleClickOutside);
  window.addEventListener('resize', updatePosition);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  window.removeEventListener('resize', updatePosition);
  if (iconSearchTimer) clearTimeout(iconSearchTimer);
});
</script>

<template>
  <div
    class="relative flex"
    :class="
      variant === 'combined'
        ? 'h-full min-h-0 shrink-0 self-stretch'
        : 'inline-flex'
    "
  >
    <button
      ref="triggerRef"
      type="button"
      class="channel-icon-trigger flex shrink-0 items-center justify-center transition-colors"
      :class="
        variant === 'combined'
          ? 'h-full min-h-[44px] w-12 rounded-none border-0 bg-transparent hover:bg-glass-2'
          : 'h-11 w-11 rounded-xl bg-glass-2 ring-1 ring-border hover:bg-glass-hover'
      "
      title="Channel icon"
      aria-label="Choose channel icon"
      @click="open()"
    >
      <span
        v-if="triggerIsUnicodeEmoji"
        class="flex items-center justify-center leading-none"
        :class="
          variant === 'combined' ? 'h-5 w-5 text-[16px]' : 'h-6 w-6 text-[18px]'
        "
        >{{ triggerEmoji }}</span
      >
      <img
        v-else
        :src="triggerDisplayUrl"
        alt=""
        class="object-contain opacity-90"
        :class="[
          variant === 'combined' ? 'h-5 w-5' : 'h-6 w-6',
          triggerUsesSvgInvert ? 'filter invert' : '',
        ]"
      />
    </button>
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="popoverRef"
        class="channel-icon-popover chat-liquid-glass-menu chat-liquid-glass-menu--over-modal fixed z-[200] flex max-h-[min(420px,calc(100vh-120px))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden"
        :style="{ ...popoverStyle, width: 'min(400px, calc(100vw - 2rem))' }"
      >
        <div class="channel-icon-popover-inner flex min-h-0 flex-1 flex-col">
          <div class="flex items-center gap-2 px-3 py-2.5">
            <img
              :src="icons.search"
              alt=""
              class="h-4 w-4 shrink-0 opacity-50 filter invert"
            />
            <input
              v-model="combinedSearch"
              type="search"
              :placeholder="
                activeTab === 'emoji' ? 'Search emoji…' : 'Search icons…'
              "
              class="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-fg-subtle"
              @keydown="handleSearchInputKeydown"
              @keydown.escape.prevent="close"
            />
          </div>

          <div class="flex items-center gap-1 px-3 pb-2">
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
              :class="
                activeTab === 'icons'
                  ? 'bg-glass-2 text-foreground ring-1 ring-border'
                  : 'text-fg-soft hover:bg-glass-hover hover:text-fg-soft'
              "
              @click="activeTab = 'icons'"
            >
              Icons
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
              :class="
                activeTab === 'emoji'
                  ? 'bg-glass-2 text-foreground ring-1 ring-border'
                  : 'text-fg-soft hover:bg-glass-hover hover:text-fg-soft'
              "
              @click="activeTab = 'emoji'"
            >
              Emoji
            </button>
          </div>

          <AppIconPickerPanel
            v-if="activeTab === 'icons'"
            :filter-query="debouncedQuery"
            :channel-type="channelType"
            :selected-id="modelValue"
            class="min-h-0 flex-1"
            @select="select"
          />

          <div v-else class="flex min-h-0 flex-1 flex-col">
            <div
              v-if="!emojiPrimedOnce"
              class="flex flex-1 items-center justify-center py-10 text-sm text-fg-subtle"
              role="status"
              aria-live="polite"
              aria-label="Loading emoji"
            >
              Loading emoji…
            </div>
            <div v-else class="flex min-h-0 flex-1 overflow-hidden">
              <div
                v-if="!emojiSearchQuery.trim()"
                class="emoji-nav-wrap flex min-h-0 shrink-0 flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden px-2 py-2 custom-scrollbar"
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
                    class="emoji custom-emoji h-[18px] w-[18px] max-h-[18px] max-w-[18px] object-contain"
                    :src="cat.navIconImageUrl"
                    :alt="cat.navIconImageAlt ?? cat.name"
                    draggable="false"
                  />
                  <span v-else v-html="cat.navIconHtml" />
                </button>
              </div>
              <div
                ref="scrollContainerRef"
                class="channel-icon-emoji-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden py-1 pl-1.5 pr-2 pb-2.5 custom-scrollbar"
                v-scrollbar-on-scroll
              >
                <EmojiCategorySection
                  v-for="(cat, idx) in renderedCategories"
                  :key="
                    cat.slug === 'search'
                      ? `search-${emojiSearchQuery}`
                      : cat.slug
                  "
                  :ref="(el) => setSectionRef(cat.slug, el)"
                  :category="cat"
                  :scroll-root="scrollContainerRef"
                  :priority="idx === 0"
                  :active-emoji-index="
                    cat.slug === 'search' ? emojiSearchSelectedIndex : undefined
                  "
                  @insert-emoji="handleEmojiPick"
                />
                <div
                  v-if="
                    emojiSearchQuery.trim() && renderedCategories.length === 0
                  "
                  class="py-8 text-center text-sm text-fg-subtle"
                >
                  No emojis match "{{ emojiSearchQuery.trim() }}"
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
/* Outer popover styling lives on `.chat-liquid-glass-menu--over-modal`
 * (frontend/src/assets/main.scss) so it stays in sync with the role icon
 * picker (and any future picker teleported over the settings modal). */

.channel-icon-emoji-scroll {
  scrollbar-gutter: stable;
}

.emoji-nav-btn :deep(.emoji) {
  width: 18px !important;
  height: 18px !important;
  max-width: 18px !important;
  max-height: 18px !important;
  object-fit: contain;
  display: block;
}

.emoji-nav-wrap {
  width: 3rem;
  min-width: 3rem;
  box-sizing: border-box;
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
</style>
