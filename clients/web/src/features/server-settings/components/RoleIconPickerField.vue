<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toRef,
  watch,
} from 'vue';
import type { EmojiEntry } from '@/features/chat/emoji/useEmojiData';
import { ensureEmojiCategoriesLoaded } from '@/features/chat/emoji/useEmojiData';
import { useEmojiPicker } from '@/features/chat/emoji/useEmojiPicker';
import { useRecentlyUsedEmojis } from '@/features/chat/emoji/useRecentlyUsedEmojis';
import EmojiCategorySection from '@/components/EmojiCategorySection.vue';
import AppIconPickerPanel from '@/features/settings/AppIconPickerPanel.vue';
import { preloadEmojiImagesOnce } from '@/features/chat/emoji/useEmojiPreload';
import { useServerEmojiLibrary } from '@/features/chat/emoji/useServerEmojiLibrary';
import { useUserEmojiLibrary } from '@/features/chat/emoji/useUserEmojiLibrary';
import { ensureEmojiSearchPrebuildLoaded } from '@/features/chat/emoji/useEmojiSearchIndex';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import {
  requiresBundledMediaFallback,
  safeImageUrl,
} from '@/features/layout/display/safeImageUrl';
import { icons } from '@/assets/icons';
import { UIErrorBus } from '@/features/layout/failures/uiErrorBus';
import { getAllIconCatalogEntries } from '@/assets/iconCatalog';
import type { AppIconEntry } from '@/features/chat/emoji/useAppIconSearch';

const props = withDefaults(
  defineProps<{
    serverId?: string | null;
    disabled?: boolean;
    /** Resolved icon URL (upload, server emoji image, or twemoji asset URL). */
    roleIconUrl?: string | null;
    /** When no icon URL, show a muted tile (or use accent for a dot). */
    accentColor?: string | null;
    triggerTitle?: string | null;
    triggerAriaLabel?: string | null;
  }>(),
  {
    serverId: null,
    disabled: false,
    roleIconUrl: null,
    accentColor: null,
    triggerTitle: null,
    triggerAriaLabel: null,
  },
);

const emit = defineEmits<{
  'pick-entry': [entry: EmojiEntry];
  'pick-app-icon': [entry: AppIconEntry];
  /** Validated https/http image URL (stores as role icon URL only). */
  'pick-external-url': [url: string];
  'upload-file': [file: File];
  clear: [];
}>();

const serverIdRef = toRef(() => props.serverId ?? undefined);
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

const { addRecentlyUsed } = useRecentlyUsedEmojis();
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
});

type PickerTab = 'icons' | 'emoji' | 'upload';

const isOpen = ref(false);
const activeTab = ref<PickerTab>('emoji');
const triggerRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const popoverStyle = ref({ left: '0px', top: '0px' });
const emojiPrimedOnce = ref(false);
const iconFilterRaw = ref('');
const debouncedQuery = ref('');
const externalImageUrlDraft = ref('');

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

const searchFieldModel = computed({
  get() {
    return activeTab.value === 'icons'
      ? iconFilterRaw.value
      : searchQuery.value;
  },
  set(v: string) {
    if (activeTab.value === 'icons') iconFilterRaw.value = v;
    else searchQuery.value = v;
  },
});

const selectedAppIconId = computed(() => {
  const u = (props.roleIconUrl ?? '').trim();
  if (!u) return undefined;
  for (const e of getAllIconCatalogEntries()) {
    if (e.url === u) return e.id;
  }
  return undefined;
});

const displaySrc = computed(() => {
  const u = (props.roleIconUrl ?? '').trim();
  return u ? safeImageUrl(u) : '';
});

const hasIcon = computed(() => Boolean(displaySrc.value));

const accentStyle = computed(() => {
  const c = (props.accentColor ?? '').trim();
  return c ? { backgroundColor: c } : {};
});

async function primeEmojiData() {
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
  if (t === 'emoji') void primeEmojiData();
});

