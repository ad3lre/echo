<script setup lang="ts">
import { computed } from 'vue';
import type { Embed, MentionEntity } from '@shared/types';
import type { IdTokenResolvers } from '@/composables/useMarkdown';
import {
  buildRenderedEchoMessageSegments,
  echoMessageSegmentRowKey,
  type EchoRenderedMessageRow,
  type MagicTimeRenderContext,
} from '@/features/chat/viewModel/messageContentSegments';
import ChatInviteEmbed from './ChatInviteEmbed.vue';
import MessageJumpEmbed from './MessageJumpEmbed.vue';

const props = defineProps<{
  content: string;
  mentions?: MentionEntity[];
  parseIdResolvers?: IdTokenResolvers;
  embeds?: Embed[];
  onJumpToMessage?: (channelId: string, messageId: string) => void;
  magicTime?: MagicTimeRenderContext | null;
}>();

const renderedRows = computed(() =>
  buildRenderedEchoMessageSegments(
    props.content,
    props.embeds,
    props.mentions,
    props.parseIdResolvers,
    props.magicTime,
  ),
);

function embedMarginClass(i: number): string {
  if (i === 0) return '';
  return 'mt-2';
}

function rowKey(row: EchoRenderedMessageRow, i: number): string {
  return echoMessageSegmentRowKey(row, i);
}
</script>

<template>
  <template v-for="(row, i) in renderedRows" :key="rowKey(row, i)">
    <!-- Use a div (not span): block-level markdown (e.g. || multi-line || → div.spoiler) is invalid inside span and browsers break the tree, which breaks spoiler click targeting. -->
    <div
      v-if="row.type === 'text' && row.text"
      class="message-content-segment min-w-0"
      v-html="row.html"
    />
    <ChatInviteEmbed
      v-else-if="row.type === 'invite'"
      :href="row.url"
      :class="embedMarginClass(i)"
    />
    <MessageJumpEmbed
      v-else-if="row.type === 'jump'"
      :embed="row.embed"
      :on-jump="onJumpToMessage"
      :class="embedMarginClass(i)"
    />
  </template>
</template>
