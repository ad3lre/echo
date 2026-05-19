import type pg from 'pg';
import {
  ECHO_MESSAGE_DELETED_COMPLIANCE_RETENTION_DAYS,
  parseEchoMessageAutoDeleteSeconds,
} from '../../../../shared/messageAutoDelete';

export type EchoChannelAutoDeleteEffective = {
  channelId: string;
  serverId: string;
  effectiveSeconds: number;
};

/** Resolve per-channel TTL: category value when synced, else channel value. */
export function resolveEchoChannelAutoDeleteSeconds(row: {
  auto_delete_synced_to_category?: boolean | null;
  channel_auto_delete_after_seconds?: number | null;
  category_auto_delete_after_seconds?: number | null;
}): number | null {
  const synced = row.auto_delete_synced_to_category !== false;
  const raw = synced
    ? row.category_auto_delete_after_seconds
    : row.channel_auto_delete_after_seconds;
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export async function listEchoChannelsWithEffectiveAutoDelete(
  pool: pg.Pool,
): Promise<EchoChannelAutoDeleteEffective[]> {
  const r = await pool.query(
    `
    SELECT ch.id AS channel_id, ch.server_id,
           COALESCE(fp.auto_delete_synced_to_category, ch.auto_delete_synced_to_category)
             AS auto_delete_synced_to_category,
           COALESCE(fp.auto_delete_after_seconds, ch.auto_delete_after_seconds)
             AS channel_auto_delete_after_seconds,
           CASE
             WHEN fp.id IS NOT NULL THEN fcat.auto_delete_after_seconds
             ELSE cat.auto_delete_after_seconds
           END AS category_auto_delete_after_seconds
    FROM echo_channels ch
    LEFT JOIN echo_channels fp
      ON fp.id = ch.parent_channel_id AND fp.type = 'forum'
    LEFT JOIN echo_categories cat
      ON cat.id = ch.category_id AND cat.server_id = ch.server_id
    LEFT JOIN echo_categories fcat
      ON fcat.id = fp.category_id AND fcat.server_id = fp.server_id
    WHERE ch.type IN ('text', 'forum')
    `,
  );
  const out: EchoChannelAutoDeleteEffective[] = [];
  for (const row of r.rows) {
    const effectiveSeconds = resolveEchoChannelAutoDeleteSeconds(row);
    if (effectiveSeconds == null) continue;
    out.push({
      channelId: String(row.channel_id),
      serverId: String(row.server_id),
      effectiveSeconds,
    });
  }
  return out;
}

export function parseAutoDeleteAfterSecondsPatch(
  raw: unknown,
): number | null | undefined {
  return parseEchoMessageAutoDeleteSeconds(raw);
}

export { ECHO_MESSAGE_DELETED_COMPLIANCE_RETENTION_DAYS };
