import { inferChatPendingMediaKind } from '@/features/chat/chatUploadMediaTypes';

/**
 * Clipboard paste can expose live File handles (often all named "image.png") that
 * disagree with what was shown at paste time on Chromium when the OS clipboard
 * is overwritten. Snapshot bytes immediately via Blob#slice into a fresh File.
 */
export function snapshotClipboardFile(file: File, typeHint?: string): File {
  const mime =
    (typeHint || file.type || 'application/octet-stream').trim() ||
    'application/octet-stream';
  const blob = file.slice(0, file.size, mime);
  const extFromMime =
    mime
      .split('/')[1]
      ?.split('+')[0]
      ?.replace(/[^a-z0-9]/gi, '') || 'bin';
  const baseName = file.name?.trim() || `clipboard.${extFromMime}`;
  const hasExt = /\.[^./\\]+$/.test(baseName);
  const name = hasExt ? baseName : `${baseName}.${extFromMime}`;
  return new File([blob], name, {
    type: mime,
    lastModified: Date.now(),
  });
}

export function extractMediaFilesFromClipboard(event: ClipboardEvent): File[] {
  const dt = event.clipboardData;
  if (!dt) return [];

  const out: File[] = [];

  const items = dt.items;
  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || item.kind !== 'file') continue;
      const raw = item.getAsFile();
      if (!raw) continue;
      const snap = snapshotClipboardFile(raw, item.type);
      if (inferChatPendingMediaKind(snap) === 'unknown') continue;
      out.push(snap);
    }
    if (out.length > 0) return out;
  }

  if (dt.files?.length) {
    for (const raw of Array.from(dt.files)) {
      const snap = snapshotClipboardFile(raw);
      if (inferChatPendingMediaKind(snap) === 'unknown') continue;
      out.push(snap);
    }
  }

  return out;
}
