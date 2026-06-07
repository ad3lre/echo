/**
 * Collect http(s) URLs from message plain text and TipTap `contentJson` link marks.
 * Used for link unfurl (server) and instant video embed previews (client).
 */

import { YOUTUBE_INTEGRATION_ENABLED } from './integrationKillSwitches';
import { parseEchoMessageJumpPath } from './echoMessageJumpPath';
import type { Embed } from './types/message';
import {
  tryParseYoutubeVideoId,
  tryParseVimeoId,
  youtubeIframeEmbedUrl,
  vimeoIframeEmbedUrl,
} from './videoEmbedIds';

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"`{|}\\^\[\]]+/gi;
const MD_PAREN_LINK_RE = /\]\((https?:\/\/[^)\s]+)\)/gi;

function trimTrailingJunk(url: string): string {
  return url.replace(/[),.;:]+$/g, '');
}

export function extractHttpUrlsFromPlainText(
  text: string,
  max: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const u = trimTrailingJunk(raw);
    if (!u || seen.has(u) || out.length >= max) return;
    seen.add(u);
    out.push(u);
  };
  for (const m of text.matchAll(URL_IN_TEXT_RE)) {
    push(m[0] ?? '');
  }
  for (const m of text.matchAll(MD_PAREN_LINK_RE)) {
    push(m[1] ?? '');
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function pushHrefFromMarks(
  marks: unknown,
  seen: Set<string>,
  out: string[],
  max: number,
): void {
  if (!Array.isArray(marks) || out.length >= max) return;
  for (const raw of marks) {
    if (!isPlainObject(raw) || raw.type !== 'link') continue;
    const attrs = raw.attrs;
    if (!isPlainObject(attrs)) continue;
    const href = typeof attrs.href === 'string' ? attrs.href.trim() : '';
    if (!href || !/^https?:\/\//i.test(href) || seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= max) return;
  }
}

function walkContentJsonForLinkHrefs(
  node: unknown,
  seen: Set<string>,
  out: string[],
  max: number,
  depth: number,
): void {
  if (out.length >= max || depth > 80 || node == null) return;
  if (!isPlainObject(node)) return;
  if (node.type === 'text') {
    pushHrefFromMarks(node.marks, seen, out, max);
    return;
  }
  const content = node.content;
  if (!Array.isArray(content)) return;
  for (const ch of content) {
    walkContentJsonForLinkHrefs(ch, seen, out, max, depth + 1);
    if (out.length >= max) return;
  }
}

/** Link `href` values from TipTap JSON (v2) when the visible label omits the URL from plain text. */
export function extractHttpUrlsFromContentJson(
  doc: unknown,
  max: number,
): string[] {
  if (!isPlainObject(doc) || doc.type !== 'doc') return [];
  const seen = new Set<string>();
  const out: string[] = [];
  walkContentJsonForLinkHrefs(doc, seen, out, max, 0);
  return out;
}

/** Merge unique URLs from plain text and optional `contentJson` link marks. */
export function collectLinkEmbedCandidateUrls(
  plain: string,
  contentJson: unknown | undefined,
  max = 12,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const u = trimTrailingJunk(raw);
    if (!u || seen.has(u) || out.length >= max) return;
    seen.add(u);
    out.push(u);
  };
  for (const u of extractHttpUrlsFromPlainText(plain, max)) {
    push(u);
  }
  for (const u of extractHttpUrlsFromContentJson(contentJson, max)) {
    push(u);
  }
  return out;
}

/** Minimal playable embed when unfurl has not run yet (or failed) but the message contains a video URL. */
export function stubVideoEmbedFromUrl(originalUrl: string): Embed | null {
  const ytId = YOUTUBE_INTEGRATION_ENABLED
    ? tryParseYoutubeVideoId(originalUrl)
    : null;
  if (ytId) {
    const embedUrl = youtubeIframeEmbedUrl(ytId);
    if (!embedUrl) return null;
    return {
      url: originalUrl,
      title: 'YouTube video',
      provider: 'YouTube',
      color: 0xff0000,
      image: { url: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` },
      video: { kind: 'youtube', embedUrl },
    };
  }
  const vmId = tryParseVimeoId(originalUrl);
  if (vmId) {
    const embedUrl = vimeoIframeEmbedUrl(vmId);
    if (!embedUrl) return null;
    return {
      url: originalUrl,
      title: 'Vimeo video',
      provider: 'Vimeo',
      color: 0x1ab7ea,
      video: { kind: 'vimeo', embedUrl },
    };
  }
  return null;
}

export function stubVideoEmbedsFromMessage(
  plain: string,
  contentJson: unknown | undefined,
  maxEmbeds = 2,
): Embed[] {
  const out: Embed[] = [];
  for (const u of collectLinkEmbedCandidateUrls(plain, contentJson, 12)) {
    if (out.length >= maxEmbeds) break;
    const stub = stubVideoEmbedFromUrl(u);
    if (stub) out.push(stub);
  }
  return out;
}

/** Inline message-jump card before server unfurl (`message:embeds`) arrives. */
export function stubEchoJumpEmbedFromUrl(originalUrl: string): Embed | null {
  const parsed = parseEchoMessageJumpPath(originalUrl);
  if (!parsed) return null;
  return {
    url: originalUrl,
    provider: 'Echo',
    title: '#channel',
    color: 0x5865f2,
    echoJump: {
      channelId: parsed.channelId,
      messageId: parsed.messageId,
    },
  };
}

export function stubEchoJumpEmbedsFromMessage(
  plain: string,
  contentJson: unknown | undefined,
  maxEmbeds = 2,
): Embed[] {
  const out: Embed[] = [];
  for (const u of collectLinkEmbedCandidateUrls(plain, contentJson, 12)) {
    if (out.length >= maxEmbeds) break;
    const stub = stubEchoJumpEmbedFromUrl(u);
    if (stub) out.push(stub);
  }
  return out;
}
