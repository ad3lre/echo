<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';
import MediaUnavailablePanel from './MediaUnavailablePanel.vue';

const props = defineProps<{
  url: string;
  alt: string;
}>();

const loadFailed = ref(false);

watch(
  () => props.url,
  () => {
    loadFailed.value = false;
  },
);

const resolved = computed(() => safeImageUrl(props.url));
const unavailable = computed(
  () => !isTrustedMediaUrl(props.url) || loadFailed.value,
);
</script>

<template>
  <MediaUnavailablePanel
    v-if="unavailable"
    headline="Sticker unavailable"
    :compact="true"
    :href="isTrustedMediaUrl(url) ? resolved : undefined"
  />
  <img
    v-else
    :src="resolved"
    :alt="alt"
    loading="lazy"
    class="message-sticker"
    @error="loadFailed = true"
  />
</template>
