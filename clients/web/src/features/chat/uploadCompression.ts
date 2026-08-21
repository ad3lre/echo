import imageCompression from 'browser-image-compression';
import type { Options as ImageCompressionOptions } from 'browser-image-compression';
/** Self-hosted worker bundle (default library URL is jsDelivr CDN). */
import imageCompressionWorkerUrl from 'browser-image-compression/dist/browser-image-compression.js?url';

/**
 * Client-side raster image compression before presigned uploads.
 * Non-GIF rasters are re-encoded to WebP (alpha preserved). GIF is unchanged.
 */
export type EchoUploadImagePreset = 'chat' | 'avatar' | 'banner' | 'bug_report';

const WEBP_TYPE = 'image/webp';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function isHeicLikeFile(file: File): boolean {
  const t = (file.type || '').trim().toLowerCase();
  if (t === 'image/heic' || t === 'image/heif') return true;
  return /\.(heic|heif)$/i.test(file.name || '');
}

/**
 * When WebKit can decode HEIC (typical on iPhone Safari), re-encode to WebP so other
 * browsers can display the attachment; if decode fails, return the original file.
 */
async function tryConvertHeicLikeToWebp(file: File): Promise<File> {
  if (!isHeicLikeFile(file)) return file;
  try {
    const bmp = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bmp, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), WEBP_TYPE, 0.92);
      });
      if (!blob || blob.size < 1) return file;
      const base = file.name.replace(/\.[^.]+$/i, '').trim() || 'upload';
      return new File([blob], `${base}.webp`, {
        type: WEBP_TYPE,
        lastModified: file.lastModified,
      });
    } finally {
      bmp.close();
    }
  } catch {
    return file;
  }
}

const WORKER_LIB_URL = imageCompressionWorkerUrl;

const PRESET_OPTIONS: Record<EchoUploadImagePreset, ImageCompressionOptions> = {
  chat: {
    maxSizeMB: 2.5,
    maxWidthOrHeight: 2560,
    useWebWorker: true,
    libURL: WORKER_LIB_URL,
    initialQuality: 0.82,
    fileType: WEBP_TYPE,
  },
  avatar: {
    maxSizeMB: 1,
    maxWidthOrHeight: 512,
    useWebWorker: true,
    libURL: WORKER_LIB_URL,
    initialQuality: 0.85,
    fileType: WEBP_TYPE,
  },
  banner: {
    maxSizeMB: 3,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    initialQuality: 0.82,
    fileType: WEBP_TYPE,
  },
  bug_report: {
    maxSizeMB: 2,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    libURL: WORKER_LIB_URL,
    initialQuality: 0.82,
    fileType: WEBP_TYPE,
  },
};

export function isCompressibleRasterImage(file: File): boolean {
  const t = (file.type || '').trim().toLowerCase();
  return t === 'image/jpeg' || t === 'image/png' || t === 'image/webp';
}

/** Align filename extension with `file.type` after re-encoding. */
export function renameFileToMatchMime(file: File): File {
  const ext = MIME_TO_EXT[file.type.trim().toLowerCase()];
  if (!ext) return file;
  const base = file.name.replace(/\.[^.]+$/i, '').trim() || 'upload';
  const cur = file.name.match(/\.([^.]+)$/i)?.[1]?.toLowerCase();
  if (cur === ext) return file;
  return new File([file], `${base}.${ext}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export async function compressFileForEchoUpload(
  file: File,
  preset: EchoUploadImagePreset,
): Promise<File> {
  const afterHeic = await tryConvertHeicLikeToWebp(file);
  if (!isCompressibleRasterImage(afterHeic)) {
    return afterHeic;
  }
  try {
    const opts = PRESET_OPTIONS[preset];
    const out = await imageCompression(afterHeic, opts);
    return renameFileToMatchMime(out);
  } catch {
    return afterHeic;
  }
}
