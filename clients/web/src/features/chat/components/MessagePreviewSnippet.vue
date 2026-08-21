<script setup lang="ts">
import { computed, inject, type ComputedRef } from 'vue';
import type { MentionEntity } from '@shared/types';
import {
  parseMessageContent,
  type IdTokenResolvers,
} from '@/features/chat/markdown/useMarkdown';
import {
  plainTextForMessageFields,
  type MessagePlainFields,
} from '@/features/chat/domain/messageDisplayPlain';
import {
  messagePreviewPlainText,
  truncatePreviewText,
} from '@/features/chat/domain/messagePreviewPlain';
import { plainTextWithDisplayShortcodes } from '@/features/chat/emoji/customEmojiDisplay';

const props = withDefaults(
  defineProps<
    MessagePlainFields & {
      mentions?: MentionEntity[];
      maxLen?: number;
    }
  >(),
  { maxLen: 220 },
);

const idTokenResolvers = inject<
  ComputedRef<IdTokenResolvers | undefined> | undefined
>('idTokenResolvers', undefined);

const plainPreview = computed(() =>
  messagePreviewPlainText(props, props.maxLen),
);

const htmlPreview = computed(() => {
  const resolvers = idTokenResolvers?.value;
  if (!resolvers?.customEmojiImageUrl && !resolvers?.customEmojiByName?.size) {
    return '';
  }
  const body = plainTextWithDisplayShortcodes(plainTextForMessageFields(props));
  const truncated = truncatePreviewText(body, props.maxLen);
  return parseMessageContent(truncated, props.mentions, resolvers);
});

const useHtml = computed(() => htmlPreview.value.length > 0);
</script>

<template>
  <span v-if="useHtml" class="message-preview-snippet" v-html="htmlPreview" />
  <span v-else class="message-preview-snippet">{{ plainPreview }}</span>
</template>
