import { config } from '../../config';
import { isEchoS3UploadConfigured } from './s3UploadPresign';
import { ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX } from './localUploadDisk';
import { mediaUrlPassesEchoPolicy } from './mediaUrlPolicy';

/** Aligned with message media URL cap for https(s) object URLs. */
export const MAX_ECHO_HTTPS_STORED_MEDIA_URL_LEN = 8192;

/** Max data URL length for profile / server branding when object storage is not configured. */
export const MAX_ECHO_DATA_URL_PROFILE_LEN = 2_000_000;

/**
 * Validates URLs persisted for avatars, banners, and server icons.
 * When S3 is configured: rejects `data:` (use presigned uploads) and requires a short https URL.
 * Optional tightening: `ECHO_MEDIA_URL_REQUIRE_HTTPS` and `ECHO_MEDIA_URL_ALLOWED_HOSTS` (see `mediaUrlPolicy.ts`).
 */
export function validateEchoStoredBrandingUrl(
  raw: string,
): { ok: true; value: string } | { ok: false } {
  const t = raw.trim();
  if (!t) return { ok: false };
  if (
    config.echoLocalUploadDir &&
    t.startsWith(ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX) &&
    !t.includes('..')
  ) {
    if (t.length > MAX_ECHO_HTTPS_STORED_MEDIA_URL_LEN) return { ok: false };
    return { ok: true, value: t };
  }
  if (isEchoS3UploadConfigured()) {
    if (t.startsWith('data:')) return { ok: false };
    // Presigned `publicUrl` uses `ECHO_S3_ENDPOINT` (e.g. MinIO) and is often `http://`, not `https://`.
    if (!t.startsWith('https://') && !t.startsWith('http://'))
      return { ok: false };
    if (t.length > MAX_ECHO_HTTPS_STORED_MEDIA_URL_LEN) return { ok: false };
    if (!mediaUrlPassesEchoPolicy(t)) return { ok: false };
    return { ok: true, value: t };
  }
  if (t.startsWith('data:')) {
    if (t.length > MAX_ECHO_DATA_URL_PROFILE_LEN) return { ok: false };
    return { ok: true, value: t };
  }
  if (t.startsWith('https://') || t.startsWith('http://')) {
    if (t.length > MAX_ECHO_HTTPS_STORED_MEDIA_URL_LEN) return { ok: false };
    if (!mediaUrlPassesEchoPolicy(t)) return { ok: false };
    return { ok: true, value: t };
  }
  return { ok: false };
}

/**
 * Guild event covers use the same storage rules as branding (presigned / local / dev data URLs).
 * Empty string clears the cover; arbitrary pasted URLs are rejected.
 */
export function validateEchoEventCoverImageUrl(
  raw: string | undefined,
): { ok: true; value: string } | { ok: false; message: string } {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return { ok: true, value: '' };
  const v = validateEchoStoredBrandingUrl(t);
  if (!v.ok) {
    return {
      ok: false,
      message:
        'Cover images must be uploaded through Echo (arbitrary image URLs are not allowed).',
    };
  }
  return { ok: true, value: v.value };
}
