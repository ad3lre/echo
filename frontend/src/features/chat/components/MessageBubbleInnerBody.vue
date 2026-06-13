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
  contentJson?: unknown;
  onJumpToMessage?: (channelId: string, messageId: string) => void;
  customEmojiRenderKey: number;
  messageId?: string;
  magicTime?: MagicTimeRenderContext | null;
  canFillImageSlots?: boolean;
  onFillImageSlot?: (slotId: string) => void;
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
    :content-json="contentJson"
    :on-jump-to-message="onJumpToMessage"
    :magic-time="magicTime"
    :can-fill-image-slots="canFillImageSlots"
    :on-fill-image-slot="onFillImageSlot"
  />
</template>
