import type { EchoRealtimeHostPorts } from '@/services/realtime/echoRealtimePort';
import {
  insertChannelMessageFromHistory,
  restoreChannelMessageReactions,
  updateChannelMessageInBucket,
} from '@/services/realtime/channelMessageAuthority';
import type { UiTransactionManager } from '@/ui/transactions/TransactionManager';

export function registerEchoRealtimeUiControllerTransactions(opts: {
  uiTx: UiTransactionManager;
  host: EchoRealtimeHostPorts;
  cleanupOptimisticSend: (channelId: string, clientMessageId: string) => void;
}): void {
  const { uiTx, host, cleanupOptimisticSend } = opts;

  uiTx.register('message-send', {
    rollback(tx) {
      if (tx.type !== 'message-send') return;
      cleanupOptimisticSend(tx.channelId, tx.clientMessageId);
    },
    commit() {},
  });

  uiTx.register('reaction-toggle', {
    rollback(tx) {
      if (tx.type !== 'reaction-toggle') return;
      restoreChannelMessageReactions(
        tx.channelId,
        tx.messageId,
        tx.previousReactions,
      );
    },
    commit() {},
  });

  uiTx.register('message-edit', {
    rollback(tx) {
      if (tx.type !== 'message-edit') return;
      updateChannelMessageInBucket(
        tx.channelId,
        tx.messageId,
        tx.previousMessage,
      );
    },
    commit() {},
  });

  uiTx.register('message-delete', {
    rollback(tx) {
      if (tx.type !== 'message-delete') return;
      insertChannelMessageFromHistory(tx.channelId, tx.deletedMessage);
    },
    commit() {},
  });

  uiTx.register('message-pin', {
    rollback(tx) {
      if (tx.type !== 'message-pin') return;
      host.pins.pinRollbackSync.restorePinnedIds(
        tx.channelId,
        tx.previousPinnedIds,
      );
    },
    commit() {},
  });
}
