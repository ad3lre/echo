import DOMPurify from 'dompurify';
import { parseDiscordEmbedMarkdownToHtml } from '@shared/discordEmbedMarkdown';

const EMBED_MD_PURIFY = {
  ALLOWED_TAGS: ['strong', 'em', 'u', 's', 'code', 'pre', 'span', 'br'],
  ALLOWED_ATTR: ['class'],
};

/** Sanitized Discord embed markdown HTML for `v-html` in embed cards. */
export function renderDiscordEmbedMarkdownHtml(
  text: string | undefined,
): string {
  if (!text?.trim()) return '';
  const raw = parseDiscordEmbedMarkdownToHtml(text);
  return String(DOMPurify.sanitize(raw, EMBED_MD_PURIFY));
}
