<script setup lang="ts">
import type { Embed, MentionEntity } from '@shared/types';
import type { IdTokenResolvers } from '@/composables/useMarkdown';
import type { MagicTimeRenderContext } from '@/features/chat/viewModel/messageContentSegments';
import MessageContentSegments from '@/components/chat/MessageContentSegments.vue';

export type BubbleBodyMode =
  | { kind: 'markdown' }
  | { kind: 'json'; doc: Record<string, unknown> }
  | { kind: 'error'; message: string };

defineProps<{
  bodyMode: BubbleBodyMode;
  displayMessageContent: string;
  mentions?: MentionEntity[];
  parseIdResolvers?: IdTokenResolvers;
  embeds?: Embed[];
  onJumpToMessage?: (channelId: string, messageId: string) => void;
  customEmojiRenderKey: number;
  messageId?: string;
  magicTime?: MagicTimeRenderContext | null;
}>();
</script>

<template>
  <div
    v-if="bodyMode.kind === 'error'"
    class="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-muted)]"
    role="alert"
  >
    {{ bodyMode.message }}
  </div>
  <MessageContentSegments
    v-else
    :key="`${messageId ?? 'm'}-${customEmojiRenderKey}`"
    :content="displayMessageContent"
    :mentions="mentions"
    :parse-id-resolvers="parseIdResolvers"
    :embeds="embeds"
    :on-jump-to-message="onJumpToMessage"
    :magic-time="magicTime"
  />
</template>
