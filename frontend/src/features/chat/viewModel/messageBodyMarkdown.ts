/**
 * Markdown parsing for message display (chat view-model authority).
 * Supports: tables, hr, task lists, footnotes, ==highlight==, HTML.
 * Parses markdown, sanitizes output, then applies Twemoji.
 * Linkable ID tokens (`<@id>`, `<#id>`, …) render as mention-style pills when pasted.
 */

import { Marked } from 'marked';
import markedFootnote from 'marked-footnote';
import DOMPurify from 'dompurify';
import * as katex from 'katex';
import {
  applyTwemojiToHtmlString,
  splitTextWithEmoji,
  twemojiHtmlFromSegments,
} from '@/utils/twemoji';
import type { MentionEntity } from '@shared/types';
import { findAllIdTokenMatches, type ParsedIdToken } from '@/utils/idTokens';
import {
  extractMarkdownMathRegions,
  hasMarkdownMathRegions,
  injectRenderedMathRegions,
} from '@/composables/markdownMathRegions';
import { normalizeKatexInput } from '@/composables/normalizeKatexInput';
import { preprocessLatexTextCompat } from './latexTextCompat';
import {
  buildTextWithSpoilerPlaceholders,
  findRawDiscordSpoilerRegions,
  makeSpoilerPlaceholderToken,
  type RawSpoilerRegion,
  replaceSpoilerPlaceholdersInHtml,
} from '@/utils/discordSpoilerMarkdown';

const marked = new Marked()
  .setOptions({ gfm: true, breaks: true })
  .use(markedFootnote({ refMarkers: true }));

const sharedDomParser: DOMParser | null =
  typeof window !== 'undefined' ? new DOMParser() : null;

/** Escape HTML entities for safe insertion into attribute/text content. */
function escapeForHighlight(inner: string): string {
  return inner
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Pre-process ==highlight== syntax before markdown (GFM has no built-in support). */
function preprocessHighlights(text: string): string {
  return text.replace(
    /==([^=\n]+?)==/g,
    (_, m) => `<mark>${escapeForHighlight(m)}</mark>`,
  );
}

/** Convert @Everyone/@Active into styled spans before markdown parsing.
 * Plain @username/@role text should NOT be transformed here — user/role styling
 * is only applied when an explicit mention entity exists (see preprocessMentionsAndTokens).
 */
function preprocessMentions(text: string): string {
  return text.replace(/@(Everyone|Active)/g, (match, name) => {
    const cls = 'mention mention--special';
    return `<span class="${cls}">@${escapeForHighlight(name)}</span>`;
  });
}

function sortMentions(
  text: string,
  mentions: MentionEntity[],
): MentionEntity[] {
  let lastEnd = -1;
  return [...mentions]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .filter((mention) => {
      if (
        mention.start < 0 ||
        mention.end <= mention.start ||
        mention.end > text.length
      )
        return false;
      if (mention.start < lastEnd) return false;
      lastEnd = mention.end;
      return true;
    });
}

function renderMentionEntityHtml(mention: MentionEntity, text: string): string {
  const mentionText =
    text.slice(mention.start, mention.end) ||
    (mention.kind === 'channel' ? `#${mention.label}` : `@${mention.label}`);
  const escaped = escapeForHighlight(mentionText);
  if (mention.kind === 'channel' && mention.channelId) {
    return `<span class="mention mention--channel" data-channel-id="${escapeForHighlight(mention.channelId)}" data-mention-channel tabindex="0" role="button">${escaped}</span>`;
  }
  const uid = mention.userId?.trim();
  if (mention.kind === 'user' && uid) {
    return `<span class="mention id-token" data-user-id="${escapeAttr(uid)}" data-mention-user tabindex="0" role="button">${escaped}</span>`;
  }
  const cls =
    mention.kind === 'user'
      ? 'mention'
      : mention.kind === 'channel'
        ? 'mention mention--channel'
        : 'mention mention--special';
  return `<span class="${cls}">${escaped}</span>`;
}

export type IdTokenResolvers = {
  userLabel?: (id: string) => string;
  channelLabel?: (id: string) => string;
  roleLabel?: (id: string) => string;
  serverLabel?: (id: string) => string;
  messageLabel?: (id: string) => string;
  /** When omitted or returns undefined, custom emoji tokens render as `:name:` text. */
  customEmojiImageUrl?: (
    id: string,
    name: string,
    animated: boolean,
  ) => string | undefined;
  /** In-house SVG icon token `<icon:file.svg>` → image URL (Echo icon catalog). */
  appIconImageUrl?: (filename: string) => string | undefined;
  /**
   * Explicit cache version to decouple parse cache invalidation from object
   * identity. When set, `getResolverCacheVersion` returns this value instead
   * of assigning a new monotonic version per object reference. This prevents
   * mass cache invalidation when a `computed` recreates the resolver object
   * without the underlying name/label data having changed.
   */
  _cacheVersion?: number;
};

function rangesOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): boolean {
  return a0 < b1 && b0 < a1;
}

