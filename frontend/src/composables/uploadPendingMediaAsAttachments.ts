/**
 * Shared upload path for chat composer + message edit (pending media → persisted URLs).
 */
import type { MessageAttachmentPayload } from '@shared/types';
import {
  uploadChatAttachmentFile,
  type ChatMediaUploadProgressEvent,
} from '@/api/echoClient';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import {
  assertChatUploadFilesWithinClientLimits,
  formatChatUploadErrorMessage,
} from '@/services/domain/chatUploads';
import { chatDocumentContentTypeForPresign } from '@/utils/chatUploadMediaTypes';
import { useAuthSessionStore } from '@/stores/authSession';
import type {
  PendingGif,
  PendingExternalImage,
  PendingImage,
  PendingVideo,
  PendingAudio,
  PendingDocument,
} from './usePendingMedia';

export type PendingMediaUploadOptions = {
  onMediaUploadProgress?: (e: ChatMediaUploadProgressEvent) => void;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function waitForPendingVideoUpload(
  video: PendingVideo,
  timeoutMs = 120_000,
): Promise<void> {
  if (video.uploadStatus === 'done') return Promise.resolve();
  if (video.uploadStatus === 'error') {
    return Promise.reject(new Error(`Failed to upload ${video.file.name}`));
  }
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (video.uploadStatus === 'done') {
        resolve();
        return;
      }
      if (video.uploadStatus === 'error') {
        reject(new Error(`Failed to upload ${video.file.name}`));
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Upload timed out: ${video.file.name}`));
        return;
      }
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

export async function uploadPendingMediaAsAttachments(
  channelId: string,
  pendingImages: PendingImage[],
  pendingVideos: PendingVideo[],
  pendingAudios: PendingAudio[],
  pendingDocuments: PendingDocument[],
  pendingExternalImages: PendingExternalImage[],
  pendingGifs: PendingGif[],
  options?: PendingMediaUploadOptions,
): Promise<MessageAttachmentPayload[]> {
  assertChatUploadFilesWithinClientLimits({
    pendingImages,
    pendingVideos,
    pendingAudios,
    pendingDocuments,
  });

  const attachments: MessageAttachmentPayload[] = [];

  if (echoSyncCapabilities.isMockDataMode) {
    const failed: string[] = [];
    const uploadFileCount =
      pendingImages.length +
      pendingVideos.length +
      pendingAudios.length +
      pendingDocuments.length;
    const report = (e: ChatMediaUploadProgressEvent) => {
      options?.onMediaUploadProgress?.(e);
    };

    for (let i = 0; i < pendingImages.length; i++) {
      const p = pendingImages[i]!;
      report({
        fileIndex: i,
        fileTotal: uploadFileCount,
        fileName: p.file.name,
        kind: 'image',
        phase: 'preparing',
        uploadPercent: null,
      });
      report({
        fileIndex: i,
        fileTotal: uploadFileCount,
        fileName: p.file.name,
        kind: 'image',
        phase: 'checking',
        uploadPercent: null,
      });
      report({
        fileIndex: i,
        fileTotal: uploadFileCount,
        fileName: p.file.name,
        kind: 'image',
        phase: 'uploading',
        uploadPercent: 0,
      });
      try {
        const url = await fileToDataUrl(p.file);
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'image',
          phase: 'uploading',
          uploadPercent: 100,
        });
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'image',
          phase: 'finishing',
          uploadPercent: null,
        });
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'image',
          phase: 'done',
          uploadPercent: null,
        });
        attachments.push({
          url,
          kind: 'image',
          filename: p.file.name,
          mimeType: p.file.type || undefined,
          ...(p.spoiler ? { spoiler: true } : {}),
        });
      } catch {
        failed.push(p.file.name);
      }
    }

    const imageCount = pendingImages.length;
    for (let j = 0; j < pendingVideos.length; j++) {
      const p = pendingVideos[j]!;
      const i = imageCount + j;
      report({
        fileIndex: i,
        fileTotal: uploadFileCount,
        fileName: p.file.name,
        kind: 'video',
        phase: 'checking',
        uploadPercent: null,
      });
      report({
        fileIndex: i,
        fileTotal: uploadFileCount,
        fileName: p.file.name,
        kind: 'video',
        phase: 'uploading',
        uploadPercent: 0,
      });
      try {
        const url = await fileToDataUrl(p.file);
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'video',
          phase: 'uploading',
          uploadPercent: 100,
        });
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'video',
          phase: 'finishing',
          uploadPercent: null,
        });
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'video',
          phase: 'done',
          uploadPercent: null,
        });
        attachments.push({
          url,
          kind: 'video',
          filename: p.file.name,
          mimeType: p.file.type || undefined,
          ...(p.spoiler ? { spoiler: true } : {}),
        });
      } catch {
        failed.push(p.file.name);
      }
    }

    const imageVideoCount = pendingImages.length + pendingVideos.length;
    for (let k = 0; k < pendingAudios.length; k++) {
      const p = pendingAudios[k]!;
      const i = imageVideoCount + k;
      report({
        fileIndex: i,
        fileTotal: uploadFileCount,
        fileName: p.file.name,
        kind: 'audio',
        phase: 'checking',
        uploadPercent: null,
      });
      report({
        fileIndex: i,
        fileTotal: uploadFileCount,
        fileName: p.file.name,
        kind: 'audio',
        phase: 'uploading',
        uploadPercent: 0,
      });
      try {
        const url = await fileToDataUrl(p.file);
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'audio',
          phase: 'uploading',
          uploadPercent: 100,
        });
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'audio',
          phase: 'finishing',
          uploadPercent: null,
        });
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'audio',
          phase: 'done',
          uploadPercent: null,
        });
        attachments.push({
          url,
          kind: 'audio',
          filename: p.file.name,
          mimeType: p.file.type || undefined,
          ...(p.spoiler ? { spoiler: true } : {}),
        });
      } catch {
        failed.push(p.file.name);
      }
    }

    const imageVideoAudioCount =
      pendingImages.length + pendingVideos.length + pendingAudios.length;
    for (let d = 0; d < pendingDocuments.length; d++) {
      const p = pendingDocuments[d]!;
      const i = imageVideoAudioCount + d;
      report({
        fileIndex: i,
        fileTotal: uploadFileCount,
        fileName: p.file.name,
        kind: 'document',
        phase: 'checking',
        uploadPercent: null,
      });
      report({
        fileIndex: i,
        fileTotal: uploadFileCount,
        fileName: p.file.name,
        kind: 'document',
        phase: 'uploading',
        uploadPercent: 0,
      });
      try {
        const url = await fileToDataUrl(p.file);
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'document',
          phase: 'uploading',
          uploadPercent: 100,
        });
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'document',
          phase: 'finishing',
          uploadPercent: null,
        });
        report({
          fileIndex: i,
          fileTotal: uploadFileCount,
          fileName: p.file.name,
          kind: 'document',
          phase: 'done',
          uploadPercent: null,
        });
        attachments.push({
          url,
          kind: 'document',
          filename: p.file.name,
          mimeType: p.file.type || undefined,
          fileSize: p.file.size,
          ...(p.spoiler ? { spoiler: true } : {}),
        });
      } catch {
        failed.push(p.file.name);
      }
    }
    for (const x of pendingExternalImages) {
      attachments.push({
        url: x.url,
        kind: 'image',
        ...(x.spoiler ? { spoiler: true } : {}),
      });
    }
    for (const g of pendingGifs) {
      attachments.push({
        url: g.url,
        kind: 'gif',
        ...(g.spoiler ? { spoiler: true } : {}),
      });
    }
    if (failed.length > 0) {
      throw new Error(`Failed to read: ${failed.join(', ')}.`);
    }
    return attachments;
  }

  const auth = useAuthSessionStore();
  const token = auth.accessToken?.trim() ?? '';
  if (!auth.isAuthenticated) throw new Error('Sign in to upload files.');

  const uploadFileCount =
    pendingImages.length +
    pendingVideos.length +
    pendingAudios.length +
    pendingDocuments.length;
  const fileOpts =
    options?.onMediaUploadProgress && uploadFileCount > 0
      ? {
          onProgress: options.onMediaUploadProgress,
        }
      : undefined;

  try {
    for (let i = 0; i < pendingImages.length; i++) {
      const p = pendingImages[i]!;
      const uploaded = await uploadChatAttachmentFile(
        token,
        channelId,
        p.file,
        {
          fileIndex: i,
          fileTotal: uploadFileCount,
          ...fileOpts,
        },
      );
      attachments.push({
        url: uploaded.url,
        ...(uploaded.storageKey ? { storageKey: uploaded.storageKey } : {}),
        kind: 'image',
        filename: p.file.name,
        mimeType: p.file.type || undefined,
        ...(p.spoiler ? { spoiler: true } : {}),
      });
    }
    const imageCount = pendingImages.length;
    for (let j = 0; j < pendingVideos.length; j++) {
      const p = pendingVideos[j]!;
      if (p.uploadStatus === 'uploading') {
        await waitForPendingVideoUpload(p);
      }
      if (p.uploadStatus === 'done' && p.uploadUrl) {
        attachments.push({
          url: p.uploadUrl,
          ...(p.uploadStorageKey ? { storageKey: p.uploadStorageKey } : {}),
          kind: 'video',
          filename: p.file.name,
          mimeType: p.file.type || undefined,
          ...(p.width && p.height ? { width: p.width, height: p.height } : {}),
          ...(p.spoiler ? { spoiler: true } : {}),
        });
        continue;
      }
      const uploaded = await uploadChatAttachmentFile(
        token,
        channelId,
        p.file,
        {
          fileIndex: imageCount + j,
          fileTotal: uploadFileCount,
          cachedSha256Hex: p.sha256Hex,
          ...fileOpts,
        },
      );
      attachments.push({
        url: uploaded.url,
        ...(uploaded.storageKey ? { storageKey: uploaded.storageKey } : {}),
        kind: 'video',
        filename: p.file.name,
        mimeType: p.file.type || undefined,
        ...(p.width && p.height ? { width: p.width, height: p.height } : {}),
        ...(p.spoiler ? { spoiler: true } : {}),
      });
    }
    const imageVideoCount = pendingImages.length + pendingVideos.length;
    for (let k = 0; k < pendingAudios.length; k++) {
      const p = pendingAudios[k]!;
      const uploaded = await uploadChatAttachmentFile(
        token,
        channelId,
        p.file,
        {
          fileIndex: imageVideoCount + k,
          fileTotal: uploadFileCount,
          ...fileOpts,
        },
      );
      attachments.push({
        url: uploaded.url,
        ...(uploaded.storageKey ? { storageKey: uploaded.storageKey } : {}),
        kind: 'audio',
        filename: p.file.name,
        mimeType: p.file.type || undefined,
        ...(p.spoiler ? { spoiler: true } : {}),
      });
    }
    const imageVideoAudioCount =
      pendingImages.length + pendingVideos.length + pendingAudios.length;
    for (let d = 0; d < pendingDocuments.length; d++) {
      const p = pendingDocuments[d]!;
      const uploaded = await uploadChatAttachmentFile(
        token,
        channelId,
        p.file,
        {
          fileIndex: imageVideoAudioCount + d,
          fileTotal: uploadFileCount,
          ...fileOpts,
        },
      );
      attachments.push({
        url: uploaded.url,
        ...(uploaded.storageKey ? { storageKey: uploaded.storageKey } : {}),
        kind: 'document',
        filename: p.file.name,
        mimeType: chatDocumentContentTypeForPresign(p.file),
        fileSize: uploaded.fileSize ?? p.file.size,
        ...(p.spoiler ? { spoiler: true } : {}),
      });
    }
  } catch (e) {
    reportPrimaryFlowFailure('chat.upload_failed', e, { channelId });
    const wrapped = new Error(formatChatUploadErrorMessage(e));
    if (e instanceof Error) wrapped.cause = e;
    throw wrapped;
  }
  for (const x of pendingExternalImages) {
    attachments.push({
      url: x.url,
      kind: 'image',
      ...(x.spoiler ? { spoiler: true } : {}),
    });
  }
  for (const g of pendingGifs) {
    attachments.push({
      url: g.url,
      kind: 'gif',
      ...(g.spoiler ? { spoiler: true } : {}),
    });
  }

  return attachments;
}
