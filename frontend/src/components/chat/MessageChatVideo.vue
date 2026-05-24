<script setup lang="ts">
import type { StyleValue } from 'vue';
import EchoVideoPlayer from '@/components/media/EchoVideoPlayer.vue';

defineProps<{
  url: string;
  storageKey?: string;
  filename?: string;
  spoiler?: boolean;
  mediaStyle?: StyleValue;
}>();
</script>

<template>
  <EchoVideoPlayer
    :url="url"
    :storage-key="storageKey"
    :filename="filename"
    :spoiler="spoiler"
    :media-style="mediaStyle"
  />
</template>