const MAX_PARSE_MESSAGE_DEPTH = 24;

/**
 * Wrap parsed inner markdown for insertion into an outer paragraph: avoid <p> inside <p>.
 */
function formatSpoilerInnerHtml(parsedHtml: string): string {
  const t = parsedHtml.trim();
  const singleParagraph = /^<p>[\s\S]*<\/p>\s*$/i.test(t);
  if (singleParagraph) {
    const inner = /^<p>([\s\S]*)<\/p>\s*$/i.exec(t)?.[1] ?? t;
    return `<span class="spoiler">${inner}</span>`;
  }
  return `<div class="spoiler">${t}</div>`;
}

function applyRawSpoilerExtraction(
  text: string,
  mentions: MentionEntity[] | undefined,
): {
  text: string;
  slots: { inner: string; mentions: MentionEntity[] }[];
  outsideMentions: MentionEntity[];
} | null {
  const regions = findRawDiscordSpoilerRegions(text);
  if (regions.length === 0) return null;

  const sorted = [...regions].sort((a, b) => a.start - b.start);
  const innerRanges: { lo: number; hi: number; r: RawSpoilerRegion }[] =
    sorted.map((r) => ({
      lo: r.start + 2,
      hi: r.start + 2 + r.inner.length,
      r,
    }));

  const mlist = mentions ?? [];
  for (const m of mlist) {
    for (const { lo, hi } of innerRanges) {
      if (!rangesOverlap(m.start, m.end, lo, hi)) continue;
      if (m.start >= lo && m.end <= hi) continue;
      return null;
    }
  }

  const slots = sorted.map((r) => {
    const lo = r.start + 2;
    const hi = lo + r.inner.length;
    const innerMs = mlist
      .filter((m) => m.start >= lo && m.end <= hi)
      .map((m) => ({ ...m, start: m.start - lo, end: m.end - lo }));
    return { inner: r.inner, mentions: innerMs };
  });

  const outside = mlist.filter(
    (m) => !innerRanges.some(({ lo, hi }) => m.start >= lo && m.end <= hi),
  );

  const tokenLen = makeSpoilerPlaceholderToken(0).length;
  const outsideRemapped = outside.map((m) => {
    let ds = 0;
    let de = 0;
    for (const r of sorted) {
      if (r.end <= m.start) ds += tokenLen - (r.end - r.start);
      if (r.end <= m.end) de += tokenLen - (r.end - r.start);
    }
    return { ...m, start: m.start + ds, end: m.end + de };
  });

  return {
    text: buildTextWithSpoilerPlaceholders(text, sorted),
    slots,
    outsideMentions: outsideRemapped,
  };
}

type MergeEvent =
  | { type: 'entity'; start: number; end: number; mention: MentionEntity }
  | { type: 'token'; start: number; end: number; token: ParsedIdToken };

function purgeOverlappingEvents(events: MergeEvent[]): MergeEvent[] {
  const sorted = [...events].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.type !== b.type) return a.type === 'entity' ? -1 : 1;
    return a.end - b.end;
  });
  const out: MergeEvent[] = [];
  for (const ev of sorted) {
    const last = out[out.length - 1];
    if (last && ev.start < last.end) {
      if (ev.type === 'entity' && last.type === 'token') {
        out.pop();
        out.push(ev);
      }
      continue;
    }
    out.push(ev);
  }
  return out;
}

/**
 * Composer mirror overlay: plain text + Discord id tokens (custom emoji → img when URL known).
 * Does not run markdown — matches how the textarea stores raw content.
 */
