/**
 * Chat attachment classification for uploads and the composer.
 * Mirrors backend `CHAT_UPLOAD_CONTENT_TYPES` in `s3UploadPresign.ts` (video MIME subset).
 *
 * iOS Safari often leaves `File.type` empty for Photos / Voice Memos picks — use filename
 * fallbacks so files are not silently dropped.
 */

/** Exact video MIME types allowed for chat (must match backend). */
const CHAT_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

/** When `type` is missing, infer from extension (iOS Safari). */
const VIDEO_EXT_RE = /\.(mp4|webm|mov)$/i;

const AUDIO_EXT_RE = /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i;

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tif|tiff)$/i;

/** Exact document MIME types allowed for chat (must match backend `CHAT_UPLOAD_CONTENT_TYPES`). */
const CHAT_DOCUMENT_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const DOC_EXT_RE = /\.(pdf|docx?)$/i;

const LOOSE_TYPE = (t: string) => !t || t === 'application/octet-stream';

export function isChatVideoUpload(file: File): boolean {
  const t = (file.type || '').trim().toLowerCase();
  if (CHAT_VIDEO_MIME.has(t)) return true;
  if (LOOSE_TYPE(t)) {
    return VIDEO_EXT_RE.test(file.name || '');
  }
  return false;
}

export function isChatAudioUpload(file: File): boolean {
  const t = (file.type || '').trim().toLowerCase();
  if (t.startsWith('audio/')) return true;
  if (LOOSE_TYPE(t)) {
    return AUDIO_EXT_RE.test(file.name || '');
  }
  return false;
}

export function isChatDocumentUpload(file: File): boolean {
  const t = (file.type || '').trim().toLowerCase();
  if (CHAT_DOCUMENT_MIME.has(t)) return true;
  // Extend extension-based fallback to any application/* type (e.g. application/x-pdf,
  // application/zip reported for .docx on some systems) in addition to empty / octet-stream.
  if (LOOSE_TYPE(t) || t.startsWith('application/')) {
    return DOC_EXT_RE.test(file.name || '');
  }
  return false;
}

/**
 * Presign `Content-Type` for PDF / Word when the browser leaves `file.type` empty.
 */
export function chatDocumentContentTypeForPresign(file: File): string {
  const t = (file.type || '').trim().toLowerCase();
  if (CHAT_DOCUMENT_MIME.has(t)) return t;
  const name = file.name || '';
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.docx$/i.test(name)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (/\.doc$/i.test(name)) return 'application/msword';
  return 'application/pdf';
}

export type ChatPendingMediaKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'unknown';

/**
 * Classify a file for pending previews (composer). Video before audio so `.mp4` with no
 * type maps to video.
 */
export function isChatImageUpload(file: File): boolean {
  const t = (file.type || '').trim().toLowerCase();
  if (t.startsWith('image/')) return true;
  if (LOOSE_TYPE(t) && IMAGE_EXT_RE.test(file.name || '')) {
    return true;
  }
  return false;
}

export function inferChatPendingMediaKind(file: File): ChatPendingMediaKind {
  if (isChatVideoUpload(file)) return 'video';
  if (isChatDocumentUpload(file)) return 'document';
  if (isChatAudioUpload(file)) return 'audio';
  if (isChatImageUpload(file)) return 'image';
  return 'unknown';
}

/**
 * Presign requires an allowed `Content-Type`. When iOS leaves `file.type` empty, map from
 * the filename so the server accepts the upload (see `CHAT_UPLOAD_CONTENT_TYPES`).
 */
export function chatAudioContentTypeForPresign(file: File): string {
  const t = (file.type || '').trim().toLowerCase();
  if (t.startsWith('audio/')) return t;
  const name = file.name || '';
  if (/\.m4a$/i.test(name)) return 'audio/mp4';
  if (/\.mp3$/i.test(name)) return 'audio/mpeg';
  if (/\.aac$/i.test(name)) return 'audio/aac';
  if (/\.wav$/i.test(name)) return 'audio/wav';
  if (/\.ogg$/i.test(name) || /\.opus$/i.test(name)) return 'audio/ogg';
  if (/\.flac$/i.test(name)) return 'audio/flac';
  return 'audio/mpeg';
}

/** When `file.type` is empty, map extensions to allowed chat video MIME types. */
export function chatVideoContentTypeForPresign(file: File): string {
  const t = (file.type || '').trim().toLowerCase();
  if (CHAT_VIDEO_MIME.has(t)) return t;
  if (t.startsWith('video/')) return t;
  const name = file.name || '';
  if (/\.mp4$/i.test(name)) return 'video/mp4';
  if (/\.webm$/i.test(name)) return 'video/webm';
  if (/\.mov$/i.test(name)) return 'video/quicktime';
  return 'video/mp4';
}

/** When `file.type` is empty, map extensions to allowed chat image MIME types. */
export function chatImageContentTypeForPresign(file: File): string {
  const t = (file.type || '').trim().toLowerCase();
  if (t.startsWith('image/')) return t;
  const name = file.name || '';
  if (/\.(jpe?g)$/i.test(name)) return 'image/jpeg';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.gif$/i.test(name)) return 'image/gif';
  if (/\.webp$/i.test(name)) return 'image/webp';
  if (/\.(heic|heif)$/i.test(name)) return 'image/heic';
  if (/\.bmp$/i.test(name)) return 'image/bmp';
  if (/\.(tif|tiff)$/i.test(name)) return 'image/tiff';
  return 'image/jpeg';
}

/**
 * Resolves presign `Content-Type` and dedupe `kind` for chat media (handles iOS empty MIME).
 */
export function resolveChatUploadContentTypeAndKind(prepared: File): {
  contentType: string;
  kind: 'image' | 'video';
} {
  const raw = (prepared.type || '').trim();
  const lower = raw.toLowerCase();
  const videoish = isChatVideoUpload(prepared) || lower.startsWith('video/');
  if (videoish) {
    const ct =
      raw && raw !== 'application/octet-stream'
        ? raw
        : chatVideoContentTypeForPresign(prepared);
    return { contentType: ct, kind: 'video' };
  }
  const ct =
    raw && raw !== 'application/octet-stream'
      ? raw
      : chatImageContentTypeForPresign(prepared);
  return { contentType: ct, kind: 'image' };
}
