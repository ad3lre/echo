<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';
import MediaUnavailablePanel from './MediaUnavailablePanel.vue';

const props = defineProps<{
  url: string;
}>();

const loadFailed = ref(false);
const playUrl = computed(() => safeImageUrl(props.url));

watch(
  () => props.url,
  () => {
    loadFailed.value = false;
  },
);

const showUnavailable = computed(
  () => !isTrustedMediaUrl(props.url) || loadFailed.value,
);
</script>

<template>
  <MediaUnavailablePanel
    v-if="showUnavailable"
    headline="Video unavailable"
    :href="isTrustedMediaUrl(url) ? playUrl : undefined"
  />
  <video
    v-else
    :src="playUrl"
    controls
    playsinline
    preload="metadata"
    class="message-video"
    @error="loadFailed = true"
  />
</template>
