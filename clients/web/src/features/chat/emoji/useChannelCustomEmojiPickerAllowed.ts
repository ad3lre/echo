import { computed, type Ref } from 'vue';
import { useChatPermissions } from '@/features/chat/useChatPermissions';

/**
 * Whether custom / external emoji may appear in pickers for this channel
 * (`useExternalEmoji` / server capabilities).
 */
export function useChannelCustomEmojiPickerAllowed(
  channelId: Ref<string | undefined>,
) {
  const { getSendState } = useChatPermissions();

  return computed(() => {
    const cid = channelId.value?.trim();
    if (!cid) return true;
    return getSendState({
      channelId: cid,
      contentTypes: ['externalEmoji'],
    }).allowed;
  });
}