export function renderComposerOverlayPlainSegment(
  text: string,
  resolvers: IdTokenResolvers | undefined,
): string {
  const matches = findAllIdTokenMatches(text);
  const r: IdTokenResolvers = resolvers ?? {};
  if (matches.length === 0) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  let out = '';
  let cursor = 0;
  for (const { start, end, token } of matches) {
    if (start > cursor) {
      const chunk = text.slice(cursor, start);
      out += chunk
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    if (token.kind === 'emoji') {
      const url = r.customEmojiImageUrl?.(token.id, token.name, token.animated);
      if (url) {
        const t = `:${token.name}:`;
        const w =
          Number.isFinite(token.rawLen) &&
          token.rawLen > 0 &&
          token.rawLen < 512
            ? token.rawLen
            : 4;
        out += `<span class="composer-emoji-token-slot" style="width:${w}ch"><img class="emoji custom-emoji" draggable="false" alt="${escapeAttr(t)}" title="${escapeAttr(t)}" src="${escapeAttr(url)}"/></span>`;
      } else {
        out += renderIdTokenHtml(token, r);
      }
    } else if (token.kind === 'appIcon') {
      const url = r.appIconImageUrl?.(token.filename);
      if (url) {
        const t = `:${token.filename.replace(/\.svg$/i, '')}:`;
        const w =
          Number.isFinite(token.rawLen) &&
          token.rawLen > 0 &&
          token.rawLen < 512
            ? token.rawLen
            : 4;
        out += `<span class="composer-emoji-token-slot" style="width:${w}ch"><img class="emoji app-inline-icon" draggable="false" alt="" aria-label="${escapeAttr(t)}" title="${escapeAttr(t)}" src="${escapeAttr(url)}"/></span>`;
      } else {
        out += renderIdTokenHtml(token, r);
      }
    } else {
      out += renderIdTokenHtml(token, r);
    }
    cursor = end;
  }
  if (cursor < text.length) {
    const chunk = text.slice(cursor);
    out += chunk
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  return out;
}

function renderIdTokenHtml(
  parsed: ParsedIdToken,
  resolvers: IdTokenResolvers,
): string {
  const safe = (s: string) => escapeForHighlight(s);
  const attr = (s: string) => escapeAttr(s);
  switch (parsed.kind) {
    case 'user': {
      const label = resolvers.userLabel?.(parsed.id) ?? parsed.id;
      return `<span class="mention id-token" data-user-id="${attr(parsed.id)}" data-mention-user tabindex="0" role="button">${safe('@' + label)}</span>`;
    }
    case 'channel': {
      const label = resolvers.channelLabel?.(parsed.id) ?? parsed.id;
      return `<span class="mention mention--channel id-token" data-channel-id="${attr(parsed.id)}" data-mention-channel tabindex="0" role="button">${safe('#' + label)}</span>`;
    }
    case 'role': {
      const label = resolvers.roleLabel?.(parsed.id) ?? parsed.id;
      return `<span class="mention mention--role id-token" data-role-id="${attr(parsed.id)}" tabindex="0" role="button">${safe('@' + label)}</span>`;
    }
    case 'server': {
      const label = resolvers.serverLabel?.(parsed.id) ?? parsed.id;
      return `<span class="mention mention--server id-token" data-server-id="${attr(parsed.id)}" tabindex="0" role="button">${safe(label)}</span>`;
    }
    case 'message': {
      const label = resolvers.messageLabel?.(parsed.id) ?? parsed.id;
      return `<span class="mention mention--message-ref id-token" data-message-id="${attr(parsed.id)}" tabindex="0" role="button">${safe('m:' + label)}</span>`;
    }
    case 'emoji': {
      const url = resolvers.customEmojiImageUrl?.(
        parsed.id,
        parsed.name,
        parsed.animated,
      );
      if (url) {
        const t = `:${parsed.name}:`;
        return `<img class="emoji custom-emoji" draggable="false" alt="${attr(t)}" title="${attr(t)}" src="${attr(url)}"/>`;
      }
      const disp = `:${parsed.name}:`;
      return `<span class="mention mention--custom-emoji id-token" data-emoji-id="${attr(parsed.id)}" data-emoji-name="${attr(parsed.name)}" tabindex="0" role="button">${safe(disp)}</span>`;
    }
    case 'appIcon': {
      const url = resolvers.appIconImageUrl?.(parsed.filename);
      if (url) {
        const t = `:${parsed.filename.replace(/\.svg$/i, '')}:`;
        return `<img class="emoji app-inline-icon" draggable="false" alt="" aria-label="${attr(t)}" title="${attr(t)}" src="${attr(url)}" data-app-icon="${attr(parsed.filename)}"/>`;
      }
      const disp = `<icon:${parsed.filename}>`;
      return `<span class="mention id-token" data-app-icon="${attr(parsed.filename)}" tabindex="0" role="button">${safe(disp)}</span>`;
    }
  }
}

function preprocessMentionsAndTokens(
  text: string,
  mentions: MentionEntity[] | undefined,
  resolvers: IdTokenResolvers | undefined,
): string {
  const validMentions = mentions?.length ? sortMentions(text, mentions) : [];
  const tokenMatches = findAllIdTokenMatches(text);
  const filteredTokens = tokenMatches.filter(
    (t) =>
      !validMentions.some((m) => rangesOverlap(t.start, t.end, m.start, m.end)),
  );
  const r: IdTokenResolvers = resolvers ?? {};
  const events: MergeEvent[] = [
    ...validMentions.map((m) => ({
      type: 'entity' as const,
      start: m.start,
      end: m.end,
      mention: m,
    })),
    ...filteredTokens.map((t) => ({
      type: 'token' as const,
      start: t.start,
      end: t.end,
      token: t.token,
    })),
  ];
  const cleaned = purgeOverlappingEvents(events);
  let cursor = 0;
  let result = '';
  for (const ev of cleaned) {
    if (cursor < ev.start) {
      result += preprocessMentions(text.slice(cursor, ev.start));
    }
    if (ev.type === 'entity') {
      result += renderMentionEntityHtml(ev.mention, text);
    } else {
      result += renderIdTokenHtml(ev.token, r);
    }
    cursor = ev.end;
  }
  result += preprocessMentions(text.slice(cursor));
  return result;
}

const SANITIZE_OPTS = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    's',
    'u',
    'code',
    'pre',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'span',
    'div',
    'mark',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'hr',
    'input',
    'section',
    'sup',
    'b',
    'i',
    'small',
    'sub',
    'del',
    'ins',
    'abbr',
    'kbd',
    'samp',
    'var',
    'cite',
    'img',
    'math',
    'semantics',
    'annotation',
    'mrow',
    'mi',
    'mn',
    'mo',
    'mtext',
    'ms',
    'mspace',
    'mfrac',
    'msqrt',
    'mroot',
    'msub',
    'msup',
    'msubsup',
    'munder',
    'mover',
    'munderover',
    'mtable',
    'mtr',
    'mtd',
    'mstyle',
    'mpadded',
    'mphantom',
    'menclose',
    'mglyph',
    /** KaTeX draws stretchy `\middle|`, `\Big|`, etc. as inline SVG; stripping these removes the bar. */
    'svg',
    'path',
    'line',
  ],
  ALLOWED_ATTR: [
    'href',
    'class',
    'target',
    'rel',
    'id',
    'align',
    'type',
    'checked',
    'disabled',
    'data-footnote-ref',
    'data-footnotes',
    'data-footnote-backref',
    'data-channel-id',
    'data-mention-channel',
    'data-user-id',
    'data-mention-user',
    'data-server-id',
    'data-role-id',
    'data-message-id',
    'data-emoji-id',
    'data-emoji-name',
    'data-app-icon',
    'aria-describedby',
    'aria-label',
    'tabindex',
    'role',
    'src',
    'alt',
    'title',
    'draggable',
    'loading',
    /** KaTeX layout depends on inline `style` on spans (width/height/position); stripping it collapses glyphs. */
    'style',
    'aria-hidden',
    'xmlns',
    'display',
    'encoding',
    'mathvariant',
    'mathsize',
    'mathcolor',
    /** SVG used by KaTeX delimiters (`\middle`, large fences, etc.) */
    'viewBox',
    'preserveAspectRatio',
    'd',
    'x1',
    'y1',
    'x2',
    'y2',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'fill',
    'focusable',
  ],
  ADD_ATTR: ['target'],
};

