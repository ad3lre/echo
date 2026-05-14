import type pg from 'pg';

type PgQueryable = Pick<pg.Pool, 'query'>;
import { nextEchoSnowflakeId } from '../echoSnowflake';
import { invalidateEchoPermissionCacheForServer } from '../echoPermissionCache';
import {
  getEffectiveChannelPermissions,
  getMergedRolePermissions,
} from './permissions';

export type MoveOutOfCategoryPermissionMode = 'sync' | 'keep';

function normalizeCategoryId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  return t === '' ? null : t;
}

function categoryIdsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeCategoryId(a) === normalizeCategoryId(b);
}

async function listBucketChannelIds(
  q: PgQueryable,
  serverId: string,
  categoryId: string | null,
): Promise<string[]> {
  const r =
    categoryId === null
      ? await q.query(
          `SELECT id FROM echo_channels WHERE server_id = $1 AND category_id IS NULL ORDER BY position ASC, id ASC`,
          [serverId],
        )
      : await q.query(
          `SELECT id FROM echo_channels WHERE server_id = $1 AND category_id = $2 ORDER BY position ASC, id ASC`,
          [serverId, categoryId],
        );
  return r.rows.map((row: Record<string, unknown>) => String(row.id));
}

async function writeBucketPositions(
  client: pg.PoolClient,
  serverId: string,
  categoryId: string | null,
  orderedIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i += 1) {
    const id = orderedIds[i]!;
    if (categoryId === null) {
      await client.query(
        `UPDATE echo_channels SET position = $1, category_id = NULL WHERE id = $2 AND server_id = $3`,
        [i, id, serverId],
      );
    } else {
      await client.query(
        `UPDATE echo_channels SET position = $1, category_id = $2 WHERE id = $3 AND server_id = $4`,
        [i, categoryId, id, serverId],
      );
    }
  }
}

