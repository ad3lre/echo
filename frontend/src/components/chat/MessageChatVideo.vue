<script setup lang="ts">
import EchoVideoPlayer from '@/components/media/EchoVideoPlayer.vue';

defineProps<{
  url: string;
  storageKey?: string;
  filename?: string;
  spoiler?: boolean;
}>();
</script>

<template>
  <EchoVideoPlayer
    :url="url"
    :storage-key="storageKey"
    :filename="filename"
    :spoiler="spoiler"
  />
</template>
