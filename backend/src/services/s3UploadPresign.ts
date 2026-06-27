import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { ECHO_UPLOAD_ABS_MAX_BYTES } from '../../../shared/echoPlanLimits';
import { ECHO_S3_PUBLIC_READ_THROUGH_PREFIX } from '../../../shared/echoS3ReadThrough';
import {
  buildMediaCdnObjectUrl,
  ECHO_MEDIA_CDN_OBJECT_PREFIX,
} from '../../../shared/mediaCdn';
import { isSafeEchoUploadStorageKeyPath } from '../../../shared/echoUploadStorageKey';
import { sanitizeEchoUploadContentType } from './echoUploadContentTypePolicy';
import { echoUploadPrefersS3ObjectStore } from './echoUploadObjectBackend';
import { ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX } from './localUploadDisk';

/**
 * Historical default for routes that do not yet resolve per-user caps (tests, legacy callers).
 * Real presign uses the caller’s effective tier limit (≤ {@link ECHO_UPLOAD_ABS_MAX_BYTES}).
 */
export const ECHO_UPLOAD_MAX_BYTES = ECHO_UPLOAD_ABS_MAX_BYTES;

const CHAT_UPLOAD_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  /** iPhone camera originals; clients may transcode to WebP before upload. */
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  /** Common for `.m4a` / Voice Memos on iOS Safari. */
  'audio/x-m4a',
  'audio/flac',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const EMOJI_UPLOAD_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** Avatars, profile banners, server icon/banner uploads (images only). */
const BRANDING_UPLOAD_CONTENT_TYPES = EMOJI_UPLOAD_CONTENT_TYPES;

export function isEchoS3UploadConfigured(): boolean {
  return !!(
    config.s3UploadBucket &&
    config.s3UploadRegion &&
    config.s3UploadAccessKey &&
    config.s3UploadSecretKey
  );
}

/** Shared client for presign, background video optimize, etc. */
export function createEchoS3UploadClient(): S3Client | null {
  const {
    s3UploadBucket: bucket,
    s3UploadRegion: region,
    s3UploadAccessKey: accessKeyId,
    s3UploadSecretKey: secretAccessKey,
    s3UploadEndpoint: endpoint,
  } = config;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: !!endpoint,
    /**
     * Default `WHEN_SUPPORTED` injects checksum query params (`x-amz-checksum-*`) into presigned
     * PutObject URLs. Browser PUTs then hit stricter CORS / preflight requirements on R2/S3; SPA
     * uploads surface as XHR “network” errors. PutObject only needs a checksum when required.
     */
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
}

export function getEchoS3UploadBucket(): string | null {
  return config.s3UploadBucket?.trim() || null;
}

function absoluteEchoS3PublicReadThroughBase(): string {
  const base = config.echoApiPublicUrl.replace(/\/$/, '');
  try {
    return new URL(ECHO_S3_PUBLIC_READ_THROUGH_PREFIX, `${base}/`).href;
  } catch {
    return ECHO_S3_PUBLIC_READ_THROUGH_PREFIX;
  }
}

function isEchoMediaCdnConfigured(): boolean {
  return !!(
    config.echoMediaCdnEnabled &&
    config.echoMediaCdnBaseUrl?.trim() &&
    config.echoMediaCdnSigningSecret.trim()
  );
}

function buildCanonicalMediaCdnUrlForStorageKey(key: string): string | null {
  const base = config.echoMediaCdnBaseUrl?.trim();
  if (!isEchoMediaCdnConfigured() || !base) return null;
  return buildMediaCdnObjectUrl(base, key);
}

/** Public URL prefixes for objects in the configured bucket (for validating message / emoji URLs when S3 is on). */
export function getEchoUploadPublicUrlPrefixes(): string[] {
  const out: string[] = [];
  const mediaCdnBase = config.echoMediaCdnBaseUrl?.trim();
  if (isEchoMediaCdnConfigured() && mediaCdnBase) {
    out.push(`${mediaCdnBase}${ECHO_MEDIA_CDN_OBJECT_PREFIX}`);
    out.push(`${mediaCdnBase}/`);
  }
  if (config.echoLocalUploadDir) {
    out.push(ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX);
  }
  if (config.echoS3PublicReadThroughApi && isEchoS3UploadConfigured()) {
    out.push(absoluteEchoS3PublicReadThroughBase());
    out.push(ECHO_S3_PUBLIC_READ_THROUGH_PREFIX);
  }
  const bucket = config.s3UploadBucket;
  const region = config.s3UploadRegion;
  const endpoint = config.s3UploadEndpoint;
  const publicBase = config.s3UploadPublicBaseUrl?.trim();
  if (publicBase) {
    out.push(`${publicBase.replace(/\/$/, '')}/`);
  }
  if (!bucket || !region) return out;
  if (endpoint) {
    const base = endpoint.replace(/\/$/, '');
    out.push(`${base}/${bucket}/`);
    return out;
  }
  out.push(`https://${bucket}.s3.${region}.amazonaws.com/`);
  return out;
}

