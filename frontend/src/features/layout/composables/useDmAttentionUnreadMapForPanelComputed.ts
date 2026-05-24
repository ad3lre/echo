import { computed, type Ref } from 'vue';
import type { EchoAttentionDmSummary } from '@shared/types';
import { buildDmAttentionUnreadCountByChannel } from '@/features/dm/buildDmAttentionUnreadCountByChannel';
import type { RawMessage } from '@/features/chat/chatMessageTypes';

export function useDmAttentionUnreadMapForPanelComputed(deps: {
  dmAttentionByChannelId: Ref<Readonly<Record<string, EchoAttentionDmSummary>>>;
  messagesByChannelId: Ref<
    Readonly<Record<string, readonly RawMessage[] | undefined>>
  >;
  readStateByChannelId: Ref<Readonly<Record<string, string | null>>>;
  selfUserId: Ref<string | undefined>;
  isDmChannelId?: (channelId: string) => boolean;
}) {
  return computed(() =>
    buildDmAttentionUnreadCountByChannel(deps.dmAttentionByChannelId.value, {
      messagesByChannelId: deps.messagesByChannelId.value,
      readStateByChannelId: deps.readStateByChannelId.value,
      selfUserId: deps.selfUserId.value ?? null,
      isDmChannelId: deps.isDmChannelId,
    }),
  );
}
