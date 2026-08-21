import { computed, type Ref } from 'vue';

export function useMessageLink(
  channelId: Ref<string | undefined>,
  messageId: Ref<string | undefined>,
) {
  return computed(() => {
    if (!channelId.value || !messageId.value) return '';
    return `${window.location.origin}/channels/${channelId.value}/${messageId.value}`;
  });
}

/** @deprecated Import from `@/features/chat/copyToClipboard` instead. */
export { copyToClipboard } from '@/features/chat/copyToClipboard';
