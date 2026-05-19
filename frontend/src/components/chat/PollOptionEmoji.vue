<script setup lang="ts">
import { computed, inject, ref, watch, type ComputedRef } from 'vue';
import { getTwemojiSrc } from '@/utils/twemoji';
import { safeCustomEmojiUrl } from '@/utils/customEmojiUrl';
import { parsePollOptionCustomEmojiToken } from '@/utils/pollOptionEmojiDisplay';

const props = defineProps<{
  emoji: string;
}>();

const imgFailed = ref(false);

const customEmojiUrlById = inject<ComputedRef<Map<string, string>> | undefined>(
  'customEmojiUrlById',
  undefined,
);

watch(
  () => props.emoji,
  () => {
    imgFailed.value = false;
  },
);

const customToken = computed(() =>
  parsePollOptionCustomEmojiToken(props.emoji),
);

const customSrc = computed(() => {
  const token = customToken.value;
  if (!token) return '';
  const fromMap = customEmojiUrlById?.value?.get(token.id)?.trim();
  const raw = fromMap ?? '';
  return raw ? (safeCustomEmojiUrl(raw) ?? '') : '';
});

const twemojiSrc = computed(() =>
  customToken.value ? '' : getTwemojiSrc(props.emoji),
);

const displaySrc = computed(() => customSrc.value || twemojiSrc.value);
</script>

<template>
  <span class="poll-opt-emoji shrink-0 inline-flex items-center justify-center">
    <img
      v-if="displaySrc && !imgFailed"
      class="poll-opt-emoji__img emoji"
      :class="{ 'custom-emoji': !!customToken }"
      draggable="false"
      :alt="emoji"
      :src="displaySrc"
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
