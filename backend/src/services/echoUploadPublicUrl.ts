import { getEchoUploadPublicUrlPrefixes } from './s3UploadPresign';

function stripQueryAndHash(input: string): string {
  const q = input.indexOf('?');
  const h = input.indexOf('#');
  const cut = q === -1 ? h : h === -1 ? q : Math.min(q, h);
  return cut === -1 ? input : input.slice(0, cut);
}

function decodeStorageKeyFromPublicRemainder(
  remainderRaw: string,
): string | null {
  const remainder = remainderRaw.trim().replace(/^\/+/, '');
  if (!remainder) return null;
  const parts = remainder.split('/');
  try {
    const decoded = parts.map((p) => decodeURIComponent(p));
    return decoded.join('/');
  } catch {
    return null;
  }
}

/** Resolve Echo storage key from a public upload URL or local upload path. */
export function extractEchoStorageKeyFromPublicUrl(
  urlRaw: string,
): string | null {
  const raw = stripQueryAndHash(urlRaw.trim());
  if (!raw) return null;
  const prefixes = getEchoUploadPublicUrlPrefixes().sort(
    (a, b) => b.length - a.length,
  );
  for (const prefix of prefixes) {
    const p = prefix.trim();
    if (!p) continue;
    if (raw.startsWith(p)) {
      return decodeStorageKeyFromPublicRemainder(raw.slice(p.length));
    }
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const pathOnly = parsed.pathname;
      for (const prefix of prefixes) {
        const p = prefix.trim();
        if (!p.startsWith('/')) continue;
        if (pathOnly.startsWith(p)) {
          return decodeStorageKeyFromPublicRemainder(pathOnly.slice(p.length));
        }
      }
    } catch {
      return null;
    }
  }
  return null;
}
