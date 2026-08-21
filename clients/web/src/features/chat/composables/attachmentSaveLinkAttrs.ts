/**
 * Attributes for chat "Save" / "Download" links on attachments.
 *
 * For cross-origin URLs (Discord CDN, public R2/S3, etc.) the HTML `download` attribute is ignored;
 * the browser follows the link in the **current tab**, leaving the SPA. The URL path often ends in
 * a numeric id (e.g. Discord message snowflake) with no extension — refreshing that tab looks like
 * "Echo keeps downloading random numbered files" while the API is down or after a failed session.
 *
 * Same-origin **`/api/*`** and **`/socket.io*`** are treated like cross-origin: no `download`
 * attribute and **`target="_blank"`**, so a failed presign/GET (HTML/JSON error, gateway body) does
 * not replace the SPA tab or surface as a bogus file download (e.g. a host-shaped filename) when
 * Echo is partially down.
 *
 * Opening cross-origin saves in a new tab keeps Echo loaded; other same-origin URLs keep `download`
 * with a safe filename hint.
 */
export function sanitizeAttachmentDownloadFilename(raw: string): string {
  const t = raw.trim().replace(/[/\\]/g, '_');
  if (!t) return 'download';
  return t.length > 200 ? t.slice(0, 200) : t;
}

function sameOriginApiOrSocketPath(resolved: URL): boolean {
  const p = resolved.pathname;
  if (p.startsWith('/api/')) return true;
  if (p === '/socket.io' || p.startsWith('/socket.io/')) return true;
  return false;
}

export function attachmentSaveLinkAttrs(
  url: string,
  filenameForDownload: string,
): {
  download: string | undefined;
  target: '_blank' | undefined;
  rel: string | undefined;
} {
  const safeName = sanitizeAttachmentDownloadFilename(filenameForDownload);
  if (typeof window === 'undefined') {
    return { download: safeName, target: undefined, rel: undefined };
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return { download: safeName, target: undefined, rel: undefined };
  }
  let resolved: URL | null = null;
  let sameOrigin = false;
  try {
    resolved = new URL(trimmed, window.location.href);
    sameOrigin = resolved.origin === window.location.origin;
  } catch {
    /* invalid URL — treat as cross-origin */
  }
  if (sameOrigin && resolved && sameOriginApiOrSocketPath(resolved)) {
    return {
      download: undefined,
      target: '_blank',
      rel: 'noopener noreferrer',
    };
  }
  if (sameOrigin) {
    return { download: safeName, target: undefined, rel: undefined };
  }
  return { download: undefined, target: '_blank', rel: 'noopener noreferrer' };
}
