import {
  dropPendingClientMessageByClientId,
  dropPendingClientMessageIfChannelAndId,
  type PendingClientEchoMessage,
} from '@/services/realtime/socketPendingClientMessages';
import type { UiTransactionManager } from '@/ui/transactions/TransactionManager';

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
    },
    finalizePendingSend: (clientMessageId) => {
      dropPendingClientMessageByClientId(
        opts.pendingSentMessages,
        clientMessageId,
      );
      opts.uiTx.commitTransaction(clientMessageId);
    },
  };
}
