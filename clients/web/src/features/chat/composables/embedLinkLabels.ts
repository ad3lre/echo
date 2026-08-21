import type { Embed } from '@shared/types';

/** Markdown link label: avoid breaking `]` / `(` in titles. */
function sanitizeLinkTitle(title: string): string {
  return title
    .replace(/\[/g, '')
    .replace(/\]/g, '')
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * When link previews exist, show the embed title in the message body instead of the raw URL.
 * Operates on plain text before markdown — URLs must match `embed.url` exactly.
 */
export function applyEmbedTitlesToMessageContent(
  content: string,
  embeds: Embed[] | undefined,
): string {
  if (!content || !embeds?.length) return content;
  const pairs = embeds
    .filter((e) => e.url?.trim() && e.title?.trim() && !e.echoJump)
    .map((e) => ({
      url: e.url!.trim(),
      title: sanitizeLinkTitle(e.title!.trim()),
    }))
    .filter((p) => p.title.length > 0)
    .sort((a, b) => b.url.length - a.url.length);
  let out = content;
  for (const { url, title } of pairs) {
    const re = new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    out = out.replace(re, `[${title}](${url})`);
  }
  return out;
}
