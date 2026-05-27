import { storeToRefs } from 'pinia';
import type { Ref, ShallowRef } from 'vue';
import { useAuthSessionStore } from '@/stores/authSession';
import { useEchoAttentionStore } from '@/stores/echoAttention';
import { useEchoSessionStore } from '@/stores/echoSession';
import { createEchoHistoryController } from '@/services/orchestration/echoHistoryOrchestration';
import { ECHO_CHANNEL_MESSAGE_PAGE_SIZE } from '@/constants/echoHistoryPageSize';

export { ECHO_CHANNEL_MESSAGE_PAGE_SIZE };

export type UseEchoHistoryDmRegistryOpts = {
  echoDmThreadIds: ShallowRef<Set<string>> | Ref<ReadonlySet<string>>;
  echoDmPeerByChannelId:
    | ShallowRef<Map<string, string>>
    | Ref<ReadonlyMap<string, string>>;
};

/**
 * When the active channel is a real Echo channel (UUID) and the user is logged in,
 * load message history from GET /api/v1/echo/channels/:id/messages into the shared messages ref.
 */
export function useEchoHistory(
  activeChannelId: Ref<string>,
  dmRegistry?: UseEchoHistoryDmRegistryOpts,
) {
  const auth = useAuthSessionStore();
  const echoAttention = useEchoAttentionStore();
  const echoSession = useEchoSessionStore();
  const { readStateByChannelId: lastReadMessageIdByChannel } =
    storeToRefs(echoAttention);

  return createEchoHistoryController({
    activeChannelId,
    auth,
    lastReadMessageIdByChannel,
    echoAttention,
    isRealtimeConnected: () => echoSession.liveSyncConnected,
    ...(dmRegistry
      ? {
          echoDmThreadIds: dmRegistry.echoDmThreadIds,
          echoDmPeerByChannelId: dmRegistry.echoDmPeerByChannelId,
        }
      : {}),
  });
}
