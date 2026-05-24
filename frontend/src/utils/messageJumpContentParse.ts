import type { Embed } from '@shared/types';
import {
  collectLinkEmbedCandidateUrls,
  stubEchoJumpEmbedFromUrl,
} from '@shared/linkEmbedCandidates';
import {
  isEchoMessageJumpPathname,
  parseEchoMessageJumpPath,
} from '@shared/echoMessageJumpPath';
import { API_BASE, PUBLIC_INVITE_BASE } from '@/config';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectMessageJumpBases(): string[] {
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

export function isEchoMessageJumpEmbedUrl(
  url: string,
  basesList?: string[],
): boolean {
  const bases = new Set(basesList ?? collectMessageJumpBases());
  if (!originAllowed(url, bases)) return false;
  try {
    return isEchoMessageJumpPathname(new URL(url).pathname);
  } catch {
    return false;
  }
}

function mergeNonOverlapping(
  matches: { start: number; end: number; url: string; embed: Embed }[],
): { start: number; end: number; url: string; embed: Embed }[] {
  const s = [...matches].sort(
    (a, b) => a.start - b.start || b.end - a.end - (a.end - b.end),
  );
  const out: typeof matches = [];
  for (const cur of s) {
    const last = out[out.length - 1];
    if (last && cur.start < last.end) continue;
    out.push(cur);
  }
  return out;
}

function embedForJumpUrl(url: string, embeds: Embed[] | undefined): Embed {
  const trimmed = url.trim();
  const fromServer = embeds?.find(
    (e) => e.echoJump && e.url?.trim() === trimmed,
  );
  if (fromServer) return fromServer;
  const stub = stubEchoJumpEmbedFromUrl(trimmed);
  if (stub) return stub;
  const parsed = parseEchoMessageJumpPath(trimmed);
  return {
    url: trimmed,
    provider: 'Echo',
    echoJump: parsed ?? { channelId: '', messageId: '' },
  };
}

/** Server unfurl + instant client stubs for message jump URLs not stored on the row yet. */
export function mergeEchoJumpEmbedsForMessage(
  content: string,
  contentJson: unknown | undefined,
  stored: Embed[] | undefined,
): Embed[] {
  const out: Embed[] = [...(stored ?? [])];
  const seen = new Set(
    out.filter((e) => e.echoJump && e.url?.trim()).map((e) => e.url!.trim()),
  );
  for (const raw of collectLinkEmbedCandidateUrls(content, contentJson, 12)) {
    if (!isEchoMessageJumpEmbedUrl(raw)) continue;
    const url = raw.trim();
    if (seen.has(url)) continue;
    const stub = stubEchoJumpEmbedFromUrl(url);
    if (stub) {
      out.push(stub);
      seen.add(url);
    }
  }
  return out;
}

function findMessageJumpUrlsInContent(
  content: string,
  embeds: Embed[] | undefined,
): { start: number; end: number; url: string; embed: Embed }[] {
  const basesList = collectMessageJumpBases();
  const bases = new Set(basesList);
  const raw: { start: number; end: number; url: string; embed: Embed }[] = [];

  for (const base of basesList) {
    const re = new RegExp(
      `${escapeRe(base)}/channels/[^\\s?#"']+/[^\\s?#"']+`,
      'gi',
    );
    for (const m of content.matchAll(re)) {
      const url = m[0];
      const start = m.index ?? 0;
      if (typeof url !== 'string' || start < 0) continue;
      if (!isEchoMessageJumpEmbedUrl(url, basesList)) continue;
      raw.push({
        start,
        end: start + url.length,
        url,
        embed: embedForJumpUrl(url, embeds),
      });
    }
  }

  const jumps =
    embeds
      ?.filter((e) => e.echoJump && e.url?.trim())
      ?.map((e) => ({ e, url: e.url!.trim() })) ?? [];
  for (const { e, url } of jumps) {
    let idx = content.indexOf(url);
    while (idx !== -1) {
      raw.push({ start: idx, end: idx + url.length, url, embed: e });
      idx = content.indexOf(url, idx + 1);
    }
  }

  return mergeNonOverlapping(raw);
}

/**
 * Splits `content` so each pasted message jump URL becomes its own segment (inline preview).
 * Uses stored `echoJump` embeds when present; otherwise detects Echo message URLs client-side.
 */
export function splitContentByEchoJumpEmbeds(
  content: string,
  embeds: Embed[] | undefined,
): Array<
  { type: 'text'; text: string } | { type: 'jump'; url: string; embed: Embed }
> {
  if (!content) return [{ type: 'text', text: '' }];

  const merged = findMessageJumpUrlsInContent(content, embeds);
  if (!merged.length) return [{ type: 'text', text: content }];

  const parts: Array<
    { type: 'text'; text: string } | { type: 'jump'; url: string; embed: Embed }
  > = [];
  let last = 0;
  for (const hit of merged) {
    if (hit.start > last) {
      parts.push({ type: 'text', text: content.slice(last, hit.start) });
    }
    parts.push({ type: 'jump', url: hit.url, embed: hit.embed });
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
