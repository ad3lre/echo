<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { copyToClipboard } from '@/features/chat/composables/useMessageLinkActions';
import { useDevSettingsStore } from '@/stores/devSettings';
import { linkTokenCustomEmoji } from '@/utils/idTokens';
import EmojiPackTagsField from '@/features/server-settings/components/EmojiPackTagsField.vue';
import { icons } from '@/assets/icons';
import type {
  ManagedEmoji,
  ManagedEmojiPack,
  ManagedSticker,
} from '@/features/server-settings/composables/useServerSettingsEmoji';

const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);

/** Left list focus: pack settings, add rows, or a real emoji/sticker (null = use selection only). */
type ListExtra = 'settings' | 'add' | 'add-sticker' | null;
const listExtra = ref<ListExtra>(null);
const addEmojiFileInputRef = ref<HTMLInputElement | null>(null);
const addStickerFileInputRef = ref<HTMLInputElement | null>(null);

function onEmojiRowContextMenu(
  ev: MouseEvent,
  emojiId: string,
  emojiName: string,
) {
  if (!devModeIdsEnabled.value) return;
  ev.preventDefault();
  ev.stopPropagation();
  copyToClipboard(linkTokenCustomEmoji(emojiName || 'emoji', emojiId));
}

const isEmojiDropActive = ref(false);
const isAddRowDropActive = ref(false);
const selectedMarketPreviewPackId = ref('');

