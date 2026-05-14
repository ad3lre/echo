<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getTwemojiSrc } from '@/utils/twemoji';

const props = defineProps<{
  emoji: string;
}>();

const imgFailed = ref(false);

watch(
  () => props.emoji,
  () => {
    imgFailed.value = false;
  },
);

const src = computed(() => getTwemojiSrc(props.emoji));
</script>

<template>
  <span class="poll-opt-emoji shrink-0 inline-flex items-center justify-center">
    <img
      v-if="src && !imgFailed"
      class="poll-opt-emoji__img emoji"
      draggable="false"
      :alt="emoji"
      :src="src"
      loading="lazy"
      @error="imgFailed = true"
    />
    <span
      v-else
      class="poll-opt-emoji__native text-[1.1em] leading-none select-none"
      >{{ emoji }}</span
    >
  </span>
</template>

<style scoped>
.poll-opt-emoji__img {
  width: 1.1em;
  height: 1.1em;
  vertical-align: -0.15em;
  object-fit: contain;
}
</style>