export function buildEchoUploadPublicUrlForStorageKey(
  key: string,
): string | null {
  const trimmedKey = key.trim();
  if (!trimmedKey) return null;
  const mediaCdnUrl = buildCanonicalMediaCdnUrlForStorageKey(trimmedKey);
  if (mediaCdnUrl) return mediaCdnUrl;
  if (echoUploadPrefersS3ObjectStore(trimmedKey)) {
    if (config.echoS3PublicReadThroughApi && isEchoS3UploadConfigured()) {
      const encoded = trimmedKey.split('/').map(encodeURIComponent).join('/');
      return `${absoluteEchoS3PublicReadThroughBase()}${encoded}`;
    }
    const bucket = config.s3UploadBucket;
    const region = config.s3UploadRegion;
    if (!bucket || !region) return null;
    return buildPublicUrlForStorageKey(
      trimmedKey,
      bucket,
      region,
      config.s3UploadEndpoint ?? null,
    );
  }
  if (config.echoLocalUploadDir) {
    return `${ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX}${trimmedKey.split('/').map(encodeURIComponent).join('/')}`;
  }
  if (config.echoS3PublicReadThroughApi && isEchoS3UploadConfigured()) {
    const encoded = trimmedKey.split('/').map(encodeURIComponent).join('/');
    return `${absoluteEchoS3PublicReadThroughBase()}${encoded}`;
  }
  const bucket = config.s3UploadBucket;
  const region = config.s3UploadRegion;
  if (!bucket || !region) return null;
  return buildPublicUrlForStorageKey(
    trimmedKey,
    bucket,
    region,
    config.s3UploadEndpoint ?? null,
  );
}

export function isAllowedChatUploadContentType(contentType: string): boolean {
  const t = contentType.trim().toLowerCase();
  if (CHAT_UPLOAD_CONTENT_TYPES.has(t)) return true;
  const { contentType: safe, coerced } = sanitizeEchoUploadContentType(t);
  if (coerced) return false;
  return /^(image|video|audio)\//.test(safe);
}

const VC_WATCH_TOGETHER_VIDEO_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
]);

/** Guild VC Watch Together uploads (MKV and common containers; transcoded to HLS). */
export function isAllowedVcWatchTogetherUploadContentType(
  contentType: string,
): boolean {
  const t = contentType.trim().toLowerCase();
  return VC_WATCH_TOGETHER_VIDEO_CONTENT_TYPES.has(t);
}

export function isAllowedEmojiUploadContentType(contentType: string): boolean {
  const t = contentType.trim().toLowerCase();
  return EMOJI_UPLOAD_CONTENT_TYPES.has(t);
}

export function isAllowedBrandingUploadContentType(
  contentType: string,
): boolean {
  const t = contentType.trim().toLowerCase();
  return BRANDING_UPLOAD_CONTENT_TYPES.has(t);
}

/** Custom call ringtone uploads (audio only). */
export function isAllowedRingtoneUploadContentType(
  contentType: string,
): boolean {
  const t = contentType.trim().toLowerCase();
  if (!t.startsWith('audio/')) return false;
  return CHAT_UPLOAD_CONTENT_TYPES.has(t);
}

export type PresignResult =
  | {
      ok: true;
      uploadUrl: string;
      publicUrl: string;
      key: string;
      headers: Record<string, string>;
    }
  | { ok: false; reason: 'NOT_CONFIGURED' | 'INVALID_BODY' };

/**
 * Browser-visible URL for an object key. When `ECHO_S3_PUBLIC_BASE_URL` is set (e.g. R2 `*.r2.dev`),
 * use that host — it maps to the bucket without a `/bucket/` segment. Otherwise use S3 path/virtual style.
 */
function buildPublicUrlForStorageKey(
  key: string,
  bucket: string,
  region: string,
  endpoint: string | null,
): string {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const publicBase = config.s3UploadPublicBaseUrl?.trim();
  if (publicBase) {
    return `${publicBase.replace(/\/$/, '')}/${encodedKey}`;
  }
  if (endpoint) {
    const base = endpoint.replace(/\/$/, '');
    return `${base}/${bucket}/${encodedKey}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

export async function presignEchoUpload(opts: {
  key: string;
  contentType: string;
  contentLength: number;
  /** Single-file cap for this user (S3); must be ≤ {@link ECHO_UPLOAD_ABS_MAX_BYTES}. */
  maxBytes: number;
}): Promise<PresignResult> {
  const {
    s3UploadBucket: bucket,
    s3UploadRegion: region,
    s3UploadAccessKey: accessKeyId,
    s3UploadSecretKey: secretAccessKey,
    s3UploadEndpoint: endpoint,
  } = config;

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    return { ok: false, reason: 'NOT_CONFIGURED' };
  }

  // data: URLs are rejected when S3 is configured to force object storage usage
  if (opts.key.toLowerCase().startsWith('data:')) {
    return { ok: false, reason: 'INVALID_BODY' };
  }

  const key = opts.key.trim();
  if (!isSafeEchoUploadStorageKeyPath(key)) {
    return { ok: false, reason: 'INVALID_BODY' };
  }
  const contentType = opts.contentType.trim();
  if (!contentType || contentType.length > 128) {
    return { ok: false, reason: 'INVALID_BODY' };
  }
  const cap =
    Number.isFinite(opts.maxBytes) && opts.maxBytes >= 1
      ? Math.min(Math.floor(opts.maxBytes), ECHO_UPLOAD_ABS_MAX_BYTES)
      : ECHO_UPLOAD_ABS_MAX_BYTES;
  if (
    !Number.isFinite(opts.contentLength) ||
    opts.contentLength < 1 ||
    opts.contentLength > cap
  ) {
    return { ok: false, reason: 'INVALID_BODY' };
  }

  const client = createEchoS3UploadClient();
  if (!client) {
    return { ok: false, reason: 'NOT_CONFIGURED' };
  }

  /** Bind declared size in the signature so clients cannot PUT a mismatched Content-Length. */
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: Math.floor(opts.contentLength),
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });
  const publicUrl =
    buildEchoUploadPublicUrlForStorageKey(key) ??
    buildPublicUrlForStorageKey(key, bucket, region, endpoint);

  return {
    ok: true,
    uploadUrl,
    publicUrl,
    key,
    headers: {
      'Content-Type': contentType,
    },
  };
}
