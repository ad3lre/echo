<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { StickerUploadFeedback } from '@/features/server-settings/composables/useServerSettingsStickers';

const props = defineProps<{
  serverId: string | undefined;
  canManageEmojis: boolean;
  packs: Array<{
    id: string;
    name: string;
    stickers: Array<{
      id: string;
      name: string;
      imageUrl: string;
    }>;
  }>;
  loading: boolean;
  error: string | null;
  totalStickers: number;
  customPacks: Array<{ id: string; name: string; source: string }>;
  customPacksLoading: boolean;
  selectedPackId: string;
  stickerUploadFeedback: StickerUploadFeedback | null;
  canCreateMorePacks: boolean;
  canUploadToSelectedPack: boolean;
  refresh: () => void;
  createStickerPack: () => void | Promise<void>;
  onStickerUploadFileChange: (event: Event) => void;
  removeSticker: (packId: string, stickerId: string) => void | Promise<void>;
}>();

const emit = defineEmits<{
  'update:selectedPackId': [value: string];
}>();

const stickerFileInputRef = ref<HTMLInputElement | null>(null);

const selectedPackIdModel = computed({
  get: () => props.selectedPackId,
  set: (v: string) => emit('update:selectedPackId', v),
});

function openStickerFilePicker() {
  if (!props.canManageEmojis || !props.canUploadToSelectedPack) return;
  void nextTick(() => stickerFileInputRef.value?.click());
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col gap-4">
    <div>
      <h3 class="text-lg font-semibold text-fg">Stickers</h3>
      <p class="mt-1 text-sm text-fg-subtle">
        Server stickers appear in the composer sticker picker. Upload PNG, APNG,
        or GIF into a custom pack, or import from Discord metadata refresh.
      </p>
    </div>

    <div
      v-if="canManageEmojis"
      class="rounded-xl border border-border/40 bg-glass-1 px-4 py-3 space-y-3"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold text-fg-soft">Upload pack</span>
        <button
          v-for="pack in customPacks"
          :key="pack.id"
          type="button"
          class="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="
            pack.id === selectedPackIdModel
              ? 'bg-glass-3 text-fg-strong'
              : 'text-fg-subtle hover:text-fg-soft hover:bg-glass-hover'
          "
          @click="selectedPackIdModel = pack.id"
        >
          {{ pack.name }}
        </button>
        <button
          type="button"
          class="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="
            canCreateMorePacks
              ? 'text-fg-soft hover:text-fg hover:bg-glass-hover'
              : 'cursor-not-allowed text-fg-subtle'
          "
          :disabled="!canCreateMorePacks"
          @click="createStickerPack()"
        >
          + New pack
        </button>
      </div>

      <p v-if="customPacksLoading" class="text-xs text-fg-subtle">
        Loading custom packs…
      </p>
      <p v-else-if="!customPacks.length" class="text-xs text-fg-subtle">
        Create a pack to upload stickers.
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <input
          ref="stickerFileInputRef"
          type="file"
          accept="image/png,image/gif,image/apng,.png,.gif,.apng"
          class="hidden"
          :disabled="!canUploadToSelectedPack"
          @change="onStickerUploadFileChange"
        />
        <button
          type="button"
          class="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-50"
          :disabled="!canUploadToSelectedPack"
          @click="openStickerFilePicker()"
        >
          Upload sticker
        </button>
      </div>

      <p
        v-if="stickerUploadFeedback"
        class="text-xs"
        :class="
          stickerUploadFeedback.tone === 'success'
            ? 'text-green-300'
            : stickerUploadFeedback.tone === 'info'
              ? 'text-fg-subtle'
              : 'text-red-300'
        "
      >
        {{ stickerUploadFeedback.message }}
      </p>
    </div>

    <div
      class="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-glass-1 px-4 py-3"
    >
      <div class="text-sm text-fg-soft">
        <span class="font-semibold text-fg">{{ totalStickers }}</span>
        sticker{{ totalStickers === 1 ? '' : 's' }} across
        {{ packs.length }} pack{{ packs.length === 1 ? '' : 's' }}
      </div>
      <button
        type="button"
        class="rounded-lg bg-glass-2 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-glass-hover"
        @click="refresh()"
      >
        Refresh
      </button>
    </div>

    <p v-if="loading" class="text-sm text-fg-subtle">
      Loading sticker library…
    </p>
    <p v-else-if="error" class="text-sm text-red-300">{{ error }}</p>

    <div
      v-else
      class="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto"
    >
      <div
        v-for="pack in packs"
        :key="pack.id"
        class="rounded-xl border border-border/35 bg-glass-1 p-4"
      >
        <h4 class="text-sm font-semibold text-fg">{{ pack.name }}</h4>
        <p
          v-if="pack.stickers.length === 0"
          class="mt-2 text-sm text-fg-subtle"
        >
          No stickers in this pack yet.
        </p>
        <ul
          v-else
          class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3"
        >
          <li
            v-for="sticker in pack.stickers"
            :key="sticker.id"
            class="relative flex flex-col items-center gap-1 rounded-lg bg-glass-2 p-2"
          >
            <img
              :src="sticker.imageUrl"
              :alt="sticker.name"
              class="h-14 w-14 object-contain"
              loading="lazy"
            />
            <span class="max-w-full truncate text-[11px] text-fg-soft"
              >:{{ sticker.name }}:</span
            >
            <button
              v-if="canManageEmojis"
              type="button"
              class="absolute right-1 top-1 rounded bg-scrim-2 px-1.5 py-0.5 text-[10px] font-semibold text-fg hover:bg-red-500/80 hover:text-white"
              title="Remove sticker"
              @click="removeSticker(pack.id, sticker.id)"
            >
              ×
            </button>
          </li>
        </ul>
      </div>
      <p
        v-if="!packs.length"
        class="rounded-xl border border-dashed border-border/40 px-4 py-8 text-center text-sm text-fg-subtle"
      >
        No sticker packs yet. Import Discord metadata or create a pack and
        upload stickers.
      </p>
    </div>

    <p v-if="!canManageEmojis" class="text-xs text-fg-subtle">
      Manage Server permission is required to upload or import stickers.
    </p>
  </section>
</template>
