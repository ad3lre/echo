import { ECHO_S3_PUBLIC_READ_THROUGH_PREFIX } from './echoS3ReadThrough';

/** Same-origin path for local disk upload reads (mirrors backend `localUploadDisk`). */
export const ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX = '/api/v1/echo/uploads/files/';

/** Max storage key length (aligned with S3 presign and upload read routes). */
export const ECHO_UPLOAD_STORAGE_KEY_MAX_LEN = 512;

/**
 * Reject path traversal and absolute paths before any disk or URL key use.
 * Does not validate key prefix semantics (channel membership, etc.).
 */
export function isSafeEchoUploadStorageKeyPath(key: string): boolean {
  const t = key.trim();
  if (!t || t.length > ECHO_UPLOAD_STORAGE_KEY_MAX_LEN) return false;
  if (t.includes('..') || t.startsWith('/') || t.startsWith('\\')) return false;
  if (t.toLowerCase().startsWith('data:')) return false;
  return true;
}

/** Returns trimmed key when safe, otherwise null. */
export function normalizeEchoUploadStorageKeyPath(key: string): string | null {
  const t = key.trim();
  return isSafeEchoUploadStorageKeyPath(t) ? t : null;
}

/**
 * Server icon/banner objects are world-readable (Explore directory, invite preview, OG tags).
 * Upload/write remains restricted to guild managers.
 */
export function isEchoPublicServerBrandingStorageKey(
  storageKey: string,
): boolean {
  const key = storageKey.trim();
  if (
    !key.startsWith('echo/server-icons/') &&
    !key.startsWith('echo/server-banners/')
  ) {
    return false;
  }
  const parts = key.split('/');
  return Boolean(parts[2]?.trim());
}

/** Published custom emoji objects (world-readable when served via upload GET or direct CDN). */
export function isEchoPublicEmojiCdnStorageKey(storageKey: string): boolean {
  return storageKey.trim().startsWith('echo/public-emojis/');
}

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.mkv',
  '.avi',
]);

function decodeStorageKeyPath(encodedPath: string): string | null {
  try {
    const segments = encodedPath.split('/').filter((s) => s.length > 0);
    if (!segments.length) return null;
    const decoded = segments.map((seg) => decodeURIComponent(seg)).join('/');
    return normalizeEchoUploadStorageKeyPath(decoded);
  } catch {
    return null;
  }
}

/** Remove a trailing video/media extension from a storage key path. */
export function stripExtension(storageKey: string): string {
  const trimmed = storageKey.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  const slash = trimmed.lastIndexOf('/');
  const base = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return trimmed;
  const ext = base.slice(dot).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) return trimmed;
  return trimmed.slice(0, trimmed.length - ext.length);
}

/** Live HLS pack directory prefix (no trailing filename). */
export function hlsPackPrefixForSourceKey(sourceStorageKey: string): string {
  const base = stripExtension(sourceStorageKey);
  return `${base}/hls/`;
}

export function hlsManifestStorageKeyForSourceKey(
  sourceStorageKey: string,
): string {
  return `${hlsPackPrefixForSourceKey(sourceStorageKey)}master.m3u8`;
}

/** Staging prefix for atomic publish (job-scoped). */
export function hlsStagingPrefixForSourceKey(
  sourceStorageKey: string,
  jobId: string,
): string {
  const safeJob = jobId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${hlsPackPrefixForSourceKey(sourceStorageKey)}.staging/${safeJob}/`;
}

export type ExtractStorageKeyFromEchoMediaUrlOptions = {
  /** Absolute HTTP(S) public URL prefixes for configured S3/R2 buckets. */
  httpPublicUrlPrefixes?: readonly string[];
};

/**
 * Recover storage key from a persisted Echo media URL.
 * Pass `httpPublicUrlPrefixes` from the backend when resolving direct bucket URLs.
 */
export function extractStorageKeyFromEchoMediaUrl(
  url: string,
  opts?: ExtractStorageKeyFromEchoMediaUrlOptions,
): string | null {
  const t = url.trim();
  if (!t) return null;

  if (t.startsWith('echo/') && !/^https?:\/\//i.test(t)) {
    return normalizeEchoUploadStorageKeyPath(t.replace(/^\/+/, ''));
  }

  const tryPathSuffix = (pathname: string, prefix: string): string | null => {
    if (!pathname.startsWith(prefix)) return null;
    return decodeStorageKeyPath(pathname.slice(prefix.length));
  };

  if (t.startsWith(ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX)) {
    return decodeStorageKeyPath(
      t.slice(ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX.length),
    );
  }
  if (t.startsWith(ECHO_S3_PUBLIC_READ_THROUGH_PREFIX)) {
    return decodeStorageKeyPath(
      t.slice(ECHO_S3_PUBLIC_READ_THROUGH_PREFIX.length),
    );
  }

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const fromReadThrough = tryPathSuffix(
        u.pathname,
        ECHO_S3_PUBLIC_READ_THROUGH_PREFIX,
      );
      if (fromReadThrough) return fromReadThrough;

      const fromLocal = tryPathSuffix(
        u.pathname,
        ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX,
      );
      if (fromLocal) return fromLocal;

      const barePath = u.pathname.replace(/^\/+/, '');
      if (barePath.startsWith('echo/')) {
        return normalizeEchoUploadStorageKeyPath(barePath);
      }

      if (u.hostname.toLowerCase().endsWith('.r2.dev')) {
        if (barePath.startsWith('echo/')) {
          return normalizeEchoUploadStorageKeyPath(barePath);
        }
      }

      for (const prefix of opts?.httpPublicUrlPrefixes ?? []) {
        if (!prefix.startsWith('http')) continue;
        if (t.startsWith(prefix)) {
          return decodeStorageKeyPath(t.slice(prefix.length));
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}
