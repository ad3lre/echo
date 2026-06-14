<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { renderDiscordEmbedMarkdownHtml } from '@/utils/discordEmbedMarkdown';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    text?: string;
    as?: string;
  }>(),
  { as: 'span' },
);

const attrs = useAttrs();
const html = computed(() => renderDiscordEmbedMarkdownHtml(props.text));
</script>

<template>
  <component :is="as" v-if="html" class="discord-embed-md" v-bind="attrs">
    <span v-html="html" />
  </component>
</template>
