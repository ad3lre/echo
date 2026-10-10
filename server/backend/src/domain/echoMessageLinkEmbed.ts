/**
 * Resolves pasted in-app message URLs (`/channels/:channelId/:messageId`) into rich link embeds
 * for chat (author + channel + snippet). Validates channel_id ↔ message_id against the DB.
 */

import type pg from 'pg';
import type { Embed } from '../../../../contracts/types';
import { parseEchoMessageJumpPath as parseJumpPath } from '../../../../contracts/echoMessageJumpPath';
import { getInstancePolicy } from '../config/instancePolicy';

/** Remove content from historical shared previews as they leave persistence. */
export function neutralizeSharedJumpEmbeds(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((embed: unknown) => {
    if (!embed || typeof embed !== 'object' || !('echoJump' in embed))
      return embed;
    const { echoJump, url } = embed as { echoJump: unknown; url?: unknown };
    return { url, echoJump, provider: 'Echo', title: 'Message link' };
  });
}

export function parseEchoMessageJumpPath(url: string) {
  const { app, api } = getInstancePolicy().general.publicUrls;
  return parseJumpPath(url, [app, api]);
}
export {
  buildEchoJumpErrorEmbed,
  buildEchoJumpErrorEmbedFromUrl,
  echoJumpErrorMessage,
  isEchoJumpEmbedResolved,
  normalizeEchoJumpUrl,
  type EchoJumpEmbedErrorCode,
} from '../../../../contracts/echoJumpEmbedErrors';

/** Shared cards contain only IDs from the URL; viewers fetch authorized previews. */
export async function buildEchoJumpEmbedFromUrl(
  _pool: pg.Pool,
  _viewerUserId: string,
  originalUrl: string,
): Promise<Embed | null> {
  const parsed = parseEchoMessageJumpPath(originalUrl);
  if (!parsed) return null;
  return {
    url: originalUrl,
    provider: 'Echo',
    title: 'Message link',
    echoJump: parsed,
  };
}
