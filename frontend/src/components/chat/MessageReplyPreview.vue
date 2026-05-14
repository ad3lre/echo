<script setup lang="ts">
import { computed } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import { safeImageUrl } from '@/utils/safeImageUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { isMessageAuthorOffline } from '@/utils/isOfflinePresence';

const props = defineProps<{
  message: MessageWithAuthor;
  replyToMessage?: MessageWithAuthor | null;
}>();

const quotedAuthorOffline = computed(() => {
  const rm = props.replyToMessage;
  if (!rm) return false;
  return isMessageAuthorOffline(rm.author?.status);
});

defineEmits<{
  scrollToQuotedMessage: [];
}>();

function truncateForReply(text: string, maxLen = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= maxLen ? t : t.slice(0, maxLen) + '…';
}
</script>

<template>
  <button
    v-if="message.replyTo"
    type="button"
    class="reply-line chat-focus-ring mb-1 flex w-full items-center gap-1.5 overflow-hidden pl-1 py-1 min-h-0 cursor-pointer text-left hover:opacity-90 transition-opacity rounded-sm"
    data-dev-hit="reply"
    title="Jump to message"
    @click="$emit('scrollToQuotedMessage')"
  >
    <div
      v-if="replyToMessage?.author?.avatar ?? message.replyTo.authorAvatar"
      class="relative h-4 w-4 shrink-0 overflow-hidden rounded-full"
    >
      <PausedGifAvatar
        :src="
          safeImageUrl(
            replyToMessage?.author?.avatar ?? message.replyTo.authorAvatar,
          )
        "
        :alt="message.replyTo.authorName"
        :session-key="
          replyToMessage?.authorId ?? message.replyTo.messageId ?? 'reply'
        "
        :img-class="
          quotedAuthorOffline
            ? 'rounded-full object-cover grayscale'
            : 'rounded-full object-cover'
        "
      />
    </div>
    <span class="text-xs truncate text-muted">
      <span
        class="font-medium"
        :class="quotedAuthorOffline ? 'text-fg-subtle' : 'text-[#00a8fc]'"
        >@{{ message.replyTo.authorName }}</span
      >
      <span> · </span>
      <template v-if="replyToMessage">
        <template v-if="replyToMessage.videoUrl">
          <span class="italic">[Video]</span>
          <span v-if="replyToMessage.content">
            {{ truncateForReply(replyToMessage.content, 50) }}</span
          >
        </template>
        <template v-else-if="replyToMessage.imageUrl">
          <span class="italic">[Image]</span>
          <span v-if="replyToMessage.content">
            {{ truncateForReply(replyToMessage.content, 50) }}</span
          >
        </template>
        <template v-else-if="replyToMessage.content">
          {{ truncateForReply(replyToMessage.content, 50) }}
        </template>
        <template v-else-if="replyToMessage.poll">
          <span class="italic">[Poll]</span>
        </template>
        <template v-else>
          <span class="italic">—</span>
        </template>
      </template>
      <template v-else>
        {{
          message.replyTo.content
            ? truncateForReply(message.replyTo.content, 50)
            : 'Attachment'
        }}
      </template>
    </span>
  </button>
</template>
