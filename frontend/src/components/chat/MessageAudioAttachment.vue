<script setup lang="ts">
import EchoAudioPlayer from '@/components/media/EchoAudioPlayer.vue';

defineProps<{
  url: string;
  storageKey?: string;
  filename?: string;
  spoiler?: boolean;
}>();
</script>

<template>
  <div class="message-audio-shell">
    <EchoAudioPlayer
      :url="url"
      :storage-key="storageKey"
      :filename="filename"
      :spoiler="spoiler"
    />
  </div>
</template>

<style scoped lang="scss">
.message-audio-shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
</style>
