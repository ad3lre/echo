import type {
  MentionEntity,
  MessageAttachmentPayload,
  PollData,
  ReplyTo,
} from '@shared/types';
import type { OutgoingContentType } from '@/services/domain/permissions';

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
  contentJson?: unknown;
  contentSchemaVersion?: number;
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
