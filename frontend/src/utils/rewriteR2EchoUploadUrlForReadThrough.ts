import { API_BASE } from '@/config';
import { ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX } from '@shared/echoEmojiCdn';
import { ECHO_S3_PUBLIC_READ_THROUGH_PREFIX } from '@shared/echoS3ReadThrough';

function absolutizeApiPath(path: string): string {
  const p = path.trim();
  if (!p.startsWith('/')) return p;
  try {
    return new URL(p, `${API_BASE.replace(/\/$/, '')}/`).href;
  } catch {
    return p;
  }
}

function encodeStoragePathSegments(decodedPath: string): string {
  return decodedPath
    .split('/')
    .map((seg) => {
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch {
        return encodeURIComponent(seg);
      }
    })
    .join('/');
}

/**
 * Map public `*.r2.dev/echo/...` URLs to the API read-through path so `fetch` / canvas can read bytes
 * with session cookies (no R2 GET CORS). Idempotent when already read-through or non-R2.
 */
export function rewriteR2EchoUploadUrlForReadThrough(url: string): string {
  const t = url.trim();
  if (!t || t.startsWith('data:') || t.startsWith('blob:')) return t;

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      if (u.pathname.startsWith(ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX)) {
        return t;
      }
      if (u.pathname.startsWith(ECHO_S3_PUBLIC_READ_THROUGH_PREFIX)) {
        return new URL(
          `${u.pathname}${u.search}${u.hash}`,
          `${API_BASE.replace(/\/$/, '')}/`,
        ).href;
      }
    } catch {
      /* fall through */
    }
  }

  if (t.startsWith(ECHO_S3_PUBLIC_READ_THROUGH_PREFIX)) {
    return absolutizeApiPath(t);
  }
  if (t.startsWith('/api/v1/echo/uploads/files/')) {
    return absolutizeApiPath(t);
  }
  if (t.startsWith(ECHO_PUBLIC_EMOJI_CDN_PATH_PREFIX)) {
    return absolutizeApiPath(t);
  }
  if (t.startsWith('/api/v1/echo/emoji/')) {
    return absolutizeApiPath(t);
  }

  if (!/^https?:\/\//i.test(t)) {
    return t.startsWith('/') ? absolutizeApiPath(t) : t;
  }

  try {
    const u = new URL(t);
    if (!u.hostname.toLowerCase().endsWith('.r2.dev')) return t;
    const path = u.pathname.replace(/^\/+/, '');
    if (!path.startsWith('echo/')) return t;
    const encoded = encodeStoragePathSegments(path);
    const rel = `${ECHO_S3_PUBLIC_READ_THROUGH_PREFIX}${encoded}`;
    return new URL(rel, `${API_BASE.replace(/\/$/, '')}/`).href;
  } catch {
    return t;
  }
}
