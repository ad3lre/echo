import { extractMediaFilesFromClipboard } from '@/features/chat/composables/useClipboardMedia';
import { inferChatPendingMediaKind } from '@/utils/chatUploadMediaTypes';
import { isTrustedMediaUrl } from '@/utils/safeImageUrl';

export type PaperClipboardImagePayload =
  | { kind: 'file'; file: File }
  | { kind: 'dataUrl'; dataUrl: string }
  | { kind: 'url'; url: string };

/** First `<img src>` in pasted HTML, if any (regex to avoid DOMParser XSS surface). */
export function extractImageSrcFromClipboardHtml(html: string): string | null {
  const trimmed = html.trim();
  if (!trimmed) return null;
  const match = /<img\s[^>]*?\bsrc\s*=\s*"([^"]+)"/i.exec(trimmed);
  if (match?.[1]) return match[1].trim() || null;
  const matchSingle = /<img\s[^>]*?\bsrc\s*=\s*'([^']+)'/i.exec(trimmed);
  if (matchSingle?.[1]) return matchSingle[1].trim() || null;
  return null;
}

/** Decode a raster `data:image/...;base64,...` URL into a File for upload. */
export function dataUrlToImageFile(dataUrl: string): File | null {
  const match = /^data:(image\/[\w+.-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    const mime = match[1].toLowerCase();
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const subtype = mime.split('/')[1]?.split('+')[0] ?? 'png';
    const ext = subtype === 'jpeg' ? 'jpg' : subtype;
    return new File([bytes], `pasted-image.${ext}`, {
      type: mime,
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

/**
 * Resolve a pasted image from clipboard file items or HTML `<img>` tags (data URLs / http URLs).
 * Prefers native file items when present (screenshots, copied files).
 */
export function extractPaperClipboardImage(
  event: ClipboardEvent,
): PaperClipboardImagePayload | null {
  const imageFiles = extractMediaFilesFromClipboard(event).filter(
    (file) => inferChatPendingMediaKind(file) === 'image',
  );
  const file = imageFiles[0];
  if (file) return { kind: 'file', file };

  const dt = event.clipboardData;
  if (!dt) return null;

  const html = dt.getData('text/html');
  const src = html ? extractImageSrcFromClipboardHtml(html) : null;
  if (!src) return null;

  if (/^data:image\//i.test(src)) {
    return { kind: 'dataUrl', dataUrl: src };
  }
  if (isTrustedMediaUrl(src)) {
    return { kind: 'url', url: src };
  }
  return null;
}
