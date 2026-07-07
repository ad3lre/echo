import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import { markChatUploadRetentionPurged } from './chatUploadRetention';
import { echoUploadObjectExists } from './echoUploadObjectVerify';

export type OrphanedChatUploadRetentionCandidate = {
  storageKey: string;
  purgeStatus: string;
};

export async function listActiveChatUploadRetentionKeys(
  pool: pg.Pool,
  opts?: { prefix?: string; limit?: number },
): Promise<OrphanedChatUploadRetentionCandidate[]> {
  const prefix = opts?.prefix?.trim() ?? '';
  const limit =
    opts?.limit != null && Number.isFinite(opts.limit) && opts.limit > 0
      ? Math.floor(opts.limit)
      : null;

  const params: unknown[] = [];
  let where = `WHERE purge_status IN ('active', 'failed')`;
  if (prefix) {
    params.push(`${prefix}%`);
    where += ` AND storage_key LIKE $${params.length}`;
  }

  const limitSql = limit != null ? ` LIMIT ${limit}` : '';
  const { rows } = await pool.query<{
    storage_key: string;
    purge_status: string;
  }>(
    `SELECT storage_key, purge_status
     FROM echo_chat_upload_retention
     ${where}
     ORDER BY created_at ASC${limitSql}`,
    params,
  );

  return rows.map((row) => ({
    storageKey: row.storage_key,
    purgeStatus: row.purge_status,
  }));
}

async function deleteServedContentTypeRow(
  pool: pg.Pool,
  storageKey: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM echo_upload_served_content_type WHERE storage_key = $1`,
    [storageKey.trim()],
  );
}

export async function purgeOrphanedChatUploadRetentionKey(
  pool: pg.Pool,
  storageKey: string,
  opts: { execute: boolean; log?: FastifyBaseLogger },
): Promise<'purged' | 'exists' | 'skipped'> {
  const key = storageKey.trim();
  if (!key) return 'skipped';

  const presence = await echoUploadObjectExists(key);
  if (presence === 'not_configured') {
    throw new Error('upload_storage_not_configured');
  }
  if (presence === 'exists') {
    return 'exists';
  }

  if (!opts.execute) {
    return 'purged';
  }

  await markChatUploadRetentionPurged(pool, key);
  await deleteServedContentTypeRow(pool, key);
  opts.log?.info(
    {
      storageKeyHead: key.slice(0, 48),
      msg: 'chat_upload_retention.orphan_purged',
    },
    'Marked orphaned chat upload retention row purged',
  );
  return 'purged';
}

export async function runOrphanedChatUploadRetentionPurge(
  pool: pg.Pool,
  opts: {
    execute: boolean;
    prefix?: string;
    limit?: number;
    log?: FastifyBaseLogger;
  },
): Promise<{
  scanned: number;
  purged: number;
  present: number;
  skipped: number;
}> {
  const rows = await listActiveChatUploadRetentionKeys(pool, {
    prefix: opts.prefix,
    limit: opts.limit,
  });

  let purged = 0;
  let present = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const outcome = await purgeOrphanedChatUploadRetentionKey(
        pool,
        row.storageKey,
        { execute: opts.execute, log: opts.log },
      );
      if (outcome === 'purged') purged += 1;
      else if (outcome === 'exists') present += 1;
      else skipped += 1;
    } catch (err) {
      skipped += 1;
      opts.log?.warn(
        {
          storageKeyHead: row.storageKey.slice(0, 48),
          err: err instanceof Error ? err.message : String(err),
          msg: 'chat_upload_retention.orphan_purge_failed',
        },
        'Failed to evaluate orphaned chat upload retention row',
      );
    }
  }

  return { scanned: rows.length, purged, present, skipped };
}
