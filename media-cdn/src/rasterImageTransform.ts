import sharp from 'sharp';
import {
  ECHO_MEDIA_WEBP_QUALITY,
  type MediaCdnVariantParams,
} from '../../shared/mediaCdnVariants';

export async function transformRasterVariant(
  source: Buffer,
  variant: MediaCdnVariantParams,
): Promise<Buffer> {
  let pipeline = sharp(source, { failOn: 'none' });
  if (variant.width != null) {
    pipeline = pipeline.resize({
      width: variant.width,
      height: variant.width,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  if (variant.format === 'webp' || variant.width != null) {
    return pipeline
      .webp({ quality: ECHO_MEDIA_WEBP_QUALITY, effort: 4 })
      .toBuffer();
  }
  return pipeline.toBuffer();
}
