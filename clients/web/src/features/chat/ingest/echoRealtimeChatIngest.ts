import type { Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { EchoRealtimeHostPorts } from '@/features/layout/realtime/echoRealtimePort';
import type { UiTransactionManager } from '@/features/layout/uiTransactionManager';
import type { IncomingChatMessageNotifyDetail } from '@/audio/incomingChatMessageNotifyDetail';
import type { EchoRealtimeIncomingChatPayload } from '@/features/chat/ingest/socketIncomingRawMessage';
import { ingestEchoRealtimeIncomingChatMessage } from '@/features/chat/ingest/socketIncomingLiveMessage';
import { applyEchoMessageAck } from '@/features/chat/ingest/socketMessageAckApply';
import { ingestEchoMessageFailed } from '@/features/chat/ingest/socketMessageFailedIngest';
import { handleEchoPollVoteFailed } from '@/features/layout/realtime/socketPollVoteFailed';
import {
  applyRemoteMessageEdit,
  applyRemoteMessageEmbeds,
  applyRemoteMessageMediaMirror,
  applyRemoteMessageReactions,
  applyRemotePollUpdate,
} from '@/features/chat/ingest/socketRemoteMessagePatchApply';
import {
  isPendingClientMessageId,
  prunePendingClientMessages,
  type PendingClientEchoMessage,
} from '@/features/chat/ingest/socketPendingClientMessages';
import { touchOutboundSendPendingUi } from '@/features/chat/send/deferredMediaOutboundSend';
import { createEchoRealtimePendingSendReconciler } from '@/features/chat/ingest/echoRealtimePendingSendReconciler';
import { createEchoRealtimeOptimisticRollback } from '@/features/layout/realtime/echoRealtimeOptimisticRollback';
import { shouldApplyRemoteChannelTyping } from '@/features/layout/realtime/socketChannelTypingIngest';
import {
  ensureChannelBucket,
  syncChannelMessages,
} from '@/features/chat/domain/channelMessageAuthority';
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
      resolveAuthorId: (p) => {
        const wasPending = isPendingClientMessageId(
          opts.pendingSentMessages,
          p.channelId,
          p.id,
          Date.now(),
        );
        const authorId = opts.resolveEchoAuthorId(p);
        if (wasPending) {
          pendingReconciler.finalizePendingSend(p.id);
        }
        return authorId;
      },
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
          prunePendingClientMessages: (nowMs) => {
            const before = opts.pendingSentMessages.length;
            prunePendingClientMessages(opts.pendingSentMessages, nowMs);
            if (opts.pendingSentMessages.length !== before) {
              touchOutboundSendPendingUi();
            }
          },
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
          viewerUserId: opts.getViewerUserId?.(),
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
