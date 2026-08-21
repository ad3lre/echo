import {
  resolveCustomEmojiImageUrlForDisplay,
  shouldAllowDiscordCdnGuessForEmojiId,
} from '@/features/chat/emoji/customEmojiUrl';
import { sanitizeCustomEmojiInlineHtmlForVHtml } from '@/features/chat/emoji/sanitizeEmojiImgHtmlForVHtml';
import { parseSingleEmoji } from '@/features/chat/emoji/twemoji';

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

export type CustomEmojiInlineAttrs = {
  id: string;
  name: string;
  animated: boolean;
};

/** Skeleton placeholder while a custom emoji URL is still resolving. */
export function renderCustomEmojiPendingInlineHtml(
  attrs: CustomEmojiInlineAttrs,
  opts?: { interactive?: boolean },
): string {
  const token = `:${attrs.name}:`;
  const id = escReactionAttr(attrs.id);
  const name = escReactionAttr(attrs.name);
  const animated = attrs.animated ? 'true' : 'false';
  const interactive = opts?.interactive !== false;
  const classes = interactive
    ? 'custom-emoji-inline custom-emoji-inline--pending mention mention--custom-emoji id-token'
    : 'custom-emoji-inline custom-emoji-inline--pending';
  const roleAttrs = interactive ? ' tabindex="0" role="button"' : ' role="img"';
  return `<span class="${classes}" data-emoji-id="${id}" data-emoji-name="${name}" data-emoji-animated="${animated}" aria-label="${escReactionAttr(token)}"${roleAttrs}><span class="custom-emoji-skeleton" aria-hidden="true"></span></span>`;
}

/** Skeleton + image while the custom emoji asset decodes. */
export function renderCustomEmojiLoadingInlineHtml(
  attrs: CustomEmojiInlineAttrs,
  url: string,
  opts?: { tryIndex?: number },
): string {
  const token = `:${attrs.name}:`;
  const id = escReactionAttr(attrs.id);
  const name = escReactionAttr(attrs.name);
  const animated = attrs.animated ? 'true' : 'false';
  const safeUrl = escReactionAttr(url);
  const tryIndex = opts?.tryIndex ?? 0;
  return `<span class="custom-emoji-inline custom-emoji-inline--loading" role="img" aria-label="${escReactionAttr(token)}" data-emoji-id="${id}" data-emoji-name="${name}" data-emoji-animated="${animated}"><span class="custom-emoji-skeleton" aria-hidden="true"></span><img class="emoji custom-emoji custom-emoji--pending-load" draggable="false" alt="${escReactionAttr(token)}" title="${escReactionAttr(token)}" src="${safeUrl}" data-emoji-id="${id}" data-emoji-name="${name}" data-emoji-animated="${animated}" data-emoji-src-try="${tryIndex}" loading="lazy" decoding="async"/></span>`;
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
        allowDiscordCdnGuess:
          opts?.allowDiscordCdnGuess ??
          shouldAllowDiscordCdnGuessForEmojiId(
            custom.id,
            opts?.cachedById,
            echoMissed,
          ),
      },
    );
    if (url) {
      return sanitizeCustomEmojiInlineHtmlForVHtml(
        renderCustomEmojiLoadingInlineHtml(custom, url),
      );
    }
    opts?.ensureEmojiId?.(custom.id);
    return sanitizeCustomEmojiInlineHtmlForVHtml(
      renderCustomEmojiPendingInlineHtml(custom, { interactive: false }),
    );
  }
  return parseSingleEmoji(emoji);
}
