import { inferChatPendingMediaKind } from '@/utils/chatUploadMediaTypes';

export function extractMediaFilesFromClipboard(event: ClipboardEvent): File[] {
  const dt = event.clipboardData;
  if (!dt?.files?.length) return [];
  return Array.from(dt.files).filter(
    (file) => inferChatPendingMediaKind(file) !== 'unknown',
  );
}
