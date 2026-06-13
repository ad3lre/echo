import type pg from 'pg';
import type { EvaluationPlan, RoleInput } from './echoPermissionEvaluate';
import { mergeOverwritesForMember } from './permissionOverwriteMerge';
import { getEchoServerPermissionAggregate } from './echoStore/serverPermissionAggregate';
import type { ServerPermissionAggregate } from './echoServerPermissionAggregateCache';
import { getEchoMemberRoleIds } from './echoStore/memberRoleIds';
import { getEchoMemberAccessState } from './echoStore/memberAccessState';

/**
 * Gate for the in-memory server-permission aggregate fold. ON by default; set
 * `ECHO_PERM_AGGREGATE_CACHE=false` to fall back to the direct-DB fold (tests, rollback).
 */
export function isEchoPermAggregateCacheEnabled(): boolean {
  const raw = process.env.ECHO_PERM_AGGREGATE_CACHE?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') {
    return false;
  }
  return true;
}

type MembershipGate = 'owner_bypass' | 'not_member' | 'banned' | null;

type GateAndAggregate = {
  gate: MembershipGate;
  aggregate: ServerPermissionAggregate;
};

/**
 * Owner/member/ban short-circuits shared by the single and batch aggregate folds, served
 * from cached state: owner from the aggregate (owner transfer invalidates ForServer,
 * dropping it), member/ban from the member-access cache that the message-send path
 * already trusts. Steady-state folds therefore touch the DB zero times. Check order
 * matches the direct path: owner bypasses even when banned or not a member row.
 */
async function resolveMembershipGate(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<GateAndAggregate> {
  const [aggregate, memberState] = await Promise.all([
    getEchoServerPermissionAggregate(pool, serverId),
    getEchoMemberAccessState(pool, serverId, userId),
  ]);
  if (aggregate.ownerId !== null && aggregate.ownerId === userId) {
    return { gate: 'owner_bypass', aggregate };
  }
  if (!memberState.isMember) return { gate: 'not_member', aggregate };
  if (memberState.banned) return { gate: 'banned', aggregate };
  return { gate: null, aggregate };
}

/**
 * Select the member's roles + the baseline (lowest-position) tier, preserving fold order.
 * Matches SQL `mr.user_id IS NOT NULL OR r.position = (SELECT MIN(position) ...)`.
 */
function selectMemberRoles(
  aggregate: ServerPermissionAggregate,
  userRoleIds: ReadonlySet<string>,
): RoleInput[] {
  return aggregate.roles.filter(
    (r) => userRoleIds.has(r.id) || r.position === aggregate.minPosition,
  );
}

/**
 * Per-channel plan from the aggregate. Fail-closed `no_roles` on an unknown channel id
 * (deleted / cross-server), as both DB paths do. Mirrors `buildBatchEvaluationPlans`'
 * per-channel selection exactly.
 */
function planForChannelFromAggregate(
  aggregate: ServerPermissionAggregate,
  roles: RoleInput[],
  userId: string,
  channelId: string,
): EvaluationPlan {
  const chInfo = aggregate.channelInfo.get(channelId);
  if (!chInfo) return { kind: 'no_roles' };

  let categoryOverride: Record<string, unknown> | null = null;
  let channelOverride: Record<string, unknown> | null = null;

  const categoryId = chInfo.categoryId;
  if (categoryId) {
    const catRows = aggregate.categoryOverwriteRows.get(categoryId);
    if (catRows && catRows.length > 0) {
      categoryOverride = mergeOverwritesForMember(catRows, roles, userId);
    } else {
      categoryOverride =
        aggregate.categoryLegacyOverride.get(categoryId) ?? null;
    }
  }

  const chRows = aggregate.channelOverwriteRows.get(channelId);
  if (chRows && chRows.length > 0) {
    channelOverride = mergeOverwritesForMember(chRows, roles, userId);
  } else {
    const raw = chInfo.permissionOverrides;
    if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
      channelOverride = raw as Record<string, unknown>;
    }
  }

  return { kind: 'evaluate', roles, categoryOverride, channelOverride };
}

/**
 * Aggregate-cache fold: identical plan to `buildEvaluationPlan`, but roles and overwrites
 * come from the in-RAM server aggregate + cached member role-ids instead of per-fold DB
 * reads — see echo.permissionAggregateParity.test.ts.
 */
export async function buildEvaluationPlanFromAggregate(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  channelId: string | undefined,
): Promise<EvaluationPlan> {
  const { gate, aggregate } = await resolveMembershipGate(
    pool,
    serverId,
    userId,
  );
  if (gate) return { kind: gate };

  const userRoleIds = await getEchoMemberRoleIds(pool, serverId, userId);
  const roles = selectMemberRoles(aggregate, userRoleIds);
  if (roles.length === 0) return { kind: 'no_roles' };

  if (!channelId) {
    return {
      kind: 'evaluate',
      roles,
      categoryOverride: null,
      channelOverride: null,
    };
  }
  return planForChannelFromAggregate(aggregate, roles, userId, channelId);
}

/**
 * Batch counterpart of {@link buildEvaluationPlanFromAggregate}: one membership gate, one
 * aggregate + role-id load, then per-channel selection from RAM. Used by
 * `batchGetEffectiveChannelPermissions` (workspace hydration) — exactly the path that
 * re-warms every member's folds after a role edit.
 */
export async function buildBatchEvaluationPlansFromAggregate(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  channelIds: string[],
): Promise<Map<string, EvaluationPlan>> {
  const result = new Map<string, EvaluationPlan>();
  if (channelIds.length === 0) return result;

  const { gate, aggregate } = await resolveMembershipGate(
    pool,
    serverId,
    userId,
  );
  if (gate) {
    for (const cid of channelIds) result.set(cid, { kind: gate });
    return result;
  }

  const userRoleIds = await getEchoMemberRoleIds(pool, serverId, userId);
  const roles = selectMemberRoles(aggregate, userRoleIds);
  if (roles.length === 0) {
    for (const cid of channelIds) result.set(cid, { kind: 'no_roles' });
    return result;
  }

  for (const cid of channelIds) {
    result.set(cid, planForChannelFromAggregate(aggregate, roles, userId, cid));
  }
  return result;
}
