<script setup lang="ts">
import { computed, toRef } from 'vue';
import {
  useServerStickerLibrary,
  type EchoStickerLibraryStickerApi,
} from '@/composables/useServerStickerLibrary';
import GifImage from '@/components/chat/GifImage.vue';
import MessageStickerBitmap from '@/components/chat/MessageStickerBitmap.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { isLikelyGifImageUrl } from '@/utils/isGifImageUrl';

const props = defineProps<{
  serverId?: string;
  theme?: 'default' | 'forum';
}>();

const emit = defineEmits<{
  send: [sticker: EchoStickerLibraryStickerApi];
}>();

const { packs, loading, error, flatStickers } = useServerStickerLibrary(
  toRef(() => props.serverId),
);

const hasStickers = computed(() => flatStickers.value.length > 0);

function isRenderable(sticker: EchoStickerLibraryStickerApi): boolean {
  return sticker.format !== 'lottie';
}

function displayUrl(sticker: EchoStickerLibraryStickerApi): string {
  return safeImageUrl(sticker.imageUrl);
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      v-if="loading && !hasStickers"
      class="flex flex-1 items-center justify-center py-10 text-sm"
      :class="props.theme === 'forum' ? 'text-fg-subtle' : 'text-muted'"
      role="status"
      aria-live="polite"
    >
      Loading stickers…
    </div>
    <div
      v-else-if="error"
      class="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-red-400"
    >
      {{ error }}
    </div>
    <div
      v-else-if="!hasStickers"
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-4 py-8 text-center"
    >
      <p
        class="text-sm"
        :class="props.theme === 'forum' ? 'text-fg-soft' : 'text-muted'"
      >
        No stickers in this server yet.
      </p>
      <p
        class="text-[11px] leading-snug"
        :class="props.theme === 'forum' ? 'text-fg-subtle' : 'text-muted/80'"
      >
        Server admins can add sticker packs in settings.
      </p>
    </div>
    <div
      v-else
      class="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar py-1 pl-1.5 pr-2 pb-2.5"
      v-scrollbar-on-scroll
    >
      <section v-for="pack in packs" :key="pack.id" class="mb-3">
        <h3
          class="sticky top-0 z-[1] mb-1.5 px-0.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide backdrop-blur-md"
          :class="props.theme === 'forum' ? 'text-fg-subtle' : 'text-muted'"
        >
          {{ pack.name }}
        </h3>
        <div class="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
          <button
            v-for="sticker in pack.stickers"
            :key="sticker.id"
            type="button"
            role="menuitem"
            class="flex aspect-square items-center justify-center rounded-lg bg-scrim-1 p-1 transition-colors hover:bg-glass-hover focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            :title="`:${sticker.name}:`"
            @click="emit('send', sticker)"
          >
            <template v-if="isRenderable(sticker)">
              <GifImage
                v-if="
                  sticker.format === 'gif' ||
                  isLikelyGifImageUrl(sticker.imageUrl)
                "
                :src="displayUrl(sticker)"
                :alt="sticker.name"
                wrapper-class="max-h-full max-w-full"
                img-class="max-h-[72px] max-w-[72px] object-contain"
              />
              <MessageStickerBitmap
                v-else
                :url="displayUrl(sticker)"
                :alt="sticker.name"
              />
            </template>
            <span
              v-else
              class="text-[10px] font-medium text-muted"
              :title="sticker.name"
              >LOTTIE</span
            >
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
