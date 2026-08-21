import {
  isPendingClientMessageId,
  type PendingClientEchoMessage,
} from '@/features/chat/ingest/socketPendingClientMessages';

/**
 * The realtime bridge owns the pending-send array; the read-state writer needs a
 * cheap "is this id still optimistic?" check without threading deps through the layout.
 */
let pendingSentMessagesRef: PendingClientEchoMessage[] | null = null;

export function registerEchoPendingClientMessageList(
  list: PendingClientEchoMessage[],
): void {
  pendingSentMessagesRef = list;
}

export function isEchoPendingOutboundMessageId(
  channelId: string,
  messageId: string,
): boolean {
  if (!pendingSentMessagesRef) return false;
  return isPendingClientMessageId(
    pendingSentMessagesRef,
    channelId,
    messageId,
    Date.now(),
  );
}
