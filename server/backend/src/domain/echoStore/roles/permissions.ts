import type pg from 'pg';
import {
  buildBatchEvaluationPlans,
  evaluatePermissionSet,
  executeEvaluationPlan,
  type EvaluationPlan,
} from '../../permissions/echoPermissionEvaluate';
import {
  getCachedMergedPermissions,
  getEchoPermissionCacheGeneration,
  setCachedPermissions,
  tryGetCachedPermissions,
} from '../../permissions/echoPermissionCache';
import { mergeOverwritesForGlobal } from '../../permissions/permissionOverwriteMerge';
import { timePermissionFold } from '../../../observability/echoHotPathMetrics';

/** Create/edit/delete roles, reorder roles/categories (in scope). */
export function canManageEchoRolesCatalog(perms: ReadonlySet<string>): boolean {
  return perms.has('MANAGE_ROLES') || perms.has('ADMINISTRATOR');
}

/** Assign/remove member roles; manage implies assign. */
export function canAssignEchoMemberRoles(perms: ReadonlySet<string>): boolean {
  return (
    perms.has('ASSIGN_ROLES') ||
    perms.has('MANAGE_ROLES') ||
    perms.has('ADMINISTRATOR')
  );
}

export async function getMergedRolePermissions(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<Set<string>> {
  return getCachedMergedPermissions(serverId, userId, undefined, async () => {
    const { effective } = await evaluatePermissionSet(
      pool,
      serverId,
      userId,
      undefined,
      { traceMode: 'compressed' },
    );
    return effective;
  });
}

/** Server + category + channel layers via evaluatePermissionSet. */
export async function getEffectiveChannelPermissions(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  channelId: string,
): Promise<Set<string>> {
  return getCachedMergedPermissions(serverId, userId, channelId, async () => {
    const { effective } = await evaluatePermissionSet(
      pool,
      serverId,
      userId,
      channelId,
      { traceMode: 'compressed' },
    );
    return effective;
  });
}

/**
 * Evaluate permissions for authenticated non-members using @global role.
 * Checks the @global role permissions + global-target overwrites.
 */
export async function getEffectiveGlobalPermissions(
  pool: pg.Pool,
  serverId: string,
  _userId: string,
  channelId: string,
): Promise<Set<string>> {
  // Fetch the @global role for this server
  const globalRoleRes = await pool.query(
    `SELECT id, position, permissions, role_type FROM echo_roles WHERE server_id = $1 AND name = '@global' LIMIT 1`,
    [serverId],
  );
  if (globalRoleRes.rows.length === 0) {
    // No @global role found - deny all
    return new Set();
  }

  const globalRole = {
    id: String(globalRoleRes.rows[0].id),
    position: Number(globalRoleRes.rows[0].position ?? -1),
    permissions: globalRoleRes.rows[0].permissions,
    roleType: String(globalRoleRes.rows[0].role_type ?? 'mixed'),
  };

  // Get category and channel global overwrites
  const ch = await pool.query(
    `SELECT ch.category_id FROM echo_channels ch WHERE ch.id = $1 AND ch.server_id = $2`,
    [channelId, serverId],
  );
  if (!ch.rows[0]) {
    return new Set();
  }

  const categoryId = String(ch.rows[0].category_id ?? '');

  // Fetch category global overwrites
  let categoryGlobalOverride: Record<string, unknown> | null = null;
  if (categoryId) {
    const catOw = await pool.query(
      `SELECT id, target_type, target_id, partial
       FROM echo_category_permission_overwrite_rows
       WHERE server_id = $1 AND category_id = $2 AND target_type = 'global'`,
      [serverId, categoryId],
    );
    if (catOw.rows.length > 0) {
      categoryGlobalOverride = mergeOverwritesForGlobal(
        catOw.rows.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          target_type: String(row.target_type),
          target_id: row.target_id != null ? String(row.target_id) : null,
          partial: row.partial,
        })),
      );
    }
  }

  // Fetch channel global overwrites
  let channelGlobalOverride: Record<string, unknown> | null = null;
  const chOw = await pool.query(
    `SELECT id, target_type, target_id, partial
     FROM echo_channel_permission_overwrite_rows
     WHERE server_id = $1 AND channel_id = $2 AND target_type = 'global'`,
    [serverId, channelId],
  );
  if (chOw.rows.length > 0) {
    channelGlobalOverride = mergeOverwritesForGlobal(
      chOw.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        target_type: String(row.target_type),
        target_id: row.target_id != null ? String(row.target_id) : null,
        partial: row.partial,
      })),
    );
  }

  // Build and execute evaluation plan for global user
  const plan: EvaluationPlan = {
    kind: 'global_evaluate',
    globalRole,
    categoryGlobalOverride,
    channelGlobalOverride,
  };

  const { effective } = executeEvaluationPlan(plan, 'compressed');
  return effective;
}

/**
 * Evaluate effective channel permissions for many channels in one server using
 * bulk-fetched DB data instead of per-channel round-trips.  Results are
 * cache-populated so subsequent single-channel reads are free.
 */
export async function batchGetEffectiveChannelPermissions(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  channelIds: string[],
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (channelIds.length === 0) return result;

  const uncached: string[] = [];
  for (const cid of channelIds) {
    const hit = tryGetCachedPermissions(serverId, userId, cid);
    if (hit) {
      result.set(cid, hit);
    } else {
      uncached.push(cid);
    }
  }
  if (uncached.length === 0) return result;

  return timePermissionFold('batch', async () => {
    const startGen = getEchoPermissionCacheGeneration(serverId);
    const plans = await buildBatchEvaluationPlans(
      pool,
      serverId,
      userId,
      uncached,
    );
    const endGen = getEchoPermissionCacheGeneration(serverId);
    const safeToCache = startGen === endGen;

    for (const [cid, plan] of plans) {
      const { effective } = executeEvaluationPlan(plan, 'compressed');
      result.set(cid, effective);
      if (safeToCache) {
        setCachedPermissions(serverId, userId, cid, effective);
      }
    }

    return result;
  });
}

export {
  ECHO_PERMISSIONS,
  type EchoPermission,
} from '../../permissions/echoPermissionPrimitives';
