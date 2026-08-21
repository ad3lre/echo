import sharp from 'sharp';
import {
  ECHO_MEDIA_UPLOAD_MAX_DIMENSION,
  ECHO_MEDIA_WEBP_QUALITY,
  extForRasterContentType,
  isRasterImageContentType,
} from '../../../../../contracts/mediaCdnVariants';

export type PrepareRasterForEchoStorageResult = {
  buf: Buffer;
  contentType: string;
  ext: string;
  width?: number;
  height?: number;
  transcoded: boolean;
};

/**
 * Re-encode non-GIF rasters to WebP and downscale to `maxDimension` before storage.
 * GIFs and unsupported types pass through unchanged.
 */
export async function prepareRasterForEchoStorage(
  buf: Buffer,
  contentType: string,
  opts?: { maxDimension?: number; quality?: number },
): Promise<PrepareRasterForEchoStorageResult> {
  const ct = contentType.trim().toLowerCase();
  const ext = extForRasterContentType(ct);
  if (!isRasterImageContentType(ct)) {
    return { buf, contentType: ct, ext, transcoded: false };
  }

  const maxDimension = opts?.maxDimension ?? ECHO_MEDIA_UPLOAD_MAX_DIMENSION;
  const quality = opts?.quality ?? ECHO_MEDIA_WEBP_QUALITY;

  try {
    const meta = await sharp(buf, { failOn: 'none' }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const needsResize = width > maxDimension || height > maxDimension;
    const needsTranscode = ct !== 'image/webp' || needsResize;

    if (!needsTranscode) {
      return {
        buf,
        contentType: ct,
        ext: '.webp',
        ...(width > 0 && height > 0 ? { width, height } : {}),
        transcoded: false,
      };
    }

    let pipeline = sharp(buf, { failOn: 'none' });
    if (needsResize) {
      pipeline = pipeline.resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const out = await pipeline.webp({ quality, effort: 4 }).toBuffer();
    const outMeta = await sharp(out).metadata();
    return {
      buf: out,
      contentType: 'image/webp',
      ext: '.webp',
      ...(outMeta.width && outMeta.height
        ? { width: outMeta.width, height: outMeta.height }
        : {}),
      transcoded: true,
    };
  } catch {
    return { buf, contentType: ct, ext, transcoded: false };
  }
}
