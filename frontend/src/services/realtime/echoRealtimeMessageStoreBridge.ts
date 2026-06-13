import type { Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { EchoRealtimeHostPorts } from '@/services/realtime/echoRealtimePort';
import type { EchoRealtimeIncomingChatPayload } from '@/services/realtime/socketIncomingRawMessage';
import {
  consumeAuthorForPendingClientMessage,
  dropPendingClientMessageByClientId,
  recordPendingClientMessage,
  type PendingClientEchoMessage,
} from '@/services/realtime/socketPendingClientMessages';
import { registerEchoPendingClientMessageList } from '@/services/realtime/echoPendingClientMessageRegistry';
import { touchOutboundSendPendingUi } from '@/services/realtime/deferredMediaOutboundSend';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';
import {
  ensureChannelBucket,
  syncChannelMessages,
} from '@/services/realtime/channelMessageAuthority';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import type { ReplyTo } from '@shared/types';

/** Message list + pending optimistic-send bookkeeping for the realtime port (index canonical; `messages` materialized via authority). */
export function createEchoRealtimeMessageStoreBridge(opts: {
  messages: Ref<Record<string, RawMessage[]>>;
  host: EchoRealtimeHostPorts;
}): {
  pendingSentMessages: PendingClientEchoMessage[];
  rememberPendingSentMessage: (
    channelId: string,
    clientMessageId: string,
    authorId: string,
    replyTo?: ReplyTo,
  ) => void;
  resolveEchoAuthorId: (payload: EchoRealtimeIncomingChatPayload) => string;
  removeMessageById: (channelId: string, messageId: string) => void;
  appendChannelMessage: (channelId: string, msg: RawMessage) => void;
  cleanupOptimisticSend: (channelId: string, clientMessageId: string) => void;
} {
  const { messages, host } = opts;
  const pendingSentMessages: PendingClientEchoMessage[] = [];
  registerEchoPendingClientMessageList(pendingSentMessages);

  function rememberPendingSentMessage(
    channelId: string,
    clientMessageId: string,
    authorId: string,
    replyTo?: ReplyTo,
  ) {
    recordPendingClientMessage(
      pendingSentMessages,
      {
        channelId,
        clientMessageId,
        authorId,
        replyToId: replyTo?.messageId,
      },
      Date.now(),
    );
    touchOutboundSendPendingUi();
  }

  function resolveEchoAuthorId(payload: EchoRealtimeIncomingChatPayload) {
    return consumeAuthorForPendingClientMessage(
      pendingSentMessages,
      payload.channelId,
      payload.id,
      payload.authorId,
      Date.now(),
    );
  }

  function removeMessageById(channelId: string, messageId: string) {
    const index = messageWindowAuthority.getIndex(channelId);
    if (index.byId.has(messageId)) {
      index.remove(messageId);
      syncChannelMessages(channelId, index);
    }
  }

  function appendChannelMessage(channelId: string, msg: RawMessage) {
    ensureChannelBucket(channelId);
    const index = messageWindowAuthority.getIndex(channelId);
    index.insert(msg);
    syncChannelMessages(channelId, index);

    host.clientCaps.applyEchoChannelClientCap(channelId);
  }

  function cleanupOptimisticSend(channelId: string, clientMessageId: string) {
    removeMessageById(channelId, clientMessageId);
    const hadPending = pendingSentMessages.some(
      (entry) => entry.clientMessageId === clientMessageId,
    );
    dropPendingClientMessageByClientId(pendingSentMessages, clientMessageId);
    if (hadPending) touchOutboundSendPendingUi();
  }

  return {
    pendingSentMessages,
    rememberPendingSentMessage,
    resolveEchoAuthorId,
    removeMessageById,
    appendChannelMessage,
    cleanupOptimisticSend,
  };
}
