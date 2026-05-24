import { resolveCustomEmojiImageUrlForDisplay } from '@/utils/customEmojiUrl';
import { sanitizeEmojiImgHtmlForVHtml } from '@/utils/sanitizeEmojiImgHtmlForVHtml';
import { parseSingleEmoji } from '@/utils/twemoji';

/** Discord custom emoji token embedded in message content or reactions. */
export const CUSTOM_EMOJI_TOKEN_IN_TEXT_RE = /<a?:([^:>]+):([\w.-]{1,128})>/g;

/** Whole-string custom emoji (reactions, poll options). */
export const CUSTOM_EMOJI_TOKEN_WHOLE_RE = /^<a?:([^:>]+):([\w.-]{1,128})>$/;

const APP_ICON_TOKEN_IN_TEXT_RE = /<icon:([^>\n]{1,200})>/g;

export type ParsedCustomEmojiToken = {
  id: string;
  name: string;
  animated: boolean;
};

export function parseCustomEmojiToken(
  emoji: string,
): ParsedCustomEmojiToken | null {
  const m = emoji.trim().match(CUSTOM_EMOJI_TOKEN_WHOLE_RE);
  if (!m) return null;
  return {
    id: m[2]!,
    name: m[1]!,
    animated: m[0].startsWith('<a:'),
  };
}

/** Discord-style display fallback: `<:name:id>` → `:name:`. */
export function customEmojiTokensToShortcodes(text: string): string {
  return text.replace(
    CUSTOM_EMOJI_TOKEN_IN_TEXT_RE,
    (_match, name: string) => `:${name}:`,
  );
}

/** Echo app icon tokens → `:slug:` (matches composer plain-text serialization). */
export function appIconTokensToShortcodes(text: string): string {
  return text.replace(APP_ICON_TOKEN_IN_TEXT_RE, (_match, filename: string) => {
    const stem = String(filename)
      .replace(/\.svg$/i, '')
      .trim();
    const slug = stem.replace(/\s+/g, '_').toLowerCase();
    return slug ? `:${slug}:` : ':icon:';
  });
}

/** Plain-text preview body with Discord-style `:name:` instead of wire tokens. */
export function plainTextWithDisplayShortcodes(text: string): string {
  return appIconTokensToShortcodes(customEmojiTokensToShortcodes(text));
}

function escReactionAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export type RenderSingleEmojiHtmlOpts = {
  cachedById?: ReadonlyMap<string, string> | null;
  echoResolveMissed?: (id: string) => boolean;
  ensureEmojiId?: (id: string) => void;
  allowDiscordCdnGuess?: boolean;
};

/**
 * Render one emoji string (unicode, custom token, or app icon token) as safe HTML
 * for reaction pills, hover cards, and similar single-glyph surfaces.
 */
export function renderSingleEmojiHtml(
  emoji: string,
  opts?: RenderSingleEmojiHtmlOpts,
): string {
  const custom = parseCustomEmojiToken(emoji);
  if (custom) {
    const echoMissed = opts?.echoResolveMissed?.(custom.id) ?? false;
    const url = resolveCustomEmojiImageUrlForDisplay(
      custom.id,
      custom.animated,
      opts?.cachedById,
      echoMissed,
      {
        allowDiscordCdnGuess: opts?.allowDiscordCdnGuess ?? echoMissed,
      },
    );
    if (url) {
      const raw = `<img class="emoji custom-emoji" draggable="false" alt="${escReactionAttr(`:${custom.name}:`)}" src="${escReactionAttr(url)}"/>`;
      return sanitizeEmojiImgHtmlForVHtml(raw);
    }
    opts?.ensureEmojiId?.(custom.id);
    return escReactionAttr(`:${custom.name}:`);
  }
  return parseSingleEmoji(emoji);
}
