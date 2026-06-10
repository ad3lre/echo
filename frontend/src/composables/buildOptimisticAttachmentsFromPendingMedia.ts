import type { MessageAttachmentPayload } from '@shared/types';
import type {
  PendingAudio,
  PendingDocument,
  PendingExternalImage,
  PendingGif,
  PendingImage,
  PendingVideo,
} from './usePendingMedia';

/** Blob / remote preview attachments for an optimistic outbound row before upload finishes. */
export function buildOptimisticAttachmentsFromPendingMedia(
  pendingImages: readonly PendingImage[],
  pendingVideos: readonly PendingVideo[],
  pendingAudios: readonly PendingAudio[],
  pendingDocuments: readonly PendingDocument[],
  pendingExternalImages: readonly PendingExternalImage[],
  pendingGifs: readonly PendingGif[],
): MessageAttachmentPayload[] {
  const attachments: MessageAttachmentPayload[] = [];

  for (const p of pendingImages) {
    attachments.push({
      url: p.url,
      kind: 'image',
      filename: p.file.name,
      mimeType: p.file.type || undefined,
      ...(p.width && p.height ? { width: p.width, height: p.height } : {}),
      ...(p.spoiler ? { spoiler: true } : {}),
    });
  }

  for (const p of pendingVideos) {
    attachments.push({
      url: p.previewFrameUrl || p.url,
      kind: 'video',
      filename: p.file.name,
      mimeType: p.file.type || undefined,
      ...(p.width && p.height ? { width: p.width, height: p.height } : {}),
      ...(p.spoiler ? { spoiler: true } : {}),
    });
  }

  for (const p of pendingAudios) {
    attachments.push({
      url: p.url,
      kind: 'audio',
      filename: p.file.name,
      mimeType: p.file.type || undefined,
      ...(p.spoiler ? { spoiler: true } : {}),
    });
  }

  for (const p of pendingDocuments) {
    attachments.push({
      url: p.url,
      kind: 'document',
      filename: p.file.name,
      fileSize: p.file.size,
      mimeType: p.file.type || undefined,
      ...(p.spoiler ? { spoiler: true } : {}),
    });
  }

  for (const x of pendingExternalImages) {
    attachments.push({
      url: x.url,
      kind: 'image',
      ...(x.width && x.height ? { width: x.width, height: x.height } : {}),
      ...(x.spoiler ? { spoiler: true } : {}),
    });
  }

  for (const g of pendingGifs) {
    attachments.push({
      url: g.url,
      kind: 'gif',
      ...(g.width && g.height ? { width: g.width, height: g.height } : {}),
      ...(g.spoiler ? { spoiler: true } : {}),
    });
  }

  return attachments;
}

/** Revoke composer blob URLs after upload completes or the optimistic row is rolled back. */
export function revokePendingMediaObjectUrls(
  pendingImages: readonly PendingImage[],
  pendingVideos: readonly PendingVideo[],
  pendingAudios: readonly PendingAudio[],
  pendingDocuments: readonly PendingDocument[],
): void {
  for (const p of pendingImages) {
    URL.revokeObjectURL(p.url);
  }
  for (const p of pendingVideos) {
    URL.revokeObjectURL(p.url);
    if (p.previewFrameUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(p.previewFrameUrl);
    }
  }
  for (const p of pendingAudios) {
    URL.revokeObjectURL(p.url);
  }
  for (const p of pendingDocuments) {
    URL.revokeObjectURL(p.url);
  }
}
