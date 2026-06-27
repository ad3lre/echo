import { echoUploadMediaCrossOrigin } from '@/utils/echoUploadMediaCredentials';
import {
  getPersistentImageDimensions,
  rememberPersistentImageDimensions,
} from '@/utils/persistentImageDimsCache';

export type ImageDimensions = { width: number; height: number };

const urlCache = new Map<string, ImageDimensions>();
const inflight = new Map<string, Promise<ImageDimensions | null>>();

export function getCachedImageDimensions(url: string): ImageDimensions | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const inMemory = urlCache.get(trimmed);
  if (inMemory) return inMemory;
  // Cross-reload hit: hydrate the in-memory cache so a previously-seen image reserves
  // its exact box on the first frame after a cold load (no default-guess → shift).
  const persisted = getPersistentImageDimensions(trimmed);
  if (persisted) {
    urlCache.set(trimmed, persisted);
    return persisted;
  }
  return null;
}

export function rememberImageDimensions(
  url: string,
  dims: ImageDimensions,
): ImageDimensions {
  const trimmed = url.trim();
  if (trimmed && dims.width > 0 && dims.height > 0) {
    urlCache.set(trimmed, dims);
    rememberPersistentImageDimensions(trimmed, dims);
  }
  return dims;
}

export async function probeImageDimensionsFromFile(
  file: File,
): Promise<ImageDimensions | null> {
  try {
    const bmp = await createImageBitmap(file);
    try {
      const dims = { width: bmp.width, height: bmp.height };
      return dims.width > 0 && dims.height > 0 ? dims : null;
    } finally {
      bmp.close();
    }
  } catch {
    const blobUrl = URL.createObjectURL(file);
    try {
      return await probeImageDimensionsFromUrl(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }
}

export async function probeImageDimensionsFromUrl(
  url: string,
): Promise<ImageDimensions | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const cached = urlCache.get(trimmed);
  if (cached) return cached;

  let job = inflight.get(trimmed);
  if (!job) {
    const pending = new Promise<ImageDimensions | null>((resolve) => {
      const img = new Image();
      const crossOrigin = echoUploadMediaCrossOrigin(trimmed);
      if (crossOrigin) {
        img.crossOrigin = crossOrigin;
      }
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (width > 0 && height > 0) {
          const dims = rememberImageDimensions(trimmed, { width, height });
          resolve(dims);
          return;
        }
        resolve(null);
      };
      img.onerror = () => resolve(null);
      img.src = trimmed;
    });
    job = pending.finally(() => {
      inflight.delete(trimmed);
    });
    inflight.set(trimmed, job);
  }
  return job;
}
