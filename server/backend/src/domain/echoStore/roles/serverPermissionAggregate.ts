import type pg from 'pg';
import {
  getCachedServerAggregate,
  getEchoServerAggregateGeneration,
  setCachedServerAggregate,
  type AggOverwriteRow,
  type AggRole,
  type ServerPermissionAggregate,
} from '../../echoServerPermissionAggregateCache';
import { createKeyedCoalescer } from '../../../shared/keyedCoalescer';
import {
  echoServerAggregateColdLoadTotal,
  recordHotCacheAccess,
} from '../../../observability/echoHotPathMetrics';

/** Concurrent cold loads for the same server share one 6-query load (review §6). */
const aggregateLoadCoalescer =
  createKeyedCoalescer<ServerPermissionAggregate>();

function mapRoles(rows: Record<string, unknown>[]): {
  roles: AggRole[];
  minPosition: number;
} {
  const roles: AggRole[] = rows.map((row) => ({
    id: String(row.id),
    position: Number(row.position ?? 0),
    permissions: row.permissions,
    roleType:
      row.role_type != null && typeof row.role_type === 'string'
        ? row.role_type
        : 'mixed',
  }));
  let minPosition = Number.POSITIVE_INFINITY;
  for (const role of roles) {
    if (role.position < minPosition) minPosition = role.position;
  }
  return { roles, minPosition: Number.isFinite(minPosition) ? minPosition : 0 };
}

function mapChannelInfo(
  rows: Record<string, unknown>[],
): Map<string, { categoryId: string; permissionOverrides: unknown }> {
  const out = new Map<
    string,
    { categoryId: string; permissionOverrides: unknown }
  >();
  for (const row of rows) {
    out.set(String(row.id), {
      categoryId: String(row.category_id ?? ''),
      permissionOverrides: row.permission_overrides,
    });
  }
  return out;
}

function toOverwriteRow(row: Record<string, unknown>): AggOverwriteRow {
  return {
    id: String(row.id),
    target_type: String(row.target_type),
    target_id: row.target_id != null ? String(row.target_id) : null,
    partial: row.partial,
  };
}

/** Group overwrite rows by a grouping column (`category_id` or `channel_id`). */
function groupOverwriteRows(
  rows: Record<string, unknown>[],
  groupKey: 'category_id' | 'channel_id',
): Map<string, AggOverwriteRow[]> {
  const out = new Map<string, AggOverwriteRow[]>();
  for (const row of rows) {
    const k = String(row[groupKey]);
    const list = out.get(k);
    if (list) list.push(toOverwriteRow(row));
    else out.set(k, [toOverwriteRow(row)]);
  }
  return out;
}

function mapCategoryLegacy(
  rows: Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const raw = row.permission_overrides;
    if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
      out.set(String(row.category_id), raw as Record<string, unknown>);
    }
  }
  return out;
}

/**
 * Load (and cache) a server's permission aggregate: all roles, channel info, and every
 * channel/category overwrite row + legacy override. Mirrors the bulk reads
 * `buildBatchEvaluationPlans` already does, but server-wide and user-independent so the fold
 * can select a member's roles and a channel's overwrites from RAM. Generation-bracketed.
 */
export async function getEchoServerPermissionAggregate(
  pool: pg.Pool,
  serverId: string,
): Promise<ServerPermissionAggregate> {
  const cached = getCachedServerAggregate(serverId);
  if (cached) {
    recordHotCacheAccess('server_aggregate', 'hit');
    return cached;
  }
  recordHotCacheAccess('server_aggregate', 'miss');
  return aggregateLoadCoalescer.run(serverId, () =>
    loadServerPermissionAggregate(pool, serverId),
  );
}

async function loadServerPermissionAggregate(
  pool: pg.Pool,
  serverId: string,
): Promise<ServerPermissionAggregate> {
  // Only the coalescer leader reaches here, so this counts real DB loads;
  // (aggregate miss − cold load) is the work saved by single-flight coalescing.
  echoServerAggregateColdLoadTotal.inc();
  const startGen = getEchoServerAggregateGeneration();

  const [ownerRes, rolesRes, chRes, catOwRes, catLegRes, chOwRes] =
    await Promise.all([
      pool.query(`SELECT owner_id FROM echo_servers WHERE id = $1`, [serverId]),
      pool.query(
        `SELECT id, position, permissions, role_type
       FROM echo_roles WHERE server_id = $1
       ORDER BY position ASC, id ASC`,
        [serverId],
      ),
      pool.query(
        `SELECT id, category_id, permission_overrides
       FROM echo_channels WHERE server_id = $1`,
        [serverId],
      ),
      pool.query(
        `SELECT id, category_id, target_type, target_id, partial
       FROM echo_category_permission_overwrite_rows WHERE server_id = $1`,
        [serverId],
      ),
      pool.query(
        `SELECT category_id, permission_overrides
       FROM echo_category_permission_overrides WHERE server_id = $1`,
        [serverId],
      ),
      pool.query(
        `SELECT id, channel_id, target_type, target_id, partial
       FROM echo_channel_permission_overwrite_rows WHERE server_id = $1`,
        [serverId],
      ),
    ]);

  const { roles, minPosition } = mapRoles(
    rolesRes.rows as Record<string, unknown>[],
  );
  const ownerRow = ownerRes.rows[0] as { owner_id?: unknown } | undefined;
  const aggregate: ServerPermissionAggregate = {
    ownerId: ownerRow?.owner_id != null ? String(ownerRow.owner_id) : null,
    roles,
    minPosition,
    channelInfo: mapChannelInfo(chRes.rows as Record<string, unknown>[]),
    channelOverwriteRows: groupOverwriteRows(
      chOwRes.rows as Record<string, unknown>[],
      'channel_id',
    ),
    categoryOverwriteRows: groupOverwriteRows(
      catOwRes.rows as Record<string, unknown>[],
      'category_id',
    ),
    categoryLegacyOverride: mapCategoryLegacy(
      catLegRes.rows as Record<string, unknown>[],
    ),
  };

  if (getEchoServerAggregateGeneration() === startGen) {
    setCachedServerAggregate(serverId, aggregate);
  }
  return aggregate;
}
