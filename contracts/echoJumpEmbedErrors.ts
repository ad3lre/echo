/**
 * Failure metadata for in-app message jump link previews (`echoJump` embeds).
 */

import type { Embed } from './types/message';
import { parseEchoMessageJumpPath } from './echoMessageJumpPath';

export type EchoJumpEmbedErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'invalid_link'
  | 'embed_links_denied'
  | 'network_error';

const ERROR_MESSAGES: Record<EchoJumpEmbedErrorCode, string> = {
  not_found: 'That message was deleted or the link is invalid.',
  forbidden: "You don't have permission to view this message.",
  invalid_link: 'This is not a valid Echo message link.',
  embed_links_denied: 'Link previews are disabled in this channel.',
  network_error:
    "Couldn't load the message preview. Check your connection and try again.",
};

export function echoJumpErrorMessage(code: EchoJumpEmbedErrorCode): string {
  return ERROR_MESSAGES[code];
}

export function isEchoJumpEmbedResolved(embed: Embed): boolean {
  if (embed.echoJumpError) return true;
  return Boolean(embed.description?.trim());
}

/** Normalize jump URLs for dedupe / embed lookup (origin + pathname + search). */
export function normalizeEchoJumpUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${u.origin}${path}${u.search}`;
  } catch {
    return raw;
  }
}

export function buildEchoJumpErrorEmbed(
  originalUrl: string,
  parsed: { channelId: string; messageId: string },
  code: EchoJumpEmbedErrorCode,
): Embed {
  return {
    url: originalUrl,
    provider: 'Echo',
    title: 'Message link',
    description: echoJumpErrorMessage(code),
    color: 0xed4245,
    echoJump: {
      channelId: parsed.channelId,
      messageId: parsed.messageId,
    },
    echoJumpError: code,
  };
}

export function buildEchoJumpErrorEmbedFromUrl(
  originalUrl: string,
  code: EchoJumpEmbedErrorCode,
): Embed | null {
  const parsed = parseEchoMessageJumpPath(originalUrl);
  if (!parsed) return null;
  return buildEchoJumpErrorEmbed(originalUrl, parsed, code);
}
