import { watch, type Ref } from 'vue';
import type { EchoWorkspaceState } from '@/api/echoClient';
import {
  cancelWarmCurrentServerChannelHeads,
  warmCurrentServerChannelHeadsNonBlocking,
} from '@/features/layout/echoWorkspace/echoWorkspaceChannelPrefetch';

type Input = {
  selectedServerId: () => string | null | undefined;
  activeChannelId: Ref<string>;
  categoriesByServer: Ref<EchoWorkspaceState['categoriesByServer']>;
  userId: () => string | undefined;
  missedByChannel: Ref<Record<string, unknown>>;
};

/** Wire selected-server navigation to the bounded durable channel-head warmer. */
export function useWarmCurrentServerChannels(input: Input): void {
  watch(
    [
      input.selectedServerId,
      () => input.activeChannelId.value,
      () => input.categoriesByServer.value,
      input.userId,
      () => input.missedByChannel.value,
    ],
    ([serverId, channelId, categoriesByServer, userId, missedByChannel]) => {
      if (
        !serverId ||
        serverId === 'echo' ||
        !userId ||
        !categoriesByServer[serverId]
      ) {
        cancelWarmCurrentServerChannelHeads();
        return;
      }
      const attentionChannelIds = Object.entries(missedByChannel ?? {})
        .filter(([, missed]) => !!missed)
        .map(([id]) => id);
      warmCurrentServerChannelHeadsNonBlocking(
        'cookie-session',
        { categoriesByServer },
        serverId,
        { userId, activeChannelId: channelId, attentionChannelIds },
      );
    },
    { immediate: true },
  );
}