const props = defineProps<{
  maxEmojiPacks: number;
  maxEmojisPerPack: number;
  emojiPackDescriptionMinLen: number;
  emojiSearchQuery: string;
  selectedEmojiPackId: string;
  selectedEmojiId: string;
  selectedStickerId: string;
  customEmojiPackName: string;
  customEmojiPackDescription: string;
  customEmojiPackTags: string[];
  customEmojiPackListedInMarket: boolean;
  packEditDescription: string;
  packEditTags: string[];
  packEditListedInMarket: boolean;
  saveCustomPackMarketDetails: () => void | Promise<void>;
  emojiPackMarketSearch: string;
  emojiPackModalOpen: boolean;
  emojiPackModalTab: 'create' | 'market';
  emojiUploadFeedback: {
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null;
  serverEmojiPacks: ManagedEmojiPack[];
  canImportMorePacks: boolean;
  selectedEmojiPack: ManagedEmojiPack | null;
  selectedEmoji: ManagedEmoji | null;
  selectedSticker: ManagedSticker | null;
  filteredPackEmojis: ManagedEmoji[];
  filteredPackStickers: ManagedSticker[];
  filteredMarketEmojiPacks: ManagedEmojiPack[];
  marketEmojiPacksLoading: boolean;
  marketEmojiPacksError: string | null;
  refreshMarketEmojiPacks: () => void | Promise<void>;
  loadMarketPackDetail: (packId: string) => void | Promise<void>;
  createCustomEmojiPack: () => void;
  importMarketEmojiPack: (packId: string) => void;
  onEmojiUploadFile: (file: File) => void | Promise<void>;
  onEmojiUploadFileChange: (event: Event) => void;
  onStickerUploadFileChange: (event: Event) => void;
  removeEmoji: (emojiId: string) => void;
  removeSticker: (stickerId: string) => void;
  updateSelectedEmojiName: (name: string) => void;
  forkSelectedEmojiPack: () => void;
  openEmojiPackModal: (tab: 'create' | 'market') => void;
  closeEmojiPackModal: () => void;
}>();

const emit = defineEmits<{
  'update:emojiSearchQuery': [value: string];
  'update:selectedEmojiPackId': [value: string];
  'update:selectedEmojiId': [value: string];
  'update:selectedStickerId': [value: string];
  'update:emojiPackModalTab': [value: 'create' | 'market'];
  'update:customEmojiPackName': [value: string];
  'update:customEmojiPackDescription': [value: string];
  'update:customEmojiPackTags': [value: string[]];
  'update:customEmojiPackListedInMarket': [value: boolean];
  'update:packEditDescription': [value: string];
  'update:packEditTags': [value: string[]];
  'update:packEditListedInMarket': [value: boolean];
  'update:emojiPackMarketSearch': [value: string];
}>();

const customEmojiPackTagsModel = computed({
  get: () => props.customEmojiPackTags,
  set: (v: string[]) => emit('update:customEmojiPackTags', v),
});

const packEditTagsModel = computed({
  get: () => props.packEditTags,
  set: (v: string[]) => emit('update:packEditTags', v),
});

async function onEmojiDrop(event: DragEvent) {
  isEmojiDropActive.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  await props.onEmojiUploadFile(file);
}

async function onAddRowDrop(event: DragEvent) {
  isAddRowDropActive.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  listExtra.value = 'add';
  await props.onEmojiUploadFile(file);
}

function selectEmojiRow(emojiId: string) {
  listExtra.value = null;
  emit('update:selectedStickerId', '');
  emit('update:selectedEmojiId', emojiId);
}

function selectStickerRow(stickerId: string) {
  listExtra.value = null;
  emit('update:selectedEmojiId', '');
  emit('update:selectedStickerId', stickerId);
}

function selectSettingsRow() {
  listExtra.value = 'settings';
}

function selectAddRow() {
  listExtra.value = 'add';
}

function selectAddStickerRow() {
  listExtra.value = 'add-sticker';
}

function openAddEmojiFilePicker() {
  listExtra.value = 'add';
  nextTick(() => addEmojiFileInputRef.value?.click());
}

function openAddStickerFilePicker() {
  listExtra.value = 'add-sticker';
  nextTick(() => addStickerFileInputRef.value?.click());
}

function packExpressionCount(pack: {
  emojis?: unknown[];
  stickers?: unknown[];
}) {
  return (pack.emojis?.length ?? 0) + (pack.stickers?.length ?? 0);
}

const canAddMoreExpressions = computed(
  () =>
    props.selectedEmojiPack?.source === 'custom' &&
    packExpressionCount(props.selectedEmojiPack) < props.maxEmojisPerPack,
);

const showPackSettingsPanel = computed(
  () =>
    props.selectedEmojiPack?.source === 'custom' &&
    listExtra.value === 'settings',
);

const showAddEmojiPanel = computed(
  () =>
    props.selectedEmojiPack?.source === 'custom' && listExtra.value === 'add',
);

const showAddStickerPanel = computed(
  () =>
    props.selectedEmojiPack?.source === 'custom' &&
    listExtra.value === 'add-sticker',
);

const showEmojiDetailPanel = computed(
  () =>
    !showPackSettingsPanel.value &&
    !showAddEmojiPanel.value &&
    !showAddStickerPanel.value &&
    !!props.selectedEmoji &&
    props.selectedEmojiPack !== null,
);

const showStickerDetailPanel = computed(
  () =>
    !showPackSettingsPanel.value &&
    !showAddEmojiPanel.value &&
    !showAddStickerPanel.value &&
    !!props.selectedSticker &&
    props.selectedEmojiPack !== null,
);

watch(
  () => props.selectedEmojiPackId,
  () => {
    listExtra.value = null;
  },
);

watch(
  () =>
    [
      props.selectedEmojiPackId,
      props.selectedEmojiPack?.source,
      packExpressionCount(props.selectedEmojiPack ?? {}),
    ] as const,
  ([, source, n]) => {
    if (source === 'custom' && n === 0) {
      listExtra.value = 'settings';
    }
  },
  { immediate: true },
);

watch(
  () => packExpressionCount(props.selectedEmojiPack ?? {}),
  (n) => {
    if (props.selectedEmojiPack?.source === 'custom' && n === 0) {
      listExtra.value = 'settings';
    }
  },
);

const selectedMarketPreviewPack = computed(() => {
  if (!selectedMarketPreviewPackId.value) return null;
  return (
    props.filteredMarketEmojiPacks.find(
      (pack) => pack.id === selectedMarketPreviewPackId.value,
    ) ?? null
  );
});

watch(
  () => props.emojiPackModalOpen,
  (open) => {
    if (!open) return;
    selectedMarketPreviewPackId.value =
      props.filteredMarketEmojiPacks[0]?.id ?? '';
  },
);

watch(selectedMarketPreviewPackId, (packId) => {
  if (packId) void props.loadMarketPackDetail(packId);
});

watch(
  () => props.filteredMarketEmojiPacks,
  (packs) => {
    if (!packs.length) {
      selectedMarketPreviewPackId.value = '';
      return;
    }
    if (!packs.some((pack) => pack.id === selectedMarketPreviewPackId.value)) {
      selectedMarketPreviewPackId.value = packs[0]!.id;
    }
  },
  { deep: true },
);
</script>

<template>
  <div class="server-settings-emoji flex flex-col gap-4">
    <div
      class="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:items-stretch"
    >
      <div class="roles-panel flex min-h-0 min-w-0 flex-col rounded-2xl p-5">
        <div class="roles-toolbar">
          <input
            :value="props.emojiSearchQuery"
            class="roles-toolbar-search min-w-0 flex-1"
            type="text"
            placeholder="Search emojis & stickers"
            @input="
              $emit(
                'update:emojiSearchQuery',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
          <button
            v-if="props.selectedEmojiPack?.source === 'market'"
            type="button"
            class="ml-2 shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
            :disabled="!props.canImportMorePacks"
            @click="props.forkSelectedEmojiPack"
          >
            Fork Pack
          </button>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button
            v-for="pack in props.serverEmojiPacks"
            :key="pack.id"
            type="button"
            class="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            :class="
              pack.id === props.selectedEmojiPackId
                ? 'bg-glass-3 text-fg-strong'
                : 'text-fg-subtle hover:text-fg-soft hover:bg-glass-hover'
            "
            @click="$emit('update:selectedEmojiPackId', pack.id)"
          >
            {{ pack.name }}
            <span class="ml-1 text-fg-subtle">{{
              (pack.emojis?.length ?? 0) + (pack.stickers?.length ?? 0)
            }}</span>
          </button>
          <button
            type="button"
            class="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            :class="
              props.canImportMorePacks
                ? 'text-fg-soft hover:text-fg hover:bg-glass-hover'
                : 'cursor-not-allowed text-fg-subtle'
            "
            :disabled="!props.canImportMorePacks"
            @click="props.openEmojiPackModal('market')"
          >
            +
          </button>
        </div>

        <div
          class="mt-4 h-[55vh] min-h-[340px] max-h-[70vh] overflow-y-auto custom-scrollbar"
        >
          <input
            ref="addEmojiFileInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            :disabled="!canAddMoreExpressions"
            @change="props.onEmojiUploadFileChange"
          />
          <input
            ref="addStickerFileInputRef"
            type="file"
            accept="image/png,image/gif,image/apng,.png,.gif,.apng"
            class="hidden"
            :disabled="!canAddMoreExpressions"
            @change="props.onStickerUploadFileChange"
          />
          <div class="divide-y divide-white/5">
            <button
              v-if="props.selectedEmojiPack?.source === 'custom'"
              type="button"
              class="w-full py-2.5 px-2 text-left transition-colors"
              :class="
                listExtra === 'settings' ? 'bg-glass-1' : 'hover:bg-glass-hover'
              "
              @click="selectSettingsRow"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-glass-2"
                  aria-hidden="true"
                >
                  <img
                    :src="icons.settings"
                    alt=""
                    class="h-[18px] w-[18px] opacity-[0.55] filter invert"
                  />
                </div>
                <div class="min-w-0">
                  <div class="truncate font-semibold text-fg text-sm">
                    Pack settings
                  </div>
                  <div class="truncate text-[11px] text-fg-subtle">
                    Marketplace &amp; listing
                  </div>
                </div>
              </div>
            </button>

            <button
              v-for="e in props.filteredPackEmojis"
              :key="e.id"
              type="button"
              class="w-full py-2.5 px-2 text-left transition-colors"
              :class="
                listExtra === null && e.id === props.selectedEmojiId
                  ? 'bg-glass-1'
                  : 'hover:bg-glass-hover'
              "
              @click="selectEmojiRow(e.id)"
              @contextmenu="onEmojiRowContextMenu($event, e.id, e.name)"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-3">
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-glass-1"
                  >
                    <img
                      v-if="e.previewUrl"
                      :src="safeImageUrl(e.previewUrl)"
                      alt=""
                      class="h-full w-full object-contain"
                    />
                    <span v-else class="text-base">{{ e.char }}</span>
                  </div>
                  <div class="min-w-0">
                    <div class="truncate font-semibold text-fg text-sm">
                      {{ e.name }}
                    </div>
                  </div>
                </div>
              </div>
            </button>

            <button
              v-for="s in props.filteredPackStickers"
              :key="`sticker-${s.id}`"
              type="button"
              class="w-full py-2.5 px-2 text-left transition-colors"
              :class="
                listExtra === null && s.id === props.selectedStickerId
                  ? 'bg-glass-1'
                  : 'hover:bg-glass-hover'
              "
              @click="selectStickerRow(s.id)"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-3">
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-glass-1"
                  >
                    <img
                      v-if="s.previewUrl"
                      :src="safeImageUrl(s.previewUrl)"
                      alt=""
                      class="h-full w-full object-contain"
                    />
                  </div>
                  <div class="min-w-0">
                    <div class="truncate font-semibold text-fg text-sm">
                      {{ s.name }}
                    </div>
                    <div class="truncate text-[11px] text-fg-subtle">
                      Sticker
                    </div>
                  </div>
                </div>
              </div>
            </button>

            <button
              v-if="
                props.selectedEmojiPack?.source === 'custom' &&
                canAddMoreExpressions
              "
              type="button"
              class="group w-full py-2.5 px-2 text-left transition-colors"
              :class="
                listExtra === 'add' ? 'bg-glass-1' : 'hover:bg-glass-hover'
              "
              @click="selectAddRow"
              @dblclick.prevent="openAddEmojiFilePicker"
              @dragenter.prevent="isAddRowDropActive = true"
              @dragover.prevent="isAddRowDropActive = true"
              @dragleave.prevent="isAddRowDropActive = false"
              @drop.prevent="onAddRowDrop"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                  :class="
                    isAddRowDropActive
                      ? 'bg-glass-2 text-fg'
                      : 'bg-glass-2 text-fg-subtle group-hover:bg-glass-hover group-hover:text-fg-soft'
                  "
                >
                  <span class="text-lg font-light leading-none">+</span>
                </div>
                <div class="min-w-0">
                  <div class="truncate font-semibold text-fg text-sm">
                    Add emoji
                  </div>
                  <div class="truncate text-[11px] text-fg-subtle">
                    Click, double-click to browse, or drop an image
                  </div>
                </div>
              </div>
            </button>

            <button
              v-if="
                props.selectedEmojiPack?.source === 'custom' &&
                canAddMoreExpressions
              "
              type="button"
              class="group w-full py-2.5 px-2 text-left transition-colors"
              :class="
                listExtra === 'add-sticker'
                  ? 'bg-glass-1'
                  : 'hover:bg-glass-hover'
              "
              @click="selectAddStickerRow"
              @dblclick.prevent="openAddStickerFilePicker"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-glass-2 text-fg-subtle transition-colors group-hover:bg-glass-hover group-hover:text-fg-soft"
                >
                  <span class="text-lg font-light leading-none">+</span>
                </div>
                <div class="min-w-0">
                  <div class="truncate font-semibold text-fg text-sm">
                    Add sticker
                  </div>
                  <div class="truncate text-[11px] text-fg-subtle">
                    PNG, APNG, or GIF · auto-compressed to 512KB
                  </div>
                </div>
              </div>
            </button>
          </div>
          <div
            v-if="
              props.filteredPackEmojis.length === 0 &&
              props.filteredPackStickers.length === 0 &&
              props.emojiSearchQuery.trim()
            "
            class="px-2 py-6 text-center text-sm text-fg-subtle"
          >
            No emojis or stickers match.
          </div>
        </div>
      </div>

      <div class="roles-panel flex min-h-0 min-w-0 flex-col rounded-2xl p-5">
        <div
          v-if="props.selectedEmojiPack"
          class="flex h-full min-h-[55vh] flex-col gap-6"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="text-lg font-bold text-fg-strong">
                {{ props.selectedEmojiPack.name }}
              </div>
              <div class="mt-1 text-sm text-fg-subtle">
                {{ props.selectedEmojiPack.description }}
              </div>
            </div>
            <div
              class="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
            >
              {{
                props.selectedEmojiPack.source === 'custom'
                  ? 'Server Pack'
                  : 'Market'
              }}
            </div>
          </div>

          <div v-if="showPackSettingsPanel" class="space-y-4">
            <div
              class="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
            >
              Marketplace listing
            </div>
            <label class="block text-xs text-fg-subtle"
              >Description (min
              {{ props.emojiPackDescriptionMinLen }} chars)</label
            >
            <textarea
              :value="props.packEditDescription"
              rows="3"
              class="server-input w-full resize-y text-sm"
              @input="
                $emit(
                  'update:packEditDescription',
                  ($event.target as HTMLTextAreaElement).value,
                )
              "
            />
            <EmojiPackTagsField
              v-model="packEditTagsModel"
              flat-chrome
              label="Tags (up to 8)"
              hint="Type each tag and press Enter. Paste comma- or line-separated lists still works."
            />
            <label
              class="flex cursor-pointer items-center gap-2 text-sm text-fg-soft"
            >
              <input
                type="checkbox"
                class="size-4 shrink-0 rounded border-0 bg-glass-2 accent-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                :checked="props.packEditListedInMarket"
                @change="
                  $emit(
                    'update:packEditListedInMarket',
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
              List this pack on the public emoji market
            </label>
            <button
              type="button"
              class="rounded-lg bg-glass-2 px-3 py-2 text-xs font-semibold text-fg transition-colors hover:bg-glass-active"
              @click="props.saveCustomPackMarketDetails()"
            >
              Save pack settings
            </button>
          </div>

          <div v-else-if="showAddEmojiPanel" class="space-y-4">
            <div class="text-sm text-fg-subtle">
              {{ packExpressionCount(props.selectedEmojiPack) }} /
              {{ props.maxEmojisPerPack }} expressions
            </div>
            <button
              type="button"
              class="flex w-full items-center justify-center gap-2 rounded-lg bg-glass-1 py-8 px-4 text-center transition-colors hover:bg-glass-hover"
              :class="isEmojiDropActive ? 'bg-glass-2' : ''"
              @click="openAddEmojiFilePicker"
              @dragenter.prevent="isEmojiDropActive = true"
              @dragover.prevent="isEmojiDropActive = true"
              @dragleave.prevent="isEmojiDropActive = false"
              @drop.prevent="onEmojiDrop"
            >
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-white/25 text-xl font-light text-fg-subtle"
              >
                +
              </span>
              <div class="min-w-0 text-left">
                <div class="text-sm font-semibold text-fg">
                  {{ isEmojiDropActive ? 'Drop image here' : 'Add an emoji' }}
                </div>
                <div class="mt-0.5 text-xs text-fg-subtle">
                  Images are fitted inside square slots · auto-compressed to
                  512KB (quality-first)
                </div>
              </div>
            </button>
          </div>

          <div v-else-if="showAddStickerPanel" class="space-y-4">
            <div class="text-sm text-fg-subtle">
              {{ packExpressionCount(props.selectedEmojiPack) }} /
              {{ props.maxEmojisPerPack }} expressions
            </div>
            <button
              type="button"
              class="flex w-full items-center justify-center gap-2 rounded-lg bg-glass-1 py-8 px-4 text-center transition-colors hover:bg-glass-hover"
              @click="openAddStickerFilePicker"
            >
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-white/25 text-xl font-light text-fg-subtle"
              >
                +
              </span>
              <div class="min-w-0 text-left">
                <div class="text-sm font-semibold text-fg">Add a sticker</div>
                <div class="mt-0.5 text-xs text-fg-subtle">
                  PNG, APNG, or GIF · auto-compressed to 512KB where possible
                </div>
              </div>
            </button>
          </div>

          <template v-else-if="showEmojiDetailPanel">
            <div class="text-sm text-fg-subtle">
              {{ packExpressionCount(props.selectedEmojiPack) }} /
              {{ props.maxEmojisPerPack }} expressions
            </div>

            <div class="space-y-5">
              <div class="flex justify-center">
                <div
                  class="flex aspect-square h-28 w-28 max-w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-glass-1"
                >
                  <img
                    v-if="props.selectedEmoji!.previewUrl"
                    :src="safeImageUrl(props.selectedEmoji!.previewUrl)"
                    alt=""
                    class="max-h-full max-w-full object-contain"
                  />
                  <span v-else class="text-5xl leading-none">{{
                    props.selectedEmoji!.char
                  }}</span>
                </div>
              </div>
              <div class="flex items-center gap-6">
                <div>
                  <div
                    class="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
                  >
                    Name
                  </div>
                  <input
                    :value="props.selectedEmoji!.name"
                    type="text"
                    class="server-input mt-2 w-full min-w-[220px]"
                    :disabled="props.selectedEmojiPack.source !== 'custom'"
                    :readonly="props.selectedEmojiPack.source !== 'custom'"
                    @change="
                      props.updateSelectedEmojiName(
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                  <div
                    v-if="props.selectedEmojiPack.source !== 'custom'"
                    class="mt-1 text-[11px] text-fg-subtle"
                  >
                    Fork this market pack to rename emojis.
                  </div>
                </div>
                <div>
                  <div
                    class="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
                  >
                    Usage
                  </div>
                  <div class="mt-1 font-semibold text-fg-soft">
                    {{ props.selectedEmoji!.used }} uses
                  </div>
                </div>
              </div>
            </div>

            <button
              v-if="props.selectedEmojiPack.source === 'custom'"
              type="button"
              class="echo-destructive-fill mt-auto w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
              @click="props.removeEmoji(props.selectedEmoji!.id)"
            >
              Delete Emoji
            </button>
          </template>

          <template v-else-if="showStickerDetailPanel">
            <div class="text-sm text-fg-subtle">
              {{ packExpressionCount(props.selectedEmojiPack) }} /
              {{ props.maxEmojisPerPack }} expressions
            </div>

            <div class="space-y-5">
              <div class="flex justify-center">
                <div
                  class="flex aspect-square h-28 w-28 max-w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-glass-1"
                >
                  <img
                    v-if="props.selectedSticker!.previewUrl"
                    :src="safeImageUrl(props.selectedSticker!.previewUrl)"
                    alt=""
                    class="max-h-full max-w-full object-contain"
                  />
                </div>
              </div>
              <div class="flex items-center gap-6">
                <div>
                  <div
                    class="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
                  >
                    Name
                  </div>
                  <div class="mt-2 font-semibold text-fg-soft">
                    :{{ props.selectedSticker!.name }}:
                  </div>
                </div>
                <div>
                  <div
                    class="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
                  >
                    Format
                  </div>
                  <div class="mt-1 font-semibold uppercase text-fg-soft">
                    {{ props.selectedSticker!.format }}
                  </div>
                </div>
                <div>
                  <div
                    class="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
                  >
                    Usage
                  </div>
                  <div class="mt-1 font-semibold text-fg-soft">
                    {{ props.selectedSticker!.used }} uses
                  </div>
                </div>
              </div>
            </div>

            <button
              v-if="props.selectedEmojiPack.source === 'custom'"
              type="button"
              class="echo-destructive-fill mt-auto w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
              @click="props.removeSticker(props.selectedSticker!.id)"
            >
              Delete Sticker
            </button>
          </template>

          <div v-else class="py-8 text-center text-sm text-fg-subtle">
            <span v-if="props.selectedEmojiPack.source === 'custom'"
              >Choose an emoji, sticker, pack settings, or add from the
              list.</span
            >
            <span v-else>Select an emoji from the list.</span>
          </div>

          <div
            v-if="props.emojiUploadFeedback"
            class="rounded-lg border-0 px-3 py-2 text-xs font-medium shadow-none ring-0"
            :class="
              props.emojiUploadFeedback.tone === 'success'
                ? 'echo-success-banner'
                : props.emojiUploadFeedback.tone === 'info'
                  ? 'bg-glass-2 text-fg-soft'
                  : 'echo-error-banner'
            "
          >
            {{ props.emojiUploadFeedback.message }}
          </div>
        </div>

        <div
          v-else
          class="flex h-full items-center justify-center py-16 text-sm text-fg-subtle"
        >
          No pack selected.
        </div>
      </div>
    </div>

    <div
      v-if="props.emojiPackModalOpen"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-dim px-4"
      @click.self="props.closeEmojiPackModal"
    >
      <div
        class="emoji-pack-modal--flat server-settings-modal relative flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl text-fg"
        @click.stop
      >
        <div class="flex shrink-0 items-center justify-between gap-3 px-5 pt-5">
          <div class="text-base font-semibold text-fg">Add Emoji Pack</div>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-lg leading-none text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
            aria-label="Close"
            @click="props.closeEmojiPackModal"
          >
            ×
          </button>
        </div>
        <div class="mt-5 shrink-0 px-5">
          <div
            class="emoji-pack-modal__tab-strip"
            role="tablist"
            aria-label="Pack source"
          >
            <button
              type="button"
              role="tab"
              class="emoji-pack-modal__tab"
              :class="{
                'emoji-pack-modal__tab--active':
                  props.emojiPackModalTab === 'market',
              }"
              :aria-selected="props.emojiPackModalTab === 'market'"
              @click="$emit('update:emojiPackModalTab', 'market')"
            >
              Market
            </button>
            <button
              type="button"
              role="tab"
              class="emoji-pack-modal__tab"
              :class="{
                'emoji-pack-modal__tab--active':
                  props.emojiPackModalTab === 'create',
              }"
              :aria-selected="props.emojiPackModalTab === 'create'"
              @click="$emit('update:emojiPackModalTab', 'create')"
            >
              Create Pack
            </button>
          </div>
        </div>

        <div
          class="custom-scrollbar mt-6 min-h-0 flex-1 overflow-y-auto px-5 pb-5"
        >
          <div
            v-if="props.emojiUploadFeedback"
            role="alert"
            class="mb-4 rounded-lg border-0 px-3 py-2 text-xs font-medium shadow-none ring-0"
            :class="
              props.emojiUploadFeedback.tone === 'success'
                ? 'echo-success-banner'
                : props.emojiUploadFeedback.tone === 'info'
                  ? 'bg-glass-2 text-fg-soft'
                  : 'echo-error-banner'
            "
          >
            {{ props.emojiUploadFeedback.message }}
          </div>

          <div v-if="props.emojiPackModalTab === 'market'" class="space-y-3">
            <input
              :value="props.emojiPackMarketSearch"
              type="text"
              class="server-input w-full"
              placeholder="Search market packs..."
              :disabled="
                !props.canImportMorePacks || props.marketEmojiPacksLoading
              "
              @input="
                $emit(
                  'update:emojiPackMarketSearch',
                  ($event.target as HTMLInputElement).value,
                )
              "
            />
            <div
              v-if="props.marketEmojiPacksLoading"
              class="flex min-h-[200px] flex-col items-center justify-center gap-3 py-8 text-sm text-fg-subtle"
            >
              <div
                class="h-9 w-9 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent/55"
                aria-hidden="true"
              />
              <span>Loading market…</span>
            </div>
            <div
              v-else-if="props.marketEmojiPacksError"
              class="echo-error-banner rounded-xl px-4 py-4 text-sm"
            >
              <div>{{ props.marketEmojiPacksError }}</div>
              <button
                type="button"
                class="mt-3 rounded-lg bg-glass-2 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-glass-hover"
                @click="props.refreshMarketEmojiPacks()"
              >
                Retry
              </button>
            </div>
            <div
              v-else
              class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
            >
              <div
                class="emoji-pack-modal__surface max-h-[320px] space-y-1 overflow-y-auto p-2 custom-scrollbar"
              >
                <button
                  v-for="pack in props.filteredMarketEmojiPacks"
                  :key="pack.id"
                  type="button"
                  class="w-full rounded-lg px-2 py-2 text-left transition-colors"
                  :class="
                    selectedMarketPreviewPackId === pack.id
                      ? 'bg-glass-2'
                      : 'hover:bg-glass-hover'
                  "
                  @click="selectedMarketPreviewPackId = pack.id"
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-glass-1"
                    >
                      <img
                        v-if="pack.emojis?.[0]?.previewUrl"
                        :src="safeImageUrl(pack.emojis[0].previewUrl)"
                        alt=""
                        class="h-full w-full object-contain"
                      />
                      <span v-else class="text-xl leading-none">{{
                        pack.emojis?.[0]?.char || '📦'
                      }}</span>
                    </div>
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-fg-soft">
                        {{ pack.name }}
                      </div>
                      <div class="text-[11px] text-fg-subtle">
                        {{
                          pack.authorServerName
                            ? `${pack.authorServerName} · `
                            : ''
                        }}
                        {{ pack.totalUseCount ?? 0 }} uses ·
                        {{ pack.emojiCount ?? pack.emojis?.length ?? 0 }} emojis
                      </div>
                    </div>
                  </div>
                </button>
                <div
                  v-if="!props.filteredMarketEmojiPacks.length"
                  class="py-4 text-center text-sm text-fg-subtle"
                >
                  {{
                    props.canImportMorePacks
                      ? 'No packs match.'
                      : 'Pack limit reached.'
                  }}
                </div>
              </div>

              <div
                v-if="selectedMarketPreviewPack"
                class="emoji-pack-modal__surface p-4"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-glass-1"
                  >
                    <img
                      v-if="selectedMarketPreviewPack.emojis?.[0]?.previewUrl"
                      :src="
                        safeImageUrl(
                          selectedMarketPreviewPack.emojis[0].previewUrl,
                        )
                      "
                      alt=""
                      class="h-full w-full object-contain"
                    />
                    <span v-else class="text-2xl leading-none">{{
                      selectedMarketPreviewPack.emojis?.[0]?.char || '📦'
                    }}</span>
                  </div>
                  <div class="min-w-0">
                    <div
                      class="truncate text-base font-semibold text-fg-strong"
                    >
                      {{ selectedMarketPreviewPack.name }}
                    </div>
                    <div class="mt-0.5 text-[11px] text-fg-subtle">
                      {{
                        selectedMarketPreviewPack.authorServerName ??
                        'Community pack'
                      }}
                      · {{ selectedMarketPreviewPack.totalUseCount ?? 0 }} uses
                    </div>
                    <div class="mt-1 text-sm text-fg-subtle">
                      {{ selectedMarketPreviewPack.description }}
                    </div>
                    <div
                      v-if="
                        (selectedMarketPreviewPack.marketSettings?.tags
                          ?.length ?? 0) > 0
                      "
                      class="mt-2 flex flex-wrap gap-1"
                    >
                      <span
                        v-for="tag in selectedMarketPreviewPack.marketSettings!
                          .tags"
                        :key="tag"
                        class="rounded bg-glass-2 px-2 py-0.5 text-[10px] font-medium text-fg-soft"
                      >
                        {{ tag }}
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  class="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
                >
                  Included Emojis
                </div>
                <div
                  class="emoji-pack-preview-grid mt-2 grid max-h-44 grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5 overflow-y-auto pr-1 custom-scrollbar"
                >
                  <div
                    v-for="emoji in selectedMarketPreviewPack.emojis"
                    :key="emoji.id"
                    class="emoji-pack-preview-cell flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-lg bg-glass-1 p-1.5 transition-colors hover:bg-glass-2"
                    :title="`:${emoji.name}:`"
                  >
                    <img
                      v-if="emoji.previewUrl"
                      :src="safeImageUrl(emoji.previewUrl)"
                      alt=""
                      class="max-h-full max-w-full object-contain"
                    />
                    <span v-else class="text-lg leading-none">{{
                      emoji.char || '😀'
                    }}</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="mt-4 w-full rounded-lg bg-glass-2 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-glass-hover disabled:cursor-not-allowed disabled:opacity-45"
                  :disabled="!props.canImportMorePacks"
                  @click="
                    props.importMarketEmojiPack(selectedMarketPreviewPack.id)
                  "
                >
                  Import Pack
                </button>
              </div>
              <div
                v-else
                class="emoji-pack-modal__surface flex min-h-[200px] items-center justify-center p-4 text-center text-sm text-fg-subtle"
              >
                Select a pack to preview.
              </div>
            </div>
          </div>

          <div v-else class="space-y-4 pt-2">
            <div>
              <label
                class="settings-label mb-2 block"
                for="emoji-pack-create-name"
                >Pack name</label
              >
              <input
                id="emoji-pack-create-name"
                :value="props.customEmojiPackName"
                type="text"
                class="server-input w-full"
                placeholder="New server pack name..."
                @input="
                  $emit(
                    'update:customEmojiPackName',
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </div>
            <label class="block text-xs text-fg-subtle"
              >Description (required, min
              {{ props.emojiPackDescriptionMinLen }} characters)</label
            >
            <textarea
              :value="props.customEmojiPackDescription"
              rows="3"
              class="server-input w-full resize-y"
              placeholder="What is this pack for? Who is it for?"
              @input="
                $emit(
                  'update:customEmojiPackDescription',
                  ($event.target as HTMLTextAreaElement).value,
                )
              "
            />
            <EmojiPackTagsField
              v-model="customEmojiPackTagsModel"
              flat-chrome
              label="Tags (optional, up to 8)"
              hint="Type each tag and press Enter. Comma or newline in pasted text splits into tags."
            />
            <label
              class="flex cursor-pointer items-center gap-2 text-sm text-fg-soft"
            >
              <input
                type="checkbox"
                class="size-4 shrink-0 rounded border-0 bg-glass-2 accent-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                :checked="props.customEmojiPackListedInMarket"
                @change="
                  $emit(
                    'update:customEmojiPackListedInMarket',
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
              List on public market (requires description; appears after you add
              emojis)
            </label>
            <button
              type="button"
              class="rounded-lg bg-glass-2 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-glass-hover disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="!props.canImportMorePacks"
              :title="
                !props.canImportMorePacks
                  ? `Maximum of ${props.maxEmojiPacks} packs per server`
                  : undefined
              "
              @click="props.createCustomEmojiPack"
            >
              Create Pack
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
