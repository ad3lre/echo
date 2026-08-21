/**
 * Defense-in-depth for `v-html` that is **not** produced by `parseMessageContent` (markdown already runs
 * through DOMPurify in messageBodyMarkdown). Use for Twemoji `<img>` snippets and similar small HTML.
 *
 * Inventory of `v-html` pipelines:
 * - Message body / composer preview: `parseMessageContent` → DOMPurify + twemoji (canonical).
 * - Emoji-only snippets: `parseSingleEmoji` / `parseTwemoji` → this sanitizer (see twemoji.ts).
 * - Picker `entry.html` / `navIconHtml`: built via same Twemoji helpers or server emoji HTML validated by
 *   `isSafeHtml` in useEmojiData; re-sanitize at render if content can change without that path.
 */
import DOMPurify from 'dompurify';
import { domPurifyHtmlFragment } from '@/features/chat/markdown/domPurifyHtmlFragment';

export function sanitizeEmojiImgHtmlForVHtml(html: string): string {
  return domPurifyHtmlFragment(
    html,
    {
      ALLOWED_TAGS: ['img'],
      ALLOWED_ATTR: [
        'class',
        'draggable',
        'alt',
        'src',
        'loading',
        'data-echo-unicode-emoji',
      ],
    },
    'echo-emoji-sanitize-root',
  );
}

/** Custom emoji inline shells (skeleton + img) for reaction pills and similar `v-html`. */
export function sanitizeCustomEmojiInlineHtmlForVHtml(html: string): string {
  return domPurifyHtmlFragment(
    html,
    {
      ALLOWED_TAGS: ['span', 'img'],
      ALLOWED_ATTR: [
        'class',
        'draggable',
        'alt',
        'title',
        'src',
        'loading',
        'decoding',
        'role',
        'aria-label',
        'aria-hidden',
        'tabindex',
        'data-emoji-id',
        'data-emoji-name',
        'data-emoji-animated',
        'data-emoji-src-try',
      ],
    },
    'echo-custom-emoji-inline-sanitize-root',
  );
}
