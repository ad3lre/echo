import type {
  MentionEntity,
  MessageAttachmentPayload,
  PollData,
  ReplyTo,
} from '@shared/types';
import type {
  PendingGif,
  PendingExternalImage,
  PendingImage,
  PendingVideo,
  PendingAudio,
  PendingDocument,
} from './usePendingMedia';
import {
  uploadPendingMediaAsAttachments,
  type PendingMediaUploadOptions,
} from './uploadPendingMediaAsAttachments';

/**
 * Chat send logic: text + media (images, video, audio, documents) via object storage (Echo) or data URLs (mock) + external GIF URLs.
 */

export type SendMessageFn = (
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
) => void;

export type ChatSendOptions = PendingMediaUploadOptions;

export function useChatSend(sendMessage: SendMessageFn | undefined) {
  async function send(
    channelId: string,
    caption: string,
    mentions: MentionEntity[],
    pendingImages: PendingImage[],
    pendingVideos: PendingVideo[],
    pendingAudios: PendingAudio[],
    pendingDocuments: PendingDocument[],
    pendingExternalImages: PendingExternalImage[],
    pendingGifs: PendingGif[],
    replyTo?: ReplyTo,
    options?: ChatSendOptions,
  ) {
    if (!sendMessage) return;

    const attachments = await uploadPendingMediaAsAttachments(
      channelId,
      pendingImages,
      pendingVideos,
      pendingAudios,
      pendingDocuments,
      pendingExternalImages,
      pendingGifs,
      options,
    );

    if (attachments.length === 0 && caption.trim()) {
      sendMessage(
        channelId,
        caption,
        mentions,
        undefined,
        undefined,
        undefined,
        replyTo,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      return;
    }
    if (attachments.length === 0) return;

    sendMessage(
      channelId,
      caption.trim(),
      mentions,
      undefined,
      undefined,
      false,
      replyTo,
      false,
      undefined,
      attachments,
      undefined,
      undefined,
    );
  }

  return { send };
}
