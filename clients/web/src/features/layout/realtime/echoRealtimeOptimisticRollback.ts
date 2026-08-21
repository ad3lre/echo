import type { Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';
import type { UiTransactionManager } from '@/features/layout/uiTransactionManager';

export function createEchoRealtimeOptimisticRollback(opts: {
  messages: Ref<Record<string, RawMessage[]>>;
  uiTx: UiTransactionManager;
  cleanupOptimisticSend: (channelId: string, clientMessageId: string) => void;
}): {
  rollbackOptimisticClientMessage: (
    channelId: string,
    clientMessageId: string,
  ) => string | undefined;
} {
  return {
    rollbackOptimisticClientMessage: (channelId, clientMessageId) => {
      let draftContent: string | undefined;
      const list = opts.messages.value[channelId];
      if (list?.length) {
        const index = getChannelIndex(channelId, list);
        const msg = index.byId.get(clientMessageId);
        if (msg) draftContent = msg.content;
      }

      opts.uiTx.rollbackTransaction(clientMessageId);

      const after = opts.messages.value[channelId];
      if (after?.length) {
        const failIndex = getChannelIndex(channelId, after);
        if (failIndex.byId.has(clientMessageId)) {
          opts.cleanupOptimisticSend(channelId, clientMessageId);
        }
      }

      return draftContent;
    },
  };
}
