import { API_BASE } from '@/config';
import { ECHO_S3_PUBLIC_READ_THROUGH_PREFIX } from '@shared/echoS3ReadThrough';
import { ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX } from '@shared/echoUploadStorageKey';

function pathnameOf(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  try {
    const base =
      typeof window !== 'undefined'
        ? window.location.origin
        : `${API_BASE.replace(/\/$/, '')}/`;
    return new URL(t, base).pathname;
  } catch {
    return null;
  }
}

/** True when GET requires the Echo session cookie (local disk or S3 read-through routes). */
export function isEchoAuthenticatedUploadMediaUrl(
  url: string | undefined | null,
): boolean {
  const t = url?.trim();
  if (!t) return false;
  if (
    t.startsWith(ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX) ||
    t.startsWith(ECHO_S3_PUBLIC_READ_THROUGH_PREFIX)
  ) {
    return true;
  }
  const path = pathnameOf(t);
  if (!path) return false;
  return (
    path.startsWith(ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX) ||
    path.startsWith(ECHO_S3_PUBLIC_READ_THROUGH_PREFIX)
  );
}

/**
 * CORS mode for `<video>` / hls.js when loading authenticated upload bytes.
 * Omit for public CDN URLs (e.g. presigned or raw `*.r2.dev` without read-through).
 */
export function echoUploadMediaCrossOrigin(
  url: string | undefined | null,
): 'use-credentials' | null {
  return isEchoAuthenticatedUploadMediaUrl(url) ? 'use-credentials' : null;
}

/** Apply before setting `HTMLMediaElement.src` or attaching hls.js. */
export function applyEchoUploadMediaCrossOrigin(
  el: HTMLMediaElement,
  url: string | undefined | null,
): void {
  const mode = echoUploadMediaCrossOrigin(url);
  if (mode) {
    el.crossOrigin = mode;
  } else {
    el.removeAttribute('crossorigin');
  }
}