const MARKDOWN_SYNTAX =
  /(^|\n)(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|```|~~~|\|.*\||\s*[-*_]{3,}\s*$)|(\*\*[^*\n]*\*\*|\*[^*\n]+\*|__[^_\n]*__|_[^_\n]+_|`[^`\n]+`|~~[^~\n]+~~|\[[^\]]+\]\([^)]+\)|!\[[^\]]*\]\([^)]+\)|==[^=\n]+==|\|\|[^|]+\|\|)|(\*\*|\*\s|\*\S|`|~~|==|\|\|)/m;
/** Footnote refs (`[^label]`) are handled by marked-footnote; do not bypass marked when present. */
const FOOTNOTE_REF_SYNTAX = /\[\^[^\]\n]+\]/;

/**
 * Parse message content: markdown → sanitized HTML → Twemoji.
 * Use for displaying messages.
 */
/**
 * Check if text contains a mention that would ping a given user.
 * Returns true for @Everyone, @Active, or @username (case-insensitive).
 */
export function mentionsUser(
  text: string | undefined,
  mentions: MentionEntity[] | undefined,
  userId: string | undefined,
  username: string | undefined,
): boolean {
  if (!text) return false;
  // Consider pings only if an explicit mention entity exists. This prevents plain
  // text like "@someone" from counting as a ping when that user doesn't exist.
  if (
    mentions?.some(
      (mention) => mention.kind === 'everyone' || mention.kind === 'active',
    )
  )
    return true;
  if (
    userId &&
    mentions?.some(
      (mention) => mention.kind === 'user' && mention.userId === userId,
    )
  ) {
    return true;
  }
  if (
    username &&
    mentions?.some(
      (mention) =>
        mention.kind === 'user' &&
        (mention.userId === userId ||
          mention.label.toLowerCase() === username.toLowerCase()),
    )
  ) {
    return true;
  }
  return false;
}

/**
 * When true, `marked.parse` would not change semantics vs a minimal `<p>` + `<br>` escape
 * for Echo’s preprocessors (spoilers, mentions, tokens, math, GFM autolink, raw HTML, etc.).
 * Keeps hot-path plain chat lines off the full markdown lexer.
 */
function echoTextAllowsMarkedBypass(
  text: string,
  mentions: MentionEntity[] | undefined,
  spoilerPass: ReturnType<typeof applyRawSpoilerExtraction>,
): boolean {
  if (mentions?.length) return false;
  if (spoilerPass != null) return false;
  if (findAllIdTokenMatches(text).length > 0) return false;
  if (/==[^=\n]+?==/.test(text)) return false;
  if (hasMarkdownSyntax(text)) return false;
  if (FOOTNOTE_REF_SYNTAX.test(text)) return false;
  if (/@(Everyone|Active)/.test(text)) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (/\|\|/.test(text)) return false;
  if (/</.test(text)) return false;
  return true;
}

const PARSE_CACHE = new Map<string, string>();
const PARSE_CACHE_MAX = 2000;
const HTML_STAGE_CACHE_MAX = 2000;
const MARKDOWN_PIPELINE_VERSION =
  'mdp1_math3_dollar_inline_latex_text1_sanitize3_katex_svg_twemoji1_alerts1';
const EMOJI_CANDIDATE_RE = /[\u{2600}-\u{27BF}\u{1F000}-\u{1FAFF}]/u;
const RESOLVER_CACHE_VERSION = new WeakMap<object, number>();
const HEADING_HTML_CACHE = new Map<string, string>();
const TWEMOJI_HTML_CACHE = new Map<string, string>();
const SANITIZE_HTML_CACHE = new Map<string, string>();
let nextResolverCacheVersion = 1;

function getCachedString(
  cache: Map<string, string>,
  key: string,
): string | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function setCachedString(
  cache: Map<string, string>,
  key: string,
  value: string,
  max: number,
): string {
  if (cache.size >= max) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

function getResolverCacheVersion(resolvers?: IdTokenResolvers): number {
  if (!resolvers) return 0;
  if (resolvers._cacheVersion != null) return resolvers._cacheVersion;
  const key = resolvers as object;
  const cached = RESOLVER_CACHE_VERSION.get(key);
  if (cached != null) return cached;
  const version = nextResolverCacheVersion++;
  RESOLVER_CACHE_VERSION.set(key, version);
  return version;
}

function parseMessageCacheKey(
  text: string,
  mentions?: MentionEntity[],
  resolverVersion = 0,
): string {
  const m = mentions?.length ? JSON.stringify(mentions) : '';
  const needsResolverVersion = findAllIdTokenMatches(text).length > 0;
  return `${MARKDOWN_PIPELINE_VERSION}:r${needsResolverVersion ? resolverVersion : 0}:${text}\n${m}`;
}

const MAX_KATEX_SOURCE_CHARS = 3000;
let katexCssLoadPromise: Promise<unknown> | null = null;

/**
 * KaTeX styles are loaded on-demand so they do not inflate the entry CSS.
 * Rendering may happen before the stylesheet finishes downloading; classes
 * still resolve once the import completes.
 */
function ensureKatexCssLoaded(): void {
  if (katexCssLoadPromise) return;
  katexCssLoadPromise = import('katex/dist/katex.min.css').catch(
    () => undefined,
  );
}

function renderKatexHtml(latex: string, displayMode: boolean): string {
  const src =
    latex.length > MAX_KATEX_SOURCE_CHARS
      ? `${latex.slice(0, MAX_KATEX_SOURCE_CHARS)}\\text{...}`
      : latex;
  try {
    return katex.renderToString(src, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: 'warn',
      output: 'htmlAndMathml',
      /** Large matrices and nested macros need more than a very small cap. */
      maxExpand: 2000,
      maxSize: 20,
    });
  } catch {
    return `<span class="katex-error" title="Math render error">\\text{...}</span>`;
  }
}

function applyTwemojiOutsideKatex(html: string): string {
  if (!html.trim()) return html;
  if (!EMOJI_CANDIDATE_RE.test(html)) return html;
  const cached = getCachedString(TWEMOJI_HTML_CACHE, html);
  if (cached !== undefined) return cached;
  if (typeof window === 'undefined') {
    return setCachedString(
      TWEMOJI_HTML_CACHE,
      html,
      applyTwemojiToHtmlString(html),
      HTML_STAGE_CACHE_MAX,
    );
  }
  try {
    const doc = (sharedDomParser ?? new DOMParser()).parseFromString(
      `<div id="echo-md-twemoji-root">${html}</div>`,
      'text/html',
    );
    const root = doc.getElementById('echo-md-twemoji-root');
    if (!root) return html;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let cur = walker.nextNode();
    while (cur) {
      textNodes.push(cur as Text);
      cur = walker.nextNode();
    }
    for (const node of textNodes) {
      const parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest('.katex')) continue;
      const raw = node.nodeValue ?? '';
      if (!raw.trim()) continue;
      if (!EMOJI_CANDIDATE_RE.test(raw)) continue;
      const segments = splitTextWithEmoji(raw);
      if (!segments.some((s) => s.type === 'emoji')) continue;
      const parsed = twemojiHtmlFromSegments(segments);
      const holder = doc.createElement('span');
      holder.innerHTML = parsed;
      const frag = doc.createDocumentFragment();
      while (holder.firstChild) frag.appendChild(holder.firstChild);
      node.replaceWith(frag);
    }
    return setCachedString(
      TWEMOJI_HTML_CACHE,
      html,
      root.innerHTML,
      HTML_STAGE_CACHE_MAX,
    );
  } catch {
    return setCachedString(
      TWEMOJI_HTML_CACHE,
      html,
      applyTwemojiToHtmlString(html),
      HTML_STAGE_CACHE_MAX,
    );
  }
}

/** URL-safe fragment for heading anchors (composer preview TOC + future deep links). */
export function slugifyMarkdownHeading(text: string): string {
  const t = text.trim().toLowerCase();
  const base = t
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return base || 'heading';
}

/**
 * Assign stable `id` on h1–h6 for in-page navigation. No-op on SSR.
 * Call on HTML **before** DOMPurify so `id` is preserved (allowed in SANITIZE_OPTS).
 */
function isMentionClassValue(classValue: string): boolean {
  return classValue
    .split(/\s+/)
    .filter(Boolean)
    .some((t) => t === 'mention' || t.startsWith('mention--'));
}

/**
 * After marked, temporarily remove inline mention spans so later passes (e.g. `#channel`
 * styling) cannot wrap text that is already inside a mention pill. Uses a small scanner
 * so attribute order (`data-*` before `class`, extra classes like `id-token`) does not
 * matter — unlike a fragile `class="mention mention--channel"`-only regex.
 */
