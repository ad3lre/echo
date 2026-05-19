import { computed, type Ref } from 'vue';
import { copyToClipboard } from '@/utils/copyToClipboard';

export function useMessageLink(
  channelId: Ref<string | undefined>,
  messageId: Ref<string | undefined>,
) {
  return computed(() => {
    if (!channelId.value || !messageId.value) return '';
    return `${window.location.origin}/channels/${channelId.value}/${messageId.value}`;
  });
}

export { copyToClipboard };
