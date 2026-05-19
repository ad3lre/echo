/** Loose http(s) URL scanner for profile bios (plain text, not markdown). */
export const BIO_URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

const TRAILING_URL_PUNCT = /[.,;:!?)]+$/;

export type BioTextSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; display: string; faviconDomain: string };

export function trimBioUrlTrailingPunctuation(raw: string): {
  url: string;
  trailing: string;
} {
  let url = raw;
  let trailing = '';
  for (;;) {
    const m = url.match(TRAILING_URL_PUNCT);
    if (!m) break;
    const punct = m[0]!;
    if (
      punct.includes(')') &&
      (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0)
    ) {
      break;
    }
    trailing = punct + trailing;
    url = url.slice(0, -punct.length);
  }
  return { url, trailing };
}

/** Returns normalized http(s) href or null when the token is not a safe external URL. */
export function normalizeBioLinkHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Visible label: host + path (+ query/hash), no scheme; truncated when long. */
export function formatBioLinkDisplay(href: string, maxLength = 56): string {
  try {
    const u = new URL(href);
    let path = u.pathname;
    if (path === '/') path = '';
    else if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    const display = `${u.host}${path}${u.search}${u.hash}`;
    if (display.length <= maxLength) return display;
    return `${display.slice(0, Math.max(1, maxLength - 1))}…`;
  } catch {
    const stripped = href.replace(/^https?:\/\//i, '');
    if (stripped.length <= maxLength) return stripped;
    return `${stripped.slice(0, Math.max(1, maxLength - 1))}…`;
  }
}

/** Google favicon service; null when hostname cannot be resolved. */
export function bioLinkFaviconUrl(href: string): string | null {
  try {
    const host = new URL(href).hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch {
    return null;
  }
}

export function parseBioTextSegments(text: string): BioTextSegment[] {
  if (!text) return [];
  const segments: BioTextSegment[] = [];
  const re = new RegExp(BIO_URL_RE.source, BIO_URL_RE.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    const raw = match[0];
    const { url, trailing } = trimBioUrlTrailingPunctuation(raw);
    const href = normalizeBioLinkHref(url);
    if (href) {
      segments.push({
        type: 'link',
        href,
        display: formatBioLinkDisplay(href),
        faviconDomain: new URL(href).hostname,
      });
      if (trailing) segments.push({ type: 'text', value: trailing });
    } else {
      segments.push({ type: 'text', value: raw });
    }
    lastIndex = start + raw.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}
