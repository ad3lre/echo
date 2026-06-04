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
import {
  buildOptimisticAttachmentsFromPendingMedia,
  revokePendingMediaObjectUrls,
} from './buildOptimisticAttachmentsFromPendingMedia';
import {
  beginDeferredMediaOutboundSend,
  completeDeferredMediaOutboundSend,
  failDeferredMediaOutboundSend,
  isDeferredMediaOutboundSendAvailable,
} from '@/services/realtime/deferredMediaOutboundSend';

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

type PendingMediaSnapshot = {
  images: PendingImage[];
  videos: PendingVideo[];
  audios: PendingAudio[];
  documents: PendingDocument[];
  externalImages: PendingExternalImage[];
  gifs: PendingGif[];
};

function snapshotPendingMedia(
  pendingImages: PendingImage[],
  pendingVideos: PendingVideo[],
  pendingAudios: PendingAudio[],
  pendingDocuments: PendingDocument[],
  pendingExternalImages: PendingExternalImage[],
  pendingGifs: PendingGif[],
): PendingMediaSnapshot {
  return {
    images: pendingImages.map((p) => ({ ...p })),
    videos: pendingVideos.map((p) => ({ ...p })),
    audios: pendingAudios.map((p) => ({ ...p })),
    documents: pendingDocuments.map((p) => ({ ...p })),
    externalImages: pendingExternalImages.map((p) => ({ ...p })),
    gifs: pendingGifs.map((p) => ({ ...p })),
  };
}

async function uploadSnapshotAsAttachments(
  channelId: string,
  snap: PendingMediaSnapshot,
  options?: ChatSendOptions,
): Promise<MessageAttachmentPayload[]> {
  return uploadPendingMediaAsAttachments(
    channelId,
    snap.images,
    snap.videos,
    snap.audios,
    snap.documents,
    snap.externalImages,
    snap.gifs,
    options,
  );
}

function sendUploadedAttachments(
  sendMessage: SendMessageFn,
  channelId: string,
  caption: string,
  mentions: MentionEntity[],
  replyTo: ReplyTo | undefined,
  attachments: MessageAttachmentPayload[],
): void {
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

export function useChatSend(sendMessage: SendMessageFn | undefined) {
  async function sendBlocking(
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

    const snap = snapshotPendingMedia(
      pendingImages,
      pendingVideos,
      pendingAudios,
      pendingDocuments,
      pendingExternalImages,
      pendingGifs,
    );

    const attachments = await uploadSnapshotAsAttachments(
      channelId,
      snap,
      options,
    );
    revokePendingMediaObjectUrls(
      snap.images,
      snap.videos,
      snap.audios,
      snap.documents,
    );
    sendUploadedAttachments(
      sendMessage,
      channelId,
      caption,
      mentions,
      replyTo,
      attachments,
    );
  }

  function sendOptimistic(
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
  ) {
    if (!sendMessage) return;

    const snap = snapshotPendingMedia(
      pendingImages,
      pendingVideos,
      pendingAudios,
      pendingDocuments,
      pendingExternalImages,
      pendingGifs,
    );

    const optimisticAttachments = buildOptimisticAttachmentsFromPendingMedia(
      snap.images,
      snap.videos,
      snap.audios,
      snap.documents,
      snap.externalImages,
      snap.gifs,
    );

    const clientMessageId = beginDeferredMediaOutboundSend({
      channelId,
      content: caption,
      mentions,
      replyTo,
      optimisticAttachments,
    });

    if (!clientMessageId) {
      void sendBlocking(
        channelId,
        caption,
        mentions,
        snap.images,
        snap.videos,
        snap.audios,
        snap.documents,
        snap.externalImages,
        snap.gifs,
        replyTo,
      );
      return;
    }

    void (async () => {
      try {
        const attachments = await uploadSnapshotAsAttachments(channelId, snap);
        completeDeferredMediaOutboundSend({
          channelId,
          clientMessageId,
          content: caption,
          mentions,
          replyTo,
          attachments,
        });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        failDeferredMediaOutboundSend({
          channelId,
          clientMessageId,
          error: err,
          draftContent: caption.trim() || undefined,
        });
      } finally {
        revokePendingMediaObjectUrls(
          snap.images,
          snap.videos,
          snap.audios,
          snap.documents,
        );
      }
    })();
  }

  function send(
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

    if (isDeferredMediaOutboundSendAvailable()) {
      sendOptimistic(
        channelId,
        caption,
        mentions,
        pendingImages,
        pendingVideos,
        pendingAudios,
        pendingDocuments,
        pendingExternalImages,
        pendingGifs,
        replyTo,
      );
      return;
    }

    return sendBlocking(
      channelId,
      caption,
      mentions,
      pendingImages,
      pendingVideos,
      pendingAudios,
      pendingDocuments,
      pendingExternalImages,
      pendingGifs,
      replyTo,
      options,
    );
  }

  return { send };
}
