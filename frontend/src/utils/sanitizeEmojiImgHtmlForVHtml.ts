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

export function sanitizeEmojiImgHtmlForVHtml(html: string): string {
  return DOMPurify.sanitize(html.trim(), {
    ALLOWED_TAGS: ['img'],
    ALLOWED_ATTR: [
      'class',
      'draggable',
      'alt',
      'src',
      'loading',
      'data-echo-unicode-emoji',
    ],
  });
}
