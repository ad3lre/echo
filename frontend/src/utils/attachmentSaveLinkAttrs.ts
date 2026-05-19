/**
 * Attributes for chat "Save" / "Download" links on attachments.
 *
 * For cross-origin URLs (Discord CDN, public R2/S3, etc.) the HTML `download` attribute is ignored;
 * the browser follows the link in the **current tab**, leaving the SPA. The URL path often ends in
 * a numeric id (e.g. Discord message snowflake) with no extension — refreshing that tab looks like
 * "Echo keeps downloading random numbered files" while the API is down or after a failed session.
 *
 * Opening cross-origin saves in a new tab keeps Echo loaded; same-origin URLs keep `download` with
 * a safe filename hint.
 */
export function sanitizeAttachmentDownloadFilename(raw: string): string {
  const t = raw.trim().replace(/[/\\]/g, '_');
  if (!t) return 'download';
  return t.length > 200 ? t.slice(0, 200) : t;
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
  let sameOrigin = false;
  try {
    sameOrigin =
      new URL(trimmed, window.location.href).origin === window.location.origin;
  } catch {
    /* invalid URL — treat as cross-origin */
  }
  if (sameOrigin) {
    return { download: safeName, target: undefined, rel: undefined };
  }
  return { download: undefined, target: '_blank', rel: 'noopener noreferrer' };
}
