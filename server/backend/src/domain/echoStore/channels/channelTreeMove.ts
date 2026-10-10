import type pg from 'pg';

type PgQueryable = Pick<pg.Pool, 'query'>;
import { nextEchoSnowflakeId } from '../../echoSnowflake';
import { invalidateEchoPermissionCacheForServer } from '../../permissions/echoPermissionCache';
import {
  getEffectiveChannelPermissions,
  getMergedRolePermissions,
} from '../roles/permissions';

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

/** Clear channel-owned overwrites so the channel inherits live from its category. */
async function clearChannelPermissionOverwritesForCategorySync(
  client: pg.PoolClient,
  serverId: string,
  channelId: string,
): Promise<void> {
  await client.query(
    `DELETE FROM echo_channel_permission_overwrite_rows WHERE server_id = $1 AND channel_id = $2`,
    [serverId, channelId],
  );
  await client.query(
    `UPDATE echo_channels SET permission_overrides = NULL WHERE id = $1 AND server_id = $2`,
    [channelId, serverId],
  );
}

/** Snapshot category overwrites onto the channel (used when leaving a category). */
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
   * When moving between categories: `sync` clears channel overwrite rows so the channel
   * inherits from the destination category; omitted/`keep` leaves channel rows unchanged.
   * When moving to uncategorized: `sync` snapshots the source category’s rows onto the channel.
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
  mutationClient?: pg.PoolClient,
): Promise<'ok' | 'forbidden' | 'not_found' | 'invalid_body'> {
  const queryable = mutationClient ?? pool;
  const merged = await getMergedRolePermissions(
    queryable as pg.Pool,
    serverId,
    actorId,
  );
  if (!merged.has('MANAGE_ROLES') && !merged.has('MANAGE_GUILD')) {
    const effective = await getEffectiveChannelPermissions(
      queryable as pg.Pool,
      serverId,
      actorId,
      channelId,
    );
    if (!effective.has('MANAGE_CHANNELS')) {
      return 'forbidden';
    }
  }

  const chQ = await queryable.query(
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
    const catOk = await queryable.query(
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

  const siblingIndex = input.siblingIndex;
  if (siblingIndex === undefined) {
    if (!categoryChanging) return 'invalid_body';
  }

  if (
    siblingIndex !== undefined &&
    (typeof siblingIndex !== 'number' ||
      !Number.isFinite(siblingIndex) ||
      siblingIndex < 0 ||
      siblingIndex !== Math.floor(siblingIndex))
  ) {
    return 'invalid_body';
  }

  const client = mutationClient ?? (await pool.connect());
  const ownsTransaction = mutationClient === undefined;
  try {
    if (ownsTransaction) await client.query('BEGIN');

    // Channel positions are compact across every bucket in a server. Serialize
    // placement edits before reading the buckets so concurrent moves cannot
    // write permutations calculated from the same snapshot.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('echo_channel_tree_move'), hashtext($1))`,
      [serverId],
    );

    // The source category and destination bucket were validated before the
    // transaction. Recheck the source after acquiring the lock; if another
    // move changed it while we waited, let the caller retry against fresh state.
    const lockedChannel = await client.query(
      `SELECT category_id FROM echo_channels WHERE id = $1 AND server_id = $2`,
      [channelId, serverId],
    );
    if (lockedChannel.rows.length === 0) {
      if (ownsTransaction) await client.query('ROLLBACK');
      return 'not_found';
    }
    if (
      !categoryIdsEqual(
        normalizeCategoryId(lockedChannel.rows[0].category_id as string | null),
        oldCat,
      )
    ) {
      if (ownsTransaction) await client.query('ROLLBACK');
      return 'invalid_body';
    }
    if (newCat !== null) {
      const lockedCategory = await client.query(
        `SELECT 1 FROM echo_categories WHERE id = $1 AND server_id = $2`,
        [newCat, serverId],
      );
      if (lockedCategory.rows.length === 0) {
        if (ownsTransaction) await client.query('ROLLBACK');
        return 'invalid_body';
      }
    }

    const oldBucket = await listBucketChannelIds(
      client as unknown as pg.Pool,
      serverId,
      oldCat,
    );
    if (!oldBucket.includes(channelId)) {
      if (ownsTransaction) await client.query('ROLLBACK');
      return 'not_found';
    }

    const lockedSiblingIndex =
      siblingIndex ??
      (
        await listBucketChannelIds(
          client as unknown as pg.Pool,
          serverId,
          newCat,
        )
      ).filter((id) => id !== channelId).length;

    if (categoryIdsEqual(newCat, oldCat)) {
      const without = oldBucket.filter((id) => id !== channelId);
      const clamped = Math.min(lockedSiblingIndex, without.length);
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
      const clamped = Math.min(lockedSiblingIndex, destWithout.length);
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

      /** Moving between two categories: `sync` clears channel rows to inherit from the new category. */
      if (
        oldCat !== null &&
        newCat !== null &&
        !categoryIdsEqual(oldCat, newCat) &&
        input.moveOutOfCategoryPermission === 'sync'
      ) {
        await clearChannelPermissionOverwritesForCategorySync(
          client,
          serverId,
          channelId,
        );
      }
    }

    if (ownsTransaction) await client.query('COMMIT');
  } catch {
    if (ownsTransaction) await client.query('ROLLBACK');
    throw new Error('applyEchoChannelPlacement failed');
  } finally {
    if (ownsTransaction) client.release();
  }

  if (!mutationClient) invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}