function shieldMentionSpansForMarkdownPass(html: string): {
  html: string;
  slots: string[];
} {
  const slots: string[] = [];
  let out = '';
  let pos = 0;
  while (pos < html.length) {
    const open = html.indexOf('<span', pos);
    if (open === -1) {
      out += html.slice(pos);
      break;
    }
    out += html.slice(pos, open);
    const gt = html.indexOf('>', open);
    if (gt === -1) {
      out += html.slice(open);
      break;
    }
    const openTag = html.slice(open, gt + 1);
    const cm = /class\s*=\s*"([^"]*)"/i.exec(openTag);
    const clsVal = cm?.[1] ?? '';
    if (!isMentionClassValue(clsVal)) {
      out += openTag;
      pos = gt + 1;
      continue;
    }
    let depth = 1;
    let j = gt + 1;
    while (j < html.length && depth > 0) {
      const openIdx = html.indexOf('<span', j);
      const closeIdx = html.indexOf('</span>', j);
      if (closeIdx === -1) break;
      if (openIdx !== -1 && openIdx < closeIdx) {
        depth++;
        j = openIdx + 5;
      } else {
        depth--;
        j = closeIdx + 7;
      }
    }
    const full = html.slice(open, j);
    slots.push(full);
    out += `__MNSPAN_${slots.length - 1}__`;
    pos = j;
  }
  return { html: out, slots };
}

