import {
  linkTokenCustomEmoji,
  linkTokenCustomEmojiAnimated,
  linkTokenAppIcon,
} from '@/utils/idTokens';
import type { EmojiEntry } from '@/composables/useEmojiData';

/** Linkable custom emoji token: <:name:id> or <a:name:id> (animated) */
const DISCORD_CUSTOM = /^<a?:([^:>]+):(\d+)>$/;

/**
 * Clipboard value for reactions / inline emoji tokens (custom or unicode).
 * Prefers linkable <:name:id>; snowflake-only → <:emoji:id>.
 */
export function emojiReactionDevCopyValue(emoji: string): string {
  const t = emoji.trim();
  const m = t.match(DISCORD_CUSTOM);
  if (m) return linkTokenCustomEmoji(m[1], m[2]);
  if (/^\d{17,}$/.test(t)) return linkTokenCustomEmoji('emoji', t);
  return t;
}

/** Unicode picker entries: stable slug (e.g. `grinning-face`) is the usual “id”. */
export function emojiPickerDevCopyValue(entry: EmojiEntry): string {
  if (entry.kind === 'appIcon' && entry.iconFilename) {
    return linkTokenAppIcon(entry.iconFilename);
  }
  if (entry.kind === 'custom' && entry.id) {
    return entry.animated
      ? linkTokenCustomEmojiAnimated(entry.name, entry.id)
      : linkTokenCustomEmoji(entry.name, entry.id);
  }
  const slug = entry.slug?.trim();
  if (slug) return slug;
  return entry.emoji;
}
