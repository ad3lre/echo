import type { ButtonRowButton } from '@shared/buttonRow';
import type { Embed } from '@shared/types';
import {
  collectLinkEmbedCandidateUrls,
  stubEchoJumpEmbedFromUrl,
} from '@shared/linkEmbedCandidates';
import { normalizeEchoJumpUrl } from '@shared/echoJumpEmbedErrors';
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
  const norm = normalizeEchoJumpUrl(trimmed);
  const fromServer = embeds?.find((e) => {
    if (!e.echoJump || !e.url?.trim()) return false;
    return normalizeEchoJumpUrl(e.url.trim()) === norm;
  });
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
    out
      .filter((e) => e.echoJump && e.url?.trim())
      .map((e) => normalizeEchoJumpUrl(e.url!.trim())),
  );
  for (const raw of collectLinkEmbedCandidateUrls(content, contentJson, 12)) {
    if (!isEchoMessageJumpEmbedUrl(raw)) continue;
    const url = raw.trim();
    if (seen.has(normalizeEchoJumpUrl(url))) continue;
    const stub = stubEchoJumpEmbedFromUrl(url);
    if (stub) {
      out.push(stub);
      seen.add(normalizeEchoJumpUrl(url));
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

/**
 * Appends jump segments for Echo message URLs present in `contentJson` (or stored
 * `echoJump` embeds) that were not already inlined from plain `content`.
 */
export function appendOrphanEchoJumpEmbedSegments<
  T extends
    | { type: 'text'; text: string }
    | { type: 'invite'; url: string }
    | { type: 'jump'; url: string; embed: Embed }
    | {
        type: 'imageSlot';
        slotId: string;
        aspectW: number;
        aspectH: number;
        imageUrl?: string | null;
        width?: number | null;
        height?: number | null;
      }
    | {
        type: 'buttonRow';
        rowId: string;
        buttons: ButtonRowButton[];
      },
>(
  segments: T[],
  content: string,
  contentJson: unknown | undefined,
  embeds: Embed[] | undefined,
): T[] {
  const used = new Set(
    segments
      .filter((s): s is Extract<T, { type: 'jump' }> => s.type === 'jump')
      .map((s) => normalizeEchoJumpUrl(s.url)),
  );
  const out = [...segments];

  const pushJump = (url: string, embed: Embed) => {
    const norm = normalizeEchoJumpUrl(url);
    if (!norm || used.has(norm)) return;
    used.add(norm);
    out.push({ type: 'jump', url, embed } as T);
  };

  for (const raw of collectLinkEmbedCandidateUrls(content, contentJson, 12)) {
    if (!isEchoMessageJumpEmbedUrl(raw)) continue;
    pushJump(raw.trim(), embedForJumpUrl(raw.trim(), embeds));
  }

  for (const e of embeds ?? []) {
    if (!e.echoJump || !e.url?.trim()) continue;
    const url = e.url.trim();
    if (content.includes(url)) continue;
    pushJump(url, e);
  }

  return out;
}