function unshieldMentionSpanSlots(html: string, slots: string[]): string {
  let s = html;
  for (let i = 0; i < slots.length; i++) {
    s = s.split(`__MNSPAN_${i}__`).join(slots[i]!);
  }
  return s;
}

/** Collapse nested channel mention spans (e.g. second-pass `#` wrap). Class token order–agnostic. */
function collapseNestedChannelMentionSpans(html: string): string {
  const nestedChRe =
    /<span\b[^>]*\bmention--channel\b[^>]*>(<span\b[^>]*\bmention--channel\b[^>]*>[\s\S]*?<\/span>)<\/span>/gi;
  let prev = '';
  let cur = html;
  while (prev !== cur) {
    prev = cur;
    cur = cur.replace(nestedChRe, '$1');
  }
  return cur;
}

type MarkdownAlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

const MARKDOWN_ALERT_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;

function normalizeMarkdownAlertKind(raw: string): MarkdownAlertKind {
  return raw.trim().toLowerCase() as MarkdownAlertKind;
}

function transformMarkdownAlertBlockquotes(html: string): string {
  if (typeof window === 'undefined' || !html.includes('<blockquote'))
    return html;
  try {
    const doc = (sharedDomParser ?? new DOMParser()).parseFromString(
      `<div id="echo-md-alerts">${html}</div>`,
      'text/html',
    );
    const root = doc.getElementById('echo-md-alerts');
    if (!root) return html;
    const blockquotes = Array.from(root.querySelectorAll('blockquote'));
    for (const blockquote of blockquotes) {
      const first = blockquote.firstElementChild as HTMLElement | null;
      if (!first) continue;
      const markerText = first.textContent ?? '';
      const markerMatch = markerText.match(MARKDOWN_ALERT_RE);
      if (!markerMatch) continue;
      const kind = normalizeMarkdownAlertKind(markerMatch[1] ?? '');
      const title = `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`;
      const nextHtml = first.innerHTML.replace(MARKDOWN_ALERT_RE, '');
      if (nextHtml.trim().length === 0) {
        first.remove();
      } else {
        first.innerHTML = nextHtml;
      }
      const alertRoot = doc.createElement('div');
      alertRoot.className = `md-alert md-alert--${kind}`;
      alertRoot.setAttribute('role', 'note');
      const heading = doc.createElement('p');
      heading.className = 'md-alert__title';
      heading.textContent = title;
      alertRoot.appendChild(heading);
      while (blockquote.firstChild) {
        alertRoot.appendChild(blockquote.firstChild);
      }
      blockquote.replaceWith(alertRoot);
    }
    return root.innerHTML;
  } catch {
    return html;
  }
}

