import type { MessageAttachmentPayload } from '@shared/types';

export function inferAttachmentKind(a: {
  mimeType?: string;
  filename?: string;
}): MessageAttachmentPayload['kind'] {
  const mime = (a.mimeType ?? '').toLowerCase();
  const name = (a.filename ?? '').toLowerCase();
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
    ...('width' in a && typeof a.width === 'number' ? { width: a.width } : {}),
    ...('height' in a && typeof a.height === 'number'
      ? { height: a.height }
      : {}),
    ...('spoiler' in a && typeof a.spoiler === 'boolean'
      ? { spoiler: a.spoiler }
      : {}),
  }));
}
