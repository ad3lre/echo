import type { Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { EchoRealtimeHostPorts } from '@/services/realtime/echoRealtimePort';
import type { UiTransactionManager } from '@/ui/transactions/TransactionManager';
import type { IncomingChatMessageNotifyDetail } from '@/audio/incomingChatMessageNotifyDetail';
import type { EchoRealtimeIncomingChatPayload } from '@/services/realtime/socketIncomingRawMessage';
import { ingestEchoRealtimeIncomingChatMessage } from '@/services/realtime/socketIncomingLiveMessage';
import { applyEchoMessageAck } from '@/services/realtime/socketMessageAckApply';
import { ingestEchoMessageFailed } from '@/services/realtime/socketMessageFailedIngest';
import { handleEchoPollVoteFailed } from '@/services/realtime/socketPollVoteFailed';
import {
  applyRemoteMessageEdit,
  applyRemoteMessageEmbeds,
  applyRemoteMessageMediaMirror,
  applyRemoteMessageReactions,
  applyRemotePollUpdate,
} from '@/services/realtime/socketRemoteMessagePatchApply';
import {
  prunePendingClientMessages,
  type PendingClientEchoMessage,
} from '@/services/realtime/socketPendingClientMessages';
import { createEchoRealtimePendingSendReconciler } from '@/services/realtime/echoRealtimePendingSendReconciler';
import { createEchoRealtimeOptimisticRollback } from '@/services/realtime/echoRealtimeOptimisticRollback';
import { shouldApplyRemoteChannelTyping } from '@/services/realtime/socketChannelTypingIngest';
import {
  ensureChannelBucket,
  syncChannelMessages,
} from '@/services/realtime/channelMessageAuthority';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';

export type EchoRealtimeChatIngestPort = {
  onMessage: (payload: unknown) => void;
  onMessageFailed: (payload: unknown) => void;
  onMessageAck: (payload: unknown) => void;
  onMessageUpdated: (payload: unknown) => void;
  onMessageEmbeds: (payload: unknown) => void;
  onMessageMediaMirror: (payload: unknown) => void;
  onMessageDeleted: (payload: unknown) => void;
  onMessagePins: (payload: unknown) => void;
  onMessageReactions: (payload: unknown) => void;
  onPollUpdated: (payload: unknown) => void;
  onPollVoteFailed: (payload: unknown) => void;
};

export function createEchoRealtimeChatIngestPort(opts: {
  messages: Ref<Record<string, RawMessage[]>>;
  pendingSentMessages: PendingClientEchoMessage[];
  host: EchoRealtimeHostPorts;
  uiTx: UiTransactionManager;
  resolveEchoAuthorId: (payload: EchoRealtimeIncomingChatPayload) => string;
  appendChannelMessage: (channelId: string, msg: RawMessage) => void;
  removeMessageById: (channelId: string, messageId: string) => void;
  cleanupOptimisticSend: (channelId: string, clientMessageId: string) => void;
  notifyIncomingChatMessage: (detail: IncomingChatMessageNotifyDetail) => void;
  applyRealtimeAuthorHint?: (payload: {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
  }) => void;
  getViewerUserId?: () => string | undefined;
  /** App-shell hook to backfill missing reply targets via REST. See `IngestEchoRealtimeIncomingChatSink.ensureReplyTargetMessage`. */
  ensureReplyTargetMessage?: (channelId: string, messageId: string) => void;
}): EchoRealtimeChatIngestPort {
  const pendingReconciler = createEchoRealtimePendingSendReconciler({
    pendingSentMessages: opts.pendingSentMessages,
    uiTx: opts.uiTx,
  });
  const optimisticRollback = createEchoRealtimeOptimisticRollback({
    messages: opts.messages,
    uiTx: opts.uiTx,
    cleanupOptimisticSend: opts.cleanupOptimisticSend,
  });

  const indexSink = {
    getChannelList: (channelId: string) => ensureChannelBucket(channelId),
    materializeChannelAfterIndexMutation: (channelId: string) => {
      const index = getChannelIndex(channelId);
      syncChannelMessages(channelId, index);
    },
  };

  function handleEchoRealtimeIncomingChatPayload(
    payload: EchoRealtimeIncomingChatPayload,
  ) {
    ingestEchoRealtimeIncomingChatMessage(payload, {
      ensureChannelMessagesList: (channelId) => {
        return ensureChannelBucket(channelId);
      },
      onDuplicateById: (channelId, messageId) => {
        pendingReconciler.onDuplicateById(channelId, messageId);
      },
      resolveAuthorId: (p) => opts.resolveEchoAuthorId(p),
      appendChannelMessage: opts.appendChannelMessage,
      notifyIncomingChatMessage: opts.notifyIncomingChatMessage,
      applyAuthorHint: opts.applyRealtimeAuthorHint,
      getViewerUserId: opts.getViewerUserId,
      ensureReplyTargetMessage: opts.ensureReplyTargetMessage,
    });
  }

  return {
    onMessage: (payload) => {
      handleEchoRealtimeIncomingChatPayload(
        payload as EchoRealtimeIncomingChatPayload,
      );
    },
    onMessageFailed: (payload) => {
      ingestEchoMessageFailed(
        payload as Parameters<typeof ingestEchoMessageFailed>[0],
        {
          rollbackTransaction: (id) => opts.uiTx.rollbackTransaction(id),
          rollbackOptimisticClientMessage: (cid, mid) =>
            optimisticRollback.rollbackOptimisticClientMessage(cid, mid),
          prunePendingClientMessages: (nowMs) =>
            prunePendingClientMessages(opts.pendingSentMessages, nowMs),
          dispatchEchoMessageFailed: (detail) =>
            opts.host.errors.onMessageFailed(detail),
        },
      );
    },
    onMessageUpdated: (payload) => {
      applyRemoteMessageEdit(
        payload as Parameters<typeof applyRemoteMessageEdit>[0],
        {
          ...indexSink,
          onAfterEdit: (channelId, messageId) =>
            opts.uiTx.commitPendingMessageEditForMessage(channelId, messageId),
        },
      );
    },
    onMessageEmbeds: (payload) => {
      applyRemoteMessageEmbeds(
        payload as Parameters<typeof applyRemoteMessageEmbeds>[0],
        indexSink,
      );
    },
    onMessageMediaMirror: (payload) => {
      applyRemoteMessageMediaMirror(
        payload as Parameters<typeof applyRemoteMessageMediaMirror>[0],
        indexSink,
      );
    },
    onMessageDeleted: (payload) => {
      const p = payload as { channelId: string; messageId: string };
      opts.uiTx.commitPendingMessageDeleteForMessage(p.channelId, p.messageId);
      opts.removeMessageById(p.channelId, p.messageId);
    },
    onMessagePins: (payload) => {
      const p = payload as { channelId: string; messageIds: string[] };
      opts.host.pins.applyChannelPinsUpdate(p);
      opts.uiTx.commitPendingPinMutationsForChannel(p.channelId);
    },
    onMessageReactions: (payload) => {
      applyRemoteMessageReactions(
        payload as Parameters<typeof applyRemoteMessageReactions>[0],
        {
          ...indexSink,
          onAfterReactions: (channelId, messageId) =>
            opts.uiTx.commitPendingReactionTogglesForMessage(
              channelId,
              messageId,
            ),
        },
      );
    },
    onPollUpdated: (payload) => {
      applyRemotePollUpdate(
        payload as Parameters<typeof applyRemotePollUpdate>[0],
        indexSink,
      );
    },
    onPollVoteFailed: (payload) => {
      handleEchoPollVoteFailed(
        payload as Parameters<typeof handleEchoPollVoteFailed>[0],
      );
    },
    onMessageAck: (payload) => {
      const p = payload as { message: import('@shared/types').Message };
      applyEchoMessageAck(p.message, {
        getChannelList: (channelId) => ensureChannelBucket(channelId),
        materializeChannelAfterIndexMutation: (channelId) => {
          const index = getChannelIndex(channelId);
          syncChannelMessages(channelId, index);
        },
        appendChannelMessage: opts.appendChannelMessage,
        onAfterIndexedAck: (channelId) =>
          opts.host.clientCaps.applyEchoChannelClientCap(channelId),
        finalizePendingSend: pendingReconciler.finalizePendingSend,
      });
    },
  };
}

export type EchoRealtimeTypingIngestPort = {
  onChannelTypingIo: (payload: unknown) => void;
};

export function createEchoRealtimeTypingIngestPort(opts: {
  host: EchoRealtimeHostPorts;
  currentUserId: Ref<string | undefined>;
}): EchoRealtimeTypingIngestPort {
  return {
    onChannelTypingIo: (payload) => {
      const p = payload as {
        channelId: string;
        userId: string;
        displayName: string;
        avatarUrl: string;
      };
      if (!shouldApplyRemoteChannelTyping(p, opts.currentUserId.value)) return;
      opts.host.typing.applyChannelTyping(p);
    },
  };
}
