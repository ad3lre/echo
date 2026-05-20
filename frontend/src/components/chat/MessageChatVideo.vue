<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  observeChatMediaRetentionVisible,
  queueChatMediaRetentionTouch,
} from '@/composables/useChatMediaRetentionTouch';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';
import MediaUnavailablePanel from './MediaUnavailablePanel.vue';

const props = defineProps<{
  url: string;
  storageKey?: string;
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

const rootRef = ref<HTMLElement | null>(null);
let stopObserve: (() => void) | undefined;

onMounted(() => {
  stopObserve = observeChatMediaRetentionVisible(rootRef.value, props.storageKey);
});

onUnmounted(() => {
  stopObserve?.();
});
</script>

<template>
  <MediaUnavailablePanel
    v-if="showUnavailable"
    headline="Video unavailable"
    :href="isTrustedMediaUrl(url) ? playUrl : undefined"
  />
  <video
    v-else
    ref="rootRef"
    :src="playUrl"
    controls
    playsinline
    preload="metadata"
    class="message-video"
    @play="queueChatMediaRetentionTouch(storageKey)"
    @error="loadFailed = true"
  />
</template>
