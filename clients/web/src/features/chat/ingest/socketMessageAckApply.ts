import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { socketDiagInfo } from '@/observability/socketDiagnostics';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';
import type { Message } from '@shared/types';
import { rawMessageFromEchoAckMessage } from '@/features/chat/ingest/socketIncomingRawMessage';

export type EchoMessageAckApplySink = {
  getChannelList: (channelId: string) => RawMessage[] | undefined;
  materializeChannelAfterIndexMutation: (channelId: string) => void;
  appendChannelMessage: (channelId: string, raw: RawMessage) => void;
  onAfterIndexedAck?: (channelId: string) => void;
  finalizePendingSend: (clientMessageId: string) => void;
};

/** Apply server `message_ack`: merge into index or append, then clear optimistic send state. */
export function applyEchoMessageAck(
  message: Message,
  sink: EchoMessageAckApplySink,
): void {
  socketDiagInfo('onMessageAck', {
    id: message.id,
    channelId: message.channelId,
    authorId: message.authorId,
    contentPreview: message.content?.slice(0, 40),
  });
  const m = message;
  const channelId = m.channelId;
  const raw = rawMessageFromEchoAckMessage(m);
  const list = sink.getChannelList(channelId);
  if (list?.length) {
    const ackIndex = getChannelIndex(channelId, list);
    if (ackIndex.byId.has(m.id)) {
      ackIndex.update(m.id, raw);
    } else {
      ackIndex.insert(raw);
    }
    sink.materializeChannelAfterIndexMutation(channelId);
    sink.onAfterIndexedAck?.(channelId);
  } else {
    sink.appendChannelMessage(channelId, raw);
  }
  sink.finalizePendingSend(m.id);
}