function injectHeadingIdsIntoHtml(html: string): string {
  if (typeof window === 'undefined' || !html.trim()) return html;
  if (!/<h[1-6]\b/i.test(html)) return html;
  const cached = getCachedString(HEADING_HTML_CACHE, html);
  if (cached !== undefined) return cached;
  try {
    const doc = (sharedDomParser ?? new DOMParser()).parseFromString(
      `<div id="echo-md-headings">${html}</div>`,
      'text/html',
    );
    const root = doc.getElementById('echo-md-headings');
    if (!root) return html;
    const slugCounts = new Map<string, number>();
    root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
      if (el.id) return;
      const plain = el.textContent?.trim() || 'section';
      const base = slugifyMarkdownHeading(plain);
      const n = slugCounts.get(base) ?? 0;
      slugCounts.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      el.id = id;
    });
    return setCachedString(
      HEADING_HTML_CACHE,
      html,
      root.innerHTML,
      HTML_STAGE_CACHE_MAX,
    );
  } catch {
    return html;
  }
}

/** Headings for TOC UI (expanded markdown preview). Requires `injectHeadingIdsIntoHtml` output. */
export function extractMarkdownHeadingToc(
  html: string,
): { depth: number; id: string; text: string }[] {
  if (typeof window === 'undefined' || !html.trim()) return [];
  try {
    const doc = (sharedDomParser ?? new DOMParser()).parseFromString(
      `<div id="echo-md-toc">${html}</div>`,
      'text/html',
    );
    const root = doc.getElementById('echo-md-toc');
    if (!root) return [];
    const out: { depth: number; id: string; text: string }[] = [];
    root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
      const d = parseInt(el.tagName.slice(1), 10);
      if (!Number.isFinite(d)) return;
      const text = el.textContent?.trim() ?? '';
      if (!text) return;
      const id = el.id || slugifyMarkdownHeading(text);
      out.push({ depth: d, id, text });
    });
    return out;
  } catch {
    return [];
  }
}

