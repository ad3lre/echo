import type { MessageAttachmentPayload } from '@shared/types';

function filename(att: MessageAttachmentPayload): string {
  return (att.filename ?? '').toLowerCase();
}

function mime(att: MessageAttachmentPayload): string {
  return (att.mimeType ?? '').toLowerCase();
}

export function isPdfAttachment(att: MessageAttachmentPayload): boolean {
  const m = mime(att);
  if (m === 'application/pdf' || m === 'application/x-pdf') return true;
  return filename(att).endsWith('.pdf');
}

export function isDocxAttachment(att: MessageAttachmentPayload): boolean {
  const m = mime(att);
  if (
    m ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    (m === 'application/zip' && filename(att).endsWith('.docx'))
  ) {
    return true;
  }
  return filename(att).endsWith('.docx');
}

/** Legacy Word `.doc` (not supported by in-app preview). */
export function isLegacyDocAttachment(att: MessageAttachmentPayload): boolean {
  const m = mime(att);
  if (m === 'application/msword') return true;
  const n = filename(att);
  return n.endsWith('.doc') && !n.endsWith('.docx');
}
