import type pg from 'pg';
import {
  getCachedChannelMeta,
  getEchoChannelMetaGeneration,
  setCachedChannelMeta,
  type EchoChannelMeta,
} from '../echoChannelMetaCache';
import { echoChannelMetaCacheTotal } from '../../observability/echoMetrics';
import { createKeyedCoalescer } from '../../shared/keyedCoalescer';

/** Concurrent cold loads for the same channel share one query (review §6). */
const channelMetaCoalescer = createKeyedCoalescer<EchoChannelMeta | null>();

/**
 * Hot channel metadata for the send path, cached in-process (see `echoChannelMetaCache`).
 * One SELECT serves what were several per-send `echo_channels` reads (existence, type +
 * slowmode, message format, forum/parent context). The fill is generation-bracketed: if an
 * invalidation lands during the DB read, the result is not stored (cannot repopulate stale).
 */
export async function getEchoChannelMeta(
  pool: pg.Pool,
  channelId: string,
): Promise<EchoChannelMeta | null> {
  const cached = getCachedChannelMeta(channelId);
  if (cached) {
    echoChannelMetaCacheTotal.inc({ outcome: 'hit' });
    return cached;
  }
  echoChannelMetaCacheTotal.inc({ outcome: 'miss' });
  return channelMetaCoalescer.run(channelId, () =>
    loadEchoChannelMeta(pool, channelId),
  );
}

async function loadEchoChannelMeta(
  pool: pg.Pool,
  channelId: string,
): Promise<EchoChannelMeta | null> {
  const startGen = getEchoChannelMetaGeneration();
  const r = await pool.query(
    `SELECT server_id, type, category_id, parent_channel_id,
            COALESCE(slowmode_seconds, 0) AS slowmode_seconds,
            COALESCE(message_format_template, '') AS message_format_template,
            message_format_hard
     FROM echo_channels WHERE id = $1 LIMIT 1`,
    [channelId],
  );
  const row = r.rows[0] as
    | {
        server_id?: unknown;
        type?: unknown;
        category_id?: unknown;
        parent_channel_id?: unknown;
        slowmode_seconds?: unknown;
        message_format_template?: unknown;
        message_format_hard?: unknown;
      }
    | undefined;
  if (!row) return null;

  const meta: EchoChannelMeta = {
    serverId:
      row.server_id != null && String(row.server_id).trim()
        ? String(row.server_id)
        : null,
    type: String(row.type ?? ''),
    categoryId:
      row.category_id != null && String(row.category_id).trim()
        ? String(row.category_id)
        : null,
    parentChannelId:
      row.parent_channel_id != null && String(row.parent_channel_id).trim()
        ? String(row.parent_channel_id)
        : null,
    slowmodeSeconds: Number(row.slowmode_seconds ?? 0),
    messageFormatTemplate: String(row.message_format_template ?? ''),
    messageFormatHard: row.message_format_hard === true,
  };

  if (getEchoChannelMetaGeneration() === startGen) {
    setCachedChannelMeta(channelId, meta);
  }
  return meta;
}