export function parseMessageContent(
  text: string,
  mentions?: MentionEntity[],
  resolvers?: IdTokenResolvers,
  depth = 0,
): string {
  /**
   * Rendering pipeline invariants (order-sensitive):
   * 1) mentions/tokens/highlights and raw spoilers preprocess before markdown
   * 2) markdown parse runs before channel post-pass and spoiler reinjection
   * 3) KaTeX HTML injects before heading id pass + sanitize
   * 4) sanitize always runs before twemoji mutation
   */
  if (!text?.trim()) return '';
  if (depth > MAX_PARSE_MESSAGE_DEPTH) {
    return escapeForHighlight(text);
  }
  const resolverVersion = getResolverCacheVersion(resolvers);
  const useCache = depth === 0;
  if (useCache) {
    const cacheKey = parseMessageCacheKey(text, mentions, resolverVersion);
    const cached = PARSE_CACHE.get(cacheKey);
    if (cached !== undefined) return cached;
  }

  const spoilerPass = applyRawSpoilerExtraction(text, mentions);
  const textForMentions = spoilerPass?.text ?? text;
  const mentionsForMentions = spoilerPass?.outsideMentions ?? mentions;

  let rawHtml: string;
  let renderedMath: { token: string; html: string }[];

  const useMarkedBypass =
    depth === 0 && echoTextAllowsMarkedBypass(text, mentions, spoilerPass);

  if (useMarkedBypass) {
    const body = text.split('\n').map(escapeForHighlight).join('<br>');
    rawHtml = `<p>${body}</p>`;
    renderedMath = [];
  } else {
    const withMentions = preprocessMentionsAndTokens(
      textForMentions,
      mentionsForMentions,
      resolvers,
    );
    const withHighlights = preprocessHighlights(withMentions);
    const extractedMath = extractMarkdownMathRegions(withHighlights);
    if (extractedMath.regions.length > 0) {
      ensureKatexCssLoaded();
    }
    const latexCompatText = preprocessLatexTextCompat(extractedMath.text);
    renderedMath = extractedMath.regions.map((r) => ({
      token: r.token,
      html: renderKatexHtml(normalizeKatexInput(r.latex), r.displayMode),
    }));
    rawHtml = marked.parse(latexCompatText, { async: false }) as string;
    rawHtml = rawHtml
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&#34;/g, '"')
      .replace(/&quot;/gi, '"');
  }

  rawHtml = collapseNestedChannelMentionSpans(rawHtml);

  const shielded = shieldMentionSpansForMarkdownPass(rawHtml);
  rawHtml = shielded.html;
  const mentionSlots = shielded.slots;

  // Only convert plain `#name` segments to styled channel mentions if the message
  // actually contains a channel mention entity with the same label. This prevents
  // styling arbitrary `#words` as channels when the channel doesn't exist.
  const channelNameSegment = '[a-zA-Z0-9_\\-]+(?:\\s+[a-zA-Z0-9_\\-]+){0,12}';
  const channelRefRe = new RegExp(
    `>([^<]*?)#(${channelNameSegment})([^<]*?)<`,
    'g',
  );
  const channelLabels = new Set<string>(
    (mentions ?? [])
      .filter((m) => m.kind === 'channel')
      .map((m) => m.label.toLowerCase()),
  );
  rawHtml = rawHtml.replace(channelRefRe, (_, before, name, after) => {
    if (!channelLabels.has(name.toLowerCase()))
      return `>${before}#${escapeForHighlight(name)}${after}<`;
    return `>${before}<span class="mention mention--channel">#${escapeForHighlight(name)}</span>${after}<`;
  });

  rawHtml = collapseNestedChannelMentionSpans(rawHtml);
  rawHtml = unshieldMentionSpanSlots(rawHtml, mentionSlots);

  if (spoilerPass) {
    rawHtml = replaceSpoilerPlaceholdersInHtml(
      rawHtml,
      spoilerPass.slots,
      (inner, innerMentions) =>
        formatSpoilerInnerHtml(
          parseMessageContent(inner, innerMentions, resolvers, depth + 1),
        ),
    );
  } else {
    rawHtml = rawHtml.replace(
      /\|\|([\s\S]+?)\|\|/g,
      (_, m) => `<span class="spoiler">${m}</span>`,
    );
  }
  rawHtml = transformMarkdownAlertBlockquotes(rawHtml);
  rawHtml = injectRenderedMathRegions(rawHtml, renderedMath);
  rawHtml = injectHeadingIdsIntoHtml(rawHtml);
  const withExternalLinks = rawHtml.replace(
    /<a\s+href=/gi,
    '<a target="_blank" rel="noopener noreferrer" href=',
  );
  let sanitized = useMarkedBypass
    ? withExternalLinks
    : (() => {
        const cached = getCachedString(SANITIZE_HTML_CACHE, withExternalLinks);
        if (cached !== undefined) return cached;
        return setCachedString(
          SANITIZE_HTML_CACHE,
          withExternalLinks,
          DOMPurify.sanitize(withExternalLinks, SANITIZE_OPTS),
          HTML_STAGE_CACHE_MAX,
        );
      })();
  sanitized = sanitized
    .replace(/&amp;#39;/g, "'")
    .replace(/&amp;#x27;/gi, "'")
    .replace(/&amp;apos;/gi, "'");
  const twemojified = applyTwemojiOutsideKatex(sanitized);
  const out = DOMPurify.sanitize(twemojified, SANITIZE_OPTS);
  if (useCache) {
    const cacheKey = parseMessageCacheKey(text, mentions, resolverVersion);
    if (PARSE_CACHE.size >= PARSE_CACHE_MAX) {
      const first = PARSE_CACHE.keys().next().value as string | undefined;
      if (first !== undefined) PARSE_CACHE.delete(first);
    }
    PARSE_CACHE.set(cacheKey, out);
  }
  return out;
}

/** Vitest hooks — do not use in product code. */
export const markdownMentionPassTestOnly = {
  shieldMentionSpansForMarkdownPass,
  unshieldMentionSpanSlots,
  collapseNestedChannelMentionSpans,
  applyTwemojiOutsideKatex,
};

export function hasMarkdownSyntax(text: string | undefined): boolean {
  if (!text?.trim()) return false;
  return MARKDOWN_SYNTAX.test(text) || hasMarkdownMathRegions(text);
}
