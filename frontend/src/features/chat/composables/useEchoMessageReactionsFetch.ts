import { ref, type Ref } from 'vue';
import type { MessageReaction } from '@shared/types';
import { fetchEchoMessageReactions } from '@/api/echo/echoReactionHttp';

export function useEchoMessageReactionsFetch(accessToken: Ref<string | null>) {
  const loadedReactions = ref<MessageReaction[] | null>(null);
  const loading = ref(false);
  const loadError = ref(false);

  function reset(): void {
    loadedReactions.value = null;
    loadError.value = false;
    loading.value = false;
  }

  async function load(channelId: string, messageId: string): Promise<void> {
    loading.value = true;
    loadError.value = false;
    try {
      loadedReactions.value = await fetchEchoMessageReactions({
        token: accessToken.value,
        channelId,
        messageId,
      });
    } catch {
      loadError.value = true;
      loadedReactions.value = null;
    } finally {
      loading.value = false;
    }
  }

  return {
    loadedReactions,
    loading,
    loadError,
    reset,
    load,
  };
}