async function copyCategoryOverwriteRowsToChannel(
  client: pg.PoolClient,
  serverId: string,
  channelId: string,
  sourceCategoryId: string,
): Promise<void> {
  await client.query(
    `DELETE FROM echo_channel_permission_overwrite_rows WHERE server_id = $1 AND channel_id = $2`,
    [serverId, channelId],
  );
  const src = await client.query(
    `SELECT target_type, target_id, partial
     FROM echo_category_permission_overwrite_rows
     WHERE server_id = $1 AND category_id = $2
     ORDER BY id ASC`,
    [serverId, sourceCategoryId],
  );
  for (const row of src.rows as Record<string, unknown>[]) {
    const newId = nextEchoSnowflakeId();
    await client.query(
      `INSERT INTO echo_channel_permission_overwrite_rows (id, server_id, channel_id, target_type, target_id, partial)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        newId,
        serverId,
        channelId,
        String(row.target_type),
        row.target_id != null ? String(row.target_id) : null,
        JSON.stringify(row.partial ?? {}),
      ],
    );
  }
  await client.query(
    `UPDATE echo_channels SET permission_overrides = NULL WHERE id = $1 AND server_id = $2`,
    [channelId, serverId],
  );
}

export type ApplyEchoChannelPlacementInput = {
  /** Omit to keep the channel in its current category bucket. */
  targetCategoryId?: string | null;
  /**
   * 0-based index in the target bucket after the move.
   * When changing category and omitted, the channel is appended at the end of the target bucket.
   */
  siblingIndex?: number;
  /**
   * Required when moving from a category to uncategorized (null category).
   * Optional when moving between categories: `sync` copies the destination category’s permission
   * overwrite rows onto the channel; omitted/`keep` leaves channel rows unchanged.
   */
  moveOutOfCategoryPermission?: MoveOutOfCategoryPermissionMode;
};

/**
 * Reorder and/or move a channel between category buckets (compact `position` within parent).
 * Caller must still run other `patchEchoChannel` column updates separately if needed.
 */
export async function applyEchoChannelPlacement(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  channelId: string,
  input: ApplyEchoChannelPlacementInput,
): Promise<'ok' | 'forbidden' | 'not_found' | 'invalid_body'> {
  const merged = await getMergedRolePermissions(pool, serverId, actorId);
  if (!merged.has('MANAGE_ROLES') && !merged.has('MANAGE_GUILD')) {
    const effective = await getEffectiveChannelPermissions(
      pool,
      serverId,
      actorId,
      channelId,
    );
    if (!effective.has('MANAGE_CHANNELS')) {
      return 'forbidden';
    }
  }

  const chQ = await pool.query(
    `SELECT id, category_id FROM echo_channels WHERE id = $1 AND server_id = $2`,
    [channelId, serverId],
  );
  if (chQ.rows.length === 0) return 'not_found';
  const oldCat = normalizeCategoryId(
    chQ.rows[0].category_id as string | null | undefined,
  );

  const newCat =
    input.targetCategoryId !== undefined
      ? normalizeCategoryId(input.targetCategoryId)
      : oldCat;

  if (newCat !== null) {
    const catOk = await pool.query(
      `SELECT 1 FROM echo_categories WHERE id = $1 AND server_id = $2`,
      [newCat, serverId],
    );
    if (catOk.rows.length === 0) return 'invalid_body';
  }

  const categoryChanging = !categoryIdsEqual(newCat, oldCat);
  if (oldCat !== null && newCat === null) {
    const mode = input.moveOutOfCategoryPermission;
    if (mode !== 'sync' && mode !== 'keep') return 'invalid_body';
  }

  let siblingIndex = input.siblingIndex;
  if (siblingIndex === undefined) {
    if (categoryChanging) {
      const destBefore = await listBucketChannelIds(pool, serverId, newCat);
      siblingIndex = destBefore.filter((id) => id !== channelId).length;
    } else {
      return 'invalid_body';
    }
  }

  if (
    typeof siblingIndex !== 'number' ||
    !Number.isFinite(siblingIndex) ||
    siblingIndex < 0 ||
    siblingIndex !== Math.floor(siblingIndex)
  ) {
    return 'invalid_body';
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const oldBucket = await listBucketChannelIds(
      client as unknown as pg.Pool,
      serverId,
      oldCat,
    );
    if (!oldBucket.includes(channelId)) {
      await client.query('ROLLBACK');
      return 'not_found';
    }

    if (categoryIdsEqual(newCat, oldCat)) {
      const without = oldBucket.filter((id) => id !== channelId);
      const clamped = Math.min(siblingIndex, without.length);
      const nextOrder = [
        ...without.slice(0, clamped),
        channelId,
        ...without.slice(clamped),
      ];
      await writeBucketPositions(client, serverId, oldCat, nextOrder);
    } else {
      const oldWithout = oldBucket.filter((id) => id !== channelId);
      await writeBucketPositions(client, serverId, oldCat, oldWithout);

      const destBefore = await listBucketChannelIds(client, serverId, newCat);
      const destWithout = destBefore.filter((id) => id !== channelId);
      const clamped = Math.min(siblingIndex, destWithout.length);
      const nextDest = [
        ...destWithout.slice(0, clamped),
        channelId,
        ...destWithout.slice(clamped),
      ];
      await writeBucketPositions(client, serverId, newCat, nextDest);

      if (
        oldCat !== null &&
        newCat === null &&
        input.moveOutOfCategoryPermission === 'sync'
      ) {
        await copyCategoryOverwriteRowsToChannel(
          client,
          serverId,
          channelId,
          oldCat,
        );
      }

      /** Moving between two categories: `sync` replaces channel overwrite rows with the new category's. */
      if (
        oldCat !== null &&
        newCat !== null &&
        !categoryIdsEqual(oldCat, newCat) &&
        input.moveOutOfCategoryPermission === 'sync'
      ) {
        await copyCategoryOverwriteRowsToChannel(
          client,
          serverId,
          channelId,
          newCat,
        );
      }
    }

    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
    throw new Error('applyEchoChannelPlacement failed');
  } finally {
    client.release();
  }

  invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}
