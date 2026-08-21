import {
  dropPendingClientMessageByClientId,
  dropPendingClientMessageIfChannelAndId,
  type PendingClientEchoMessage,
} from '@/features/chat/ingest/socketPendingClientMessages';
import { touchOutboundSendPendingUi } from '@/features/chat/send/deferredMediaOutboundSend';
import type { UiTransactionManager } from '@/features/layout/uiTransactionManager';

export function createEchoRealtimePendingSendReconciler(opts: {
  pendingSentMessages: PendingClientEchoMessage[];
  uiTx: UiTransactionManager;
}): {
  onDuplicateById: (channelId: string, messageId: string) => void;
  finalizePendingSend: (clientMessageId: string) => void;
} {
  return {
    onDuplicateById: (channelId, messageId) => {
      dropPendingClientMessageIfChannelAndId(
        opts.pendingSentMessages,
        channelId,
        messageId,
      );
      opts.uiTx.commitTransaction(messageId);
      touchOutboundSendPendingUi();
    },
    finalizePendingSend: (clientMessageId) => {
      dropPendingClientMessageByClientId(
        opts.pendingSentMessages,
        clientMessageId,
      );
      opts.uiTx.commitTransaction(clientMessageId);
      touchOutboundSendPendingUi();
    },
  };
}
