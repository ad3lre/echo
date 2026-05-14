/**
 * All real-mode shell sends should go through executeShellSend so permission + surface checks
 * stay centralized (no ad-hoc socket calls for chat messages).
 */

import type {
  MentionEntity,
  MessageAttachmentPayload,
  PollData,
  ReplyTo,
} from '@shared/types';
import type { OutgoingContentType } from '@/composables/useChatPermissions';
import type { E2eeOutboundEncryption } from '@/services/e2ee/e2eeTypes';

export type ShellSendPayload = {
  content: string;
  mentions?: MentionEntity[];
  imageUrl?: string;
  poll?: PollData;
  gif?: boolean;
  replyTo?: ReplyTo;
  imageSpoiler?: boolean;
  videoUrl?: string;
  attachments?: MessageAttachmentPayload[];
  /** TipTap doc for text-only v2 sends (no poll / no media). */
  contentJson?: unknown;
  contentSchemaVersion?: number;
  /** When set, the realtime layer sends this encrypted wire instead of deriving it from `content`. */
  preEncryptedE2ee?: E2eeOutboundEncryption;
};

export type SendIntent = {
  channelId: string;
  contentTypes: OutgoingContentType[];
  payload: ShellSendPayload;
};

export function contentTypesForShellPayload(
  payload: ShellSendPayload,
): OutgoingContentType[] {
  const types: OutgoingContentType[] = ['text'];
  if (payload.poll) types.push('poll');
  if (
    payload.imageUrl ||
    payload.videoUrl ||
    payload.gif ||
    (payload.attachments && payload.attachments.length > 0)
  ) {
    types.push('media');
  }
  return types;
}

export function buildSendIntent(
  channelId: string,
  payload: ShellSendPayload,
  contentTypes?: OutgoingContentType[],
): SendIntent {
  return {
    channelId,
    contentTypes: contentTypes?.length
      ? contentTypes
      : contentTypesForShellPayload(payload),
    payload,
  };
}

export type SocketSendFn = (
  channelId: string,
  content: string,
  mentions?: MentionEntity[],
  imageUrl?: string,
  poll?: PollData,
  gif?: boolean,
  replyTo?: ReplyTo,
  imageSpoiler?: boolean,
  videoUrl?: string,
  attachments?: MessageAttachmentPayload[],
  contentJson?: unknown,
  contentSchemaVersion?: number,
  preEncryptedE2ee?: E2eeOutboundEncryption,
) => void;

/**
 * Single choke point: gate then socket. Callers must not invoke `socketSend` for chat elsewhere.
 */
export function executeShellSend(
  intent: SendIntent,
  options: {
    getBlockReason: (
      channelId: string,
      contentTypes: OutgoingContentType[],
    ) => string | null;
    socketSend: SocketSendFn;
  },
): void {
  const block = options.getBlockReason(intent.channelId, intent.contentTypes);
  if (block) throw new Error(block);
  const p = intent.payload;
  options.socketSend(
    intent.channelId,
    p.content,
    p.mentions,
    p.imageUrl,
    p.poll,
    p.gif,
    p.replyTo,
    p.imageSpoiler,
    p.videoUrl,
    p.attachments,
    p.contentJson,
    p.contentSchemaVersion,
    p.preEncryptedE2ee,
  );
}
