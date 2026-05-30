import { API_BASE, PUBLIC_INVITE_BASE } from '@/config';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectInviteBases(): string[] {
  const set = new Set<string>();
  set.add(PUBLIC_INVITE_BASE.replace(/\/$/, ''));
  set.add(API_BASE.replace(/\/$/, ''));
  if (typeof window !== 'undefined' && window.location?.origin) {
    set.add(window.location.origin);
  }
  return [...set];
}

function originAllowed(url: string, bases: Set<string>): boolean {
  try {
    const u = new URL(url);
    return bases.has(u.origin);
  } catch {
    return false;
  }
}

/** True for `/invite/{hex}`, single vanity `/{slug}`, or `/api/v1/echo/invites/{token}/share` (not bare `/invite`). */
export function isEchoInviteEmbedUrl(
  url: string,
  basesList?: string[],
): boolean {
  const bases = new Set(basesList ?? collectInviteBases());
  if (!originAllowed(url, bases)) return false;
  try {
    const u = new URL(url);
    const p = u.pathname;
    if (/^\/api\/v1\/echo\/invites\/[^/]+\/share\/?$/i.test(p)) return true;
    if (/^\/invite\/[a-f0-9]{6,}$/i.test(p)) return true;
    const seg = p.replace(/^\//, '');
    if (!seg || seg.includes('/')) return false;
    const lower = seg.toLowerCase();
    if (lower === 'invite') return false;
    return (
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(seg) &&
      seg.length >= 3 &&
      seg.length <= 32
    );
  } catch {
    return false;
  }
}

function mergeNonOverlapping(
  matches: { start: number; end: number; url: string }[],
): { start: number; end: number; url: string }[] {
  const s = [...matches].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const out: typeof matches = [];
  for (const cur of s) {
    const last = out[out.length - 1];
    if (last && cur.start < last.end) continue;
    out.push(cur);
  }
  return out;
}

export function splitContentByEchoInviteLinks(
  content: string,
): Array<{ type: 'text'; text: string } | { type: 'invite'; url: string }> {
  if (!content) return [{ type: 'text', text: '' }];
  const basesList = collectInviteBases();
  const raw: { start: number; end: number; url: string }[] = [];
  for (const base of basesList) {
    const broadRe = new RegExp(`${escapeRe(base)}(/[^\\s?#]+)`, 'gi');
    for (const m of content.matchAll(broadRe)) {
      const url = m[0];
      const start = m.index ?? 0;
      if (typeof url !== 'string' || start < 0) continue;
      if (!isEchoInviteEmbedUrl(url, basesList)) continue;
      raw.push({ start, end: start + url.length, url });
    }
  }
  const merged = mergeNonOverlapping(raw);
  const parts: Array<
    { type: 'text'; text: string } | { type: 'invite'; url: string }
  > = [];
  let last = 0;
  for (const hit of merged) {
    if (hit.start > last) {
      parts.push({ type: 'text', text: content.slice(last, hit.start) });
    }
    parts.push({ type: 'invite', url: hit.url });
    last = hit.end;
  }
  if (last < content.length) {
    parts.push({ type: 'text', text: content.slice(last) });
  }
  if (parts.length === 0) {
    parts.push({ type: 'text', text: content });
  }
  return parts;
}
