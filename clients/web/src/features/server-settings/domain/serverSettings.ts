import { slugifyServerName } from '@/features/server-settings/serverVanitySlug';

export const MAX_SERVER_TAGS = 8;
export const MAX_SERVER_TAG_LEN = 32;

export function normalizeVanity(raw: string): string {
  const trimmed = raw.trim();
  return trimmed === '' ? '' : slugifyServerName(trimmed);
}

/** Matches backend `normalizeEchoVanityCode` (null = invalid). */
export function validateEchoVanityFormat(raw: string): boolean | 'empty' {
  const t = raw.trim().toLowerCase();
  if (t === '') return 'empty';
  if (t.length < 3 || t.length > 32) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t);
}

export function normalizeServerTags(
  raw: Iterable<string> | null | undefined,
): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of raw) {
    const normalized = String(tag ?? '')
      .trim()
      .toLowerCase()
      .slice(0, MAX_SERVER_TAG_LEN);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= MAX_SERVER_TAGS) break;
  }
  return out;
}

export function validateServerName(name: string, maxLen = 100): boolean {
  const n = name.trim();
  return n.length > 0 && n.length <= maxLen;
}

export function validateServerDescription(desc: string, maxLen = 400): boolean {
  return desc.trim().length <= maxLen;
}