function updatePosition() {
  nextTick(() => {
    const el = triggerRef.value;
    if (!el) return;
    const w = Math.min(400, window.innerWidth - 32);
    let left = el.getBoundingClientRect().left;
    if (left + w > window.innerWidth - 16) {
      left = window.innerWidth - 16 - w;
    }
    if (left < 16) left = 16;

    const rect = el.getBoundingClientRect();
    const gap = 8;
    const margin = 16;
    const popoverH =
      popoverRef.value?.getBoundingClientRect().height ||
      Math.min(340, window.innerHeight - margin * 2);

    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const shouldOpenTop = spaceBelow < popoverH && spaceAbove > spaceBelow;

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

async function open() {
  if (props.disabled) return;
  activeTab.value = 'emoji';
  iconFilterRaw.value = '';
  debouncedQuery.value = '';
  searchQuery.value = '';
  externalImageUrlDraft.value = '';
  isOpen.value = true;
  await primeEmojiData();
  updatePosition();
}

function close() {
  isOpen.value = false;
}

function onTriggerClick() {
  if (isOpen.value) close();
  else void open();
}

function onPick(entry: EmojiEntry) {
  addRecentlyUsed(entry);
  if (entry.kind === 'custom' && entry.id) {
    const sid = (props.serverId ?? '').trim();
    if (!sid || !entry.serverId || entry.serverId === sid) {
      void library.recordUsage(entry.id);
    }
  }
  emit('pick-entry', entry);
  close();
}

function applyExternalImageUrl() {
  const raw = externalImageUrlDraft.value.trim();
  if (!raw || requiresBundledMediaFallback(raw)) {
    UIErrorBus.emit({
      context: 'role-icon-picker',
      severity: 'info',
      userMessage: 'Paste a valid http(s) or // image URL.',
    });
    return;
  }
  emit('pick-external-url', safeImageUrl(raw));
  externalImageUrlDraft.value = '';
  close();
}

function onAppIconPick(entry: AppIconEntry) {
  emit('pick-app-icon', entry);
  close();
}

function onUploadClick() {
  fileInputRef.value?.click();
}

function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit('upload-file', file);
  input.value = '';
  close();
}

function onClear() {
  emit('clear');
  close();
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (popoverRef.value?.contains(target) || triggerRef.value?.contains(target))
    return;
  close();
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (!isOpen.value) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

watch(isOpen, (open) => {
  if (open) updatePosition();
});

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
  window.addEventListener('resize', updatePosition);
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  window.removeEventListener('resize', updatePosition);
  window.removeEventListener('keydown', onGlobalKeydown);
  if (iconSearchTimer) clearTimeout(iconSearchTimer);
});
</script>

<template>
  <div class="relative inline-flex shrink-0">
    <button
      ref="triggerRef"
      type="button"
      class="role-icon-picker-trigger flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-glass-2 ring-1 ring-border transition-colors hover:bg-glass-hover disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="disabled"
      :title="triggerTitle ?? 'Role icon'"
      :aria-label="triggerAriaLabel ?? 'Choose role icon'"
      @click.stop="onTriggerClick"
    >
      <PausedGifAvatar
        v-if="displaySrc"
        :src="displaySrc"
        alt=""
        img-object-fit="contain"
      />
      <span
        v-else-if="accentStyle.backgroundColor"
        class="block h-6 w-6 rounded-md ring-1 ring-white/15"
        :style="accentStyle"
      />
      <img
        v-else
        :src="icons.imageGallery"
        alt=""
        class="h-5 w-5 opacity-55 filter invert"
      />
    </button>
    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      accept="image/png,image/jpeg,image/webp,image/gif"
      @change="onFileChange"
    />

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="popoverRef"
        class="role-icon-picker-popover chat-liquid-glass-menu chat-liquid-glass-menu--over-modal fixed z-[200] flex w-[min(400px,calc(100vw-2rem))] max-h-[min(420px,calc(100vh-120px))] flex-col overflow-hidden"
        :style="popoverStyle"
        @click.stop
      >
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
          <div
            v-if="activeTab !== 'upload'"
            class="flex items-center gap-2 border-b border-border/60 px-3 py-2.5"
          >
            <img
              :src="icons.search"
              alt=""
              class="h-4 w-4 shrink-0 opacity-50 filter invert"
            />
            <input
              v-model="searchFieldModel"
              type="search"
              :placeholder="
                activeTab === 'icons' ? 'Search icons…' : 'Search emoji…'
              "
              class="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-fg outline-none placeholder:text-fg-subtle"
              @keydown.escape.prevent="close"
            />
          </div>

          <div
            class="flex flex-wrap items-center gap-1 border-b border-border/60 px-3 py-2"
          >
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
              :class="
                activeTab === 'icons'
                  ? 'bg-glass-2 text-fg-strong ring-1 ring-border'
                  : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
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
                  ? 'bg-glass-2 text-fg-strong ring-1 ring-border'
                  : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
              "
              @click="activeTab = 'emoji'"
            >
              Emoji
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
              :class="
                activeTab === 'upload'
                  ? 'bg-glass-2 text-fg-strong ring-1 ring-border'
                  : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
              "
              @click="activeTab = 'upload'"
            >
              Upload
            </button>
          </div>

          <p
            v-if="activeTab === 'emoji'"
            class="px-3 py-1.5 text-[11px] leading-snug text-fg-subtle"
          >
            Standard emoji use Twemoji assets. Custom emoji from this server
            stores the emoji id; emoji from other servers save the image URL
            only. Use Upload → Image URL for any https icon.
          </p>

          <AppIconPickerPanel
            v-if="activeTab === 'icons'"
            :filter-query="debouncedQuery"
            channel-type="text"
            :selected-id="selectedAppIconId"
            class="min-h-0 flex-1"
            @select="onAppIconPick"
          />

          <div
            v-else-if="activeTab === 'emoji'"
            class="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
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
                v-if="!searchQuery.trim()"
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
                class="role-icon-picker-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden py-1 pl-1.5 pr-2 pb-2.5 custom-scrollbar"
                v-scrollbar-on-scroll
              >
                <EmojiCategorySection
                  v-for="(cat, idx) in renderedCategories"
                  :key="
                    cat.slug === 'search' ? `search-${searchQuery}` : cat.slug
                  "
                  :ref="(el) => setSectionRef(cat.slug, el)"
                  :category="cat"
                  :scroll-root="scrollContainerRef"
                  :priority="idx === 0"
                  @insert-emoji="onPick"
                />
                <div
                  v-if="searchQuery.trim() && renderedCategories.length === 0"
                  class="py-8 text-center text-sm text-fg-subtle"
                >
                  No emojis match "{{ searchQuery.trim() }}"
                </div>
              </div>
            </div>
          </div>

          <div
            v-else
            class="flex min-h-0 flex-1 flex-col items-stretch justify-center gap-3 px-4 py-6"
          >
            <p class="text-center text-sm text-fg-subtle">
              PNG, JPEG, WebP, or GIF. Uploaded files are stored as your server
              icon asset URL.
            </p>
            <label class="flex flex-col gap-1.5 text-left">
              <span class="text-[11px] font-medium text-fg-soft"
                >Image URL (any server or CDN)</span
              >
              <input
                v-model="externalImageUrlDraft"
                type="url"
                inputmode="url"
                autocomplete="off"
                placeholder="https://…"
                class="w-full rounded-lg border border-border/60 bg-glass-1 px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-border"
                @keydown.enter.prevent="applyExternalImageUrl"
              />
            </label>
            <button
              type="button"
              class="rounded-xl bg-glass-2 px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-glass-hover disabled:opacity-40"
              :disabled="!externalImageUrlDraft.trim()"
              @click="applyExternalImageUrl"
            >
              Use image URL
            </button>
            <button
              type="button"
              class="rounded-xl bg-glass-2 px-4 py-3 text-sm font-semibold text-fg transition-colors hover:bg-glass-hover"
              @click="onUploadClick"
            >
              Choose image…
            </button>
          </div>

          <div
            v-if="hasIcon"
            class="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-3 py-2"
          >
            <button
              type="button"
              class="echo-destructive-action rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              @click="onClear"
            >
              Remove icon
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.role-icon-picker-scroll {
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
  /* Match channel icon picker rail: enough width for 32px buttons + padding */
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
