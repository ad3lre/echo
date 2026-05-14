import {
  ECHO_CLIENT_RAW_IMAGE_MAX_BYTES,
  ECHO_CLIENT_RAW_VIDEO_MAX_BYTES,
  ECHO_CLIENT_UPLOAD_MAX_BYTES,
} from '@/api/echoClient';

type FileLike = {
  name: string;
  size: number;
};

function mebibytes(bytes: number): number {
  return bytes / (1024 * 1024);
}

function createChatUploadTooLargeError(
  kind: 'image' | 'video' | 'audio',
  file: FileLike,
): Error {
  if (kind === 'image') {
    return new Error(
      `Image "${file.name}" is too large to process (${mebibytes(ECHO_CLIENT_RAW_IMAGE_MAX_BYTES)} MiB max before compression).`,
    );
  }
  if (kind === 'audio') {
    return new Error(
      `Audio "${file.name}" is too large to upload (${mebibytes(ECHO_CLIENT_UPLOAD_MAX_BYTES)} MiB max).`,
    );
  }
  return new Error(
    `Video "${file.name}" is too large to upload (${mebibytes(ECHO_CLIENT_RAW_VIDEO_MAX_BYTES)} MiB max).`,
  );
}

export function assertChatUploadFilesWithinClientLimits(opts: {
  pendingImages: Array<{ file: FileLike }>;
  pendingVideos: Array<{ file: FileLike }>;
  pendingAudios: Array<{ file: FileLike }>;
}): void {
  for (const pending of opts.pendingImages) {
    if (pending.file.size > ECHO_CLIENT_RAW_IMAGE_MAX_BYTES) {
      throw createChatUploadTooLargeError('image', pending.file);
    }
  }
  for (const pending of opts.pendingVideos) {
    if (pending.file.size > ECHO_CLIENT_RAW_VIDEO_MAX_BYTES) {
      throw createChatUploadTooLargeError('video', pending.file);
    }
  }
  for (const pending of opts.pendingAudios) {
    if (pending.file.size > ECHO_CLIENT_UPLOAD_MAX_BYTES) {
      throw createChatUploadTooLargeError('audio', pending.file);
    }
  }
}

export function formatChatUploadErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Failed to send message';
  const message = error.message;
  if (
    /UPLOADS_NOT_CONFIGURED|503/i.test(message) ||
    message.includes('not configured')
  ) {
    return 'File uploads are not configured on this server (object storage). Ask an admin to set ECHO_S3_* on the API.';
  }
  return message;
}
