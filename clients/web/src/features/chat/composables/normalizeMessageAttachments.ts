import type { MessageAttachmentPayload } from '@shared/types';

export function inferAttachmentKind(a: {
  mimeType?: string;
  filename?: string;
}): MessageAttachmentPayload['kind'] {
  const mime = (a.mimeType ?? '').toLowerCase();
  const name = (a.filename ?? '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'document';
  if (
    mime === 'application/msword' ||
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.doc') ||
    name.endsWith('.docx')
  ) {
    return 'document';
  }
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'image/gif' || name.endsWith('.gif')) return 'gif';
  return 'image';
}

/** Ensures each attachment has `kind` required by `MessageAttachmentPayload`. */
export function normalizeMessageAttachments(
  attachments:
    | MessageAttachmentPayload[]
    | Array<{
        url: string;
        filename?: string;
        mimeType?: string;
        kind?: MessageAttachmentPayload['kind'];
        fileSize?: number;
        width?: number;
        height?: number;
      }>
    | undefined,
): MessageAttachmentPayload[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((a) => ({
    url: a.url,
    kind: 'kind' in a && a.kind ? a.kind : inferAttachmentKind(a),
    filename: a.filename,
    mimeType: a.mimeType,
    ...('fileSize' in a &&
    typeof (a as { fileSize?: unknown }).fileSize === 'number' &&
    Number.isFinite((a as { fileSize: number }).fileSize) &&
    (a as { fileSize: number }).fileSize >= 0
      ? { fileSize: Math.floor((a as { fileSize: number }).fileSize) }
      : {}),
    ...('width' in a && typeof a.width === 'number' ? { width: a.width } : {}),
    ...('height' in a && typeof a.height === 'number'
      ? { height: a.height }
      : {}),
    ...('spoiler' in a && typeof a.spoiler === 'boolean'
      ? { spoiler: a.spoiler }
      : {}),
  }));
}
