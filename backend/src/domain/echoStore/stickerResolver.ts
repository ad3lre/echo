/**
 * Server-side sticker resolver: validates that a set of client-supplied sticker ids
 * belong to the given server's library and returns canonical MessageStickerPayload objects
 * built from stored data (never trusting client-supplied URLs/names/formats).
 */
import type pg from 'pg';
import type { MessageStickerFormat, MessageStickerPayload } from '../../../../shared/types';
import { getEchoChannelServerId } from './access';

const VALID_STICKER_FORMATS = new Set<string>(['png', 'apng', 'gif', 'lottie']);

export type ResolveStickerIdsResult =
  | { ok: true; stickers: MessageStickerPayload[] }
  | { ok: false; error: string };

/**
 * Resolve a list of sticker ids for a channel into MessageStickerPayload objects.
 * - Looks up the server for the channel.
 * - Queries echo_server_custom_emojis WHERE expression_kind = 'sticker' AND id IN (...).
 * - Rejects if any id is not found or belongs to a different server.
 */
export async function resolveStickerIdsForChannel(
  pool: pg.Pool,
  channelId: string,
  stickerIds: string[],
): Promise<ResolveStickerIdsResult> {
  if (!stickerIds.length) return { ok: true, stickers: [] };

  const serverId = await getEchoChannelServerId(pool, channelId);
  if (!serverId) {
    return { ok: false, error: 'Channel not found' };
  }

  const rows = await pool.query<{
    id: string;
    name: string;
    image_url: string;
    sticker_format: string | null;
  }>(
    `SELECT id, name, image_url, sticker_format
     FROM echo_server_custom_emojis
     WHERE server_id = $1
       AND expression_kind = 'sticker'
       AND id = ANY($2::text[])`,
    [serverId, stickerIds],
  );

  if (rows.rows.length !== stickerIds.length) {
    const foundIds = new Set(rows.rows.map((r) => r.id));
    const missing = stickerIds.find((id) => !foundIds.has(id));
    return {
      ok: false,
      error: `Sticker not found or not available in this server: ${missing ?? 'unknown'}`,
    };
  }

  // Return in the same order as the input ids.
  const byId = new Map(rows.rows.map((r) => [r.id, r]));
  const stickers: MessageStickerPayload[] = stickerIds.map((id) => {
    const row = byId.get(id)!;
    const fmt = row.sticker_format ?? 'png';
    const format: MessageStickerFormat = VALID_STICKER_FORMATS.has(fmt)
      ? (fmt as MessageStickerFormat)
      : 'png';
    return {
      id: row.id,
      name: row.name,
      format,
      url: row.image_url,
    };
  });

  return { ok: true, stickers };
}
