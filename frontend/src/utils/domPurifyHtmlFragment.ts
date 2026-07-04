import DOMPurify from 'dompurify';

const sharedDomParser: DOMParser | null =
  typeof window !== 'undefined' ? new DOMParser() : null;

/**
 * DOMPurify drops orphan inline/replaced nodes (`img`, `strong`, …) when they are
 * not under a block wrapper. Wrap → sanitize → unwrap so repeated passes stay stable.
 */
export function domPurifyHtmlFragment(
  html: string,
  opts: Parameters<typeof DOMPurify.sanitize>[1],
  rootId = 'echo-sanitize-root',
): string {
  const trimmed = html.trim();
  if (!trimmed) return trimmed;
  if (typeof window === 'undefined') {
    return DOMPurify.sanitize(trimmed, opts);
  }
  const wrapped = `<div id="${rootId}">${trimmed}</div>`;
  const allowedTags = new Set([
    'div',
    ...(((opts as { ALLOWED_TAGS?: string[] })?.ALLOWED_TAGS ??
      []) as string[]),
  ]);
  const allowedAttr = new Set([
    'id',
    ...(((opts as { ALLOWED_ATTR?: string[] })?.ALLOWED_ATTR ??
      []) as string[]),
  ]);
  const cleaned = DOMPurify.sanitize(wrapped, {
    ...opts,
    ALLOWED_TAGS: [...allowedTags],
    ALLOWED_ATTR: [...allowedAttr],
  });
  if (!cleaned.includes(rootId)) return cleaned;
  try {
    const doc = (sharedDomParser ?? new DOMParser()).parseFromString(
      cleaned,
      'text/html',
    );
    const root = doc.getElementById(rootId);
    return root?.innerHTML ?? cleaned;
  } catch {
    return cleaned;
  }
}
