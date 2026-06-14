<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useResolvedImageDimensions } from '@/composables/useResolvedImageDimensions';
import { mediaAspectStyleFromDims } from '@/utils/chatMediaAspect';
import { isLikelyGifImageUrl } from '@/utils/isGifImageUrl';
import GifImage from './GifImage.vue';
import MessageChatStillImage from './MessageChatStillImage.vue';

const props = defineProps<{
  url: string;
  storageKey?: string;
  alt: string;
  gif?: boolean;
  openable?: boolean;
}>();

const emit = defineEmits<{
  open: [];
}>();

const urlRef = toRef(props, 'url');
const { width, height } = useResolvedImageDimensions(urlRef);

const imageStyle = computed(() =>
  mediaAspectStyleFromDims({
    width: width.value,
    height: height.value,
  }),
);

const isGif = computed(
  () => props.gif === true || isLikelyGifImageUrl(props.url),
);
</script>

<template>
  <button
    v-if="openable && isGif"
    type="button"
    class="block text-left cursor-zoom-in rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
    @click="emit('open')"
  >
    <GifImage
      :src="url"
      :storage-key="storageKey"
      :alt="alt"
      reserve-layout
      :image-style="imageStyle"
      :metadata-width="width"
      :metadata-height="height"
    />
  </button>
  <MessageChatStillImage
    v-else-if="openable"
    :url="url"
    :storage-key="storageKey"
    :alt="alt"
    :image-style="imageStyle"
    :metadata-width="width"
    :metadata-height="height"
    openable
    @open="emit('open')"
  />
  <GifImage
    v-else-if="isGif"
    :src="url"
    :storage-key="storageKey"
    :alt="alt"
    reserve-layout
    :image-style="imageStyle"
    :metadata-width="width"
    :metadata-height="height"
  />
  <MessageChatStillImage
    v-else
    :url="url"
    :storage-key="storageKey"
    :alt="alt"
    :image-style="imageStyle"
    :metadata-width="width"
    :metadata-height="height"
  />
</template>
