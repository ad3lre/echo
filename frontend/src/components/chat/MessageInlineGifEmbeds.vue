<script setup lang="ts">
import { computed } from 'vue';
import type { Embed } from '@shared/types';
import {
  gifDisplayUrlFromEmbed,
  isInlineGifHostEmbed,
} from '@shared/gifHostLinks';
import { safeImageUrl } from '@/utils/safeImageUrl';
import GifImage from './GifImage.vue';

const props = defineProps<{
  embeds: Embed[];
  openImageViewer?: (url: string) => void;
  alt?: string;
}>();

const items = computed(() => {
  const out: {
    url: string;
    key: string;
    width?: number;
    height?: number;
  }[] = [];
  const seen = new Set<string>();
  for (const embed of props.embeds ?? []) {
    if (!isInlineGifHostEmbed(embed)) continue;
    const url = gifDisplayUrlFromEmbed(embed);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      key: embed.url?.trim() || url,
      width: embed.image?.width ?? embed.thumbnail?.width,
      height: embed.image?.height ?? embed.thumbnail?.height,
    });
  }
  return out;
});

function mediaAspectStyle(item: { width?: number; height?: number }) {
  const { width, height } = item;
  if (
    typeof width === 'number' &&
    width > 0 &&
    typeof height === 'number' &&
    height > 0
  ) {
    return { aspectRatio: `${width} / ${height}` };
  }
  return undefined;
}
</script>

<template>
  <div
    v-if="items.length"
    class="message-inline-gif-embeds mt-1 max-w-full min-w-0 space-y-2"
  >
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="block text-left cursor-zoom-in rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      :style="mediaAspectStyle(item)"
      @click="openImageViewer?.(item.url)"
    >
      <GifImage :src="safeImageUrl(item.url)" :alt="alt || 'GIF'" />
    </button>
  </div>
</template>
