import type pg from 'pg';
import {
  buildBatchEvaluationPlans,
  evaluatePermissionSet,
  executeEvaluationPlan,
} from '../echoPermissionEvaluate';
import {
  getCachedMergedPermissions,
  getEchoPermissionCacheGeneration,
  setCachedPermissions,
  tryGetCachedPermissions,
} from '../echoPermissionCache';

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
}

export {
  ECHO_PERMISSIONS,
  type EchoPermission,
} from '../echoPermissionPrimitives';
