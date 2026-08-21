import type { EmojiEntry } from '@/features/chat/emoji/emojiTypes';
import {
  ensureEmojiCategoriesLoaded,
  getEmojiCategories,
} from '@/features/chat/emoji/useEmojiData';
import type { EchoEmojiLibraryEmojiApi } from '@/api/echo/types';
import { renderSingleEmojiHtml } from '@/features/chat/emoji/customEmojiDisplay';
import { safeCustomEmojiUrl } from '@/features/chat/emoji/customEmojiUrl';
import {
  linkTokenCustomEmoji,
  linkTokenCustomEmojiAnimated,
} from '@/features/layout/ids/idTokens';
import type { EmojiInspectAnchor } from '@/features/chat/emoji/emojiInspectTarget';

export type EmojiInspectInfo = {
  kind: 'unicode' | 'custom';
  previewHtml: string;
  shortcode: string;
  title: string;
  subtitle?: string;
  animated?: boolean;
};

export type EmojiInspectResolveContext = {
  serverId?: string;
  serverName?: string;
  emojiById: ReadonlyMap<
    string,
    EchoEmojiLibraryEmojiApi & { serverId: string }
  >;
  userEmojiById: ReadonlyMap<
    string,
    { id: string; name: string; animated: boolean; imageUrl: string }
  >;
  packNameByEmojiId: ReadonlyMap<string, string>;
  customEmojiUrlById: ReadonlyMap<string, string>;
};

let unicodeEntryByGlyph: Map<string, EmojiEntry> | null = null;

function rebuildUnicodeLookup(): void {
  unicodeEntryByGlyph = new Map();
  for (const cat of getEmojiCategories()) {
    for (const e of cat.emojis) {
      if (!unicodeEntryByGlyph.has(e.emoji)) {
        unicodeEntryByGlyph.set(e.emoji, e);
      }
    }
  }
}

function lookupUnicodeEntry(emoji: string): EmojiEntry | undefined {
  if (!unicodeEntryByGlyph) rebuildUnicodeLookup();
  return unicodeEntryByGlyph!.get(emoji);
}

function formatEmojiTitle(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildCustomPreviewHtml(
  anchor: Extract<EmojiInspectAnchor, { kind: 'custom' }>,
  ctx: EmojiInspectResolveContext,
): string {
  const url = ctx.customEmojiUrlById.get(anchor.id);
  const token = anchor.animated
    ? linkTokenCustomEmojiAnimated(anchor.name, anchor.id)
    : linkTokenCustomEmoji(anchor.name, anchor.id);
  return renderSingleEmojiHtml(token, {
    cachedById: url ? new Map([[anchor.id, url]]) : undefined,
    allowDiscordCdnGuess: true,
  });
}

export async function resolveEmojiInspectInfo(
  anchor: EmojiInspectAnchor,
  ctx: EmojiInspectResolveContext,
): Promise<EmojiInspectInfo | null> {
  if (anchor.kind === 'unicode') {
    await ensureEmojiCategoriesLoaded();
    rebuildUnicodeLookup();
    const entry = lookupUnicodeEntry(anchor.emoji);
    const shortcode = entry ? `:${entry.slug}:` : anchor.emoji;
    const title = entry ? formatEmojiTitle(entry.name) : 'Emoji';
    return {
      kind: 'unicode',
      previewHtml: renderSingleEmojiHtml(anchor.emoji),
      shortcode,
      title,
    };
  }

  const row = ctx.emojiById.get(anchor.id) ?? ctx.userEmojiById.get(anchor.id);
  const name = row?.name ?? anchor.name;
  const animated = row?.animated ?? anchor.animated;
  const packName = ctx.packNameByEmojiId.get(anchor.id);
  let subtitle: string | undefined;
  if (packName) {
    subtitle = `From ${packName}`;
  } else if (ctx.serverName?.trim()) {
    subtitle = `From ${ctx.serverName.trim()}`;
  } else if (
    row &&
    'serverId' in row &&
    typeof row.serverId === 'string' &&
    row.serverId !== 'global'
  ) {
    subtitle = 'Custom emoji';
  }

  const imageUrl =
    (row && safeCustomEmojiUrl(row.imageUrl)) ||
    ctx.customEmojiUrlById.get(anchor.id);
  if (imageUrl && row) {
    const token = animated
      ? linkTokenCustomEmojiAnimated(name, anchor.id)
      : linkTokenCustomEmoji(name, anchor.id);
    return {
      kind: 'custom',
      previewHtml: renderSingleEmojiHtml(token, {
        cachedById: new Map([[anchor.id, imageUrl]]),
      }),
      shortcode: `:${name}:`,
      title: name,
      subtitle,
      animated,
    };
  }

  return {
    kind: 'custom',
    previewHtml: buildCustomPreviewHtml(anchor, ctx),
    shortcode: `:${name}:`,
    title: name,
    subtitle,
    animated,
  };
}

/** @internal test helper */
export function resetUnicodeEmojiInspectLookupForTests(): void {
  unicodeEntryByGlyph = null;
}
