/**
 * Evaluation contract: buildEvaluationPlan (async data) → executeEvaluationPlan (pure computation).
 *
 * buildEvaluationPlan gathers all inputs from the database and produces an EvaluationPlan —
 * a plain data structure with no business logic.
 *
 * executeEvaluationPlan runs the reducer pipeline using only echoPermissionPrimitives.
 * No SQL, no side effects, no ad-hoc permission logic — preventing accidental bypass.
 */

import type pg from 'pg';
import {
  applyLayerFromPartialObject,
  ECHO_PERMISSIONS,
  foldRolePermissions,
  normalizePermissionOverwritePartial,
} from './echoPermissionPrimitives';
import type {
  EchoTraceMode,
  FoldTraceContext,
  ServerAggregationTrace,
} from './echoPermissionTrace';
import {
  createTraceCollector,
  finalizeCompressed,
  recordCompressedBulkOwner,
} from './echoPermissionTrace';
import {
  mergeOverwritesForMember,
  type DbOverwriteRow,
} from './permissionOverwriteMerge';
import {
  isEchoServerMember,
  isEchoServerMemberBanned,
  isEchoServerOwnerLocal,
} from '../echoServerMembershipChecks';
import {
  buildBatchEvaluationPlansFromAggregate,
  buildEvaluationPlanFromAggregate,
  isEchoPermAggregateCacheEnabled,
} from './echoPermissionAggregateFold';
import { DEFAULT_ECHO_MEMBERS_ROLE_PERMISSIONS } from '../echoStore/constants';

const RBAC_SEPARATE_TRACES = process.env.RBAC_SEPARATE_TRACES === '1';

const ALL_KEYS = [...ECHO_PERMISSIONS];

/** Safe baseline when the role fold produced an empty set (Discord-named bits); matches default @members (no MANAGE_CHANNELS). Includes EMBED_LINKS like post-migration rows. */
const MEMBERS_FALLBACK = new Set([
  ...DEFAULT_ECHO_MEMBERS_ROLE_PERMISSIONS,
  'EMBED_LINKS',
]);

/** @deprecated use MEMBERS_FALLBACK */
const EVERYONE_FALLBACK = MEMBERS_FALLBACK;

export type EvaluatePermissionSetResult = {
  effective: Set<string>;
  ownerBypass: boolean;
  traces: ServerAggregationTrace[];
};

// ---------------------------------------------------------------------------
// Evaluation plan (pure data — no logic)
// ---------------------------------------------------------------------------

export type RoleInput = {
  id: string;
  position: number;
  permissions: unknown;
  roleType?: string;
};

export type EvaluationPlan =
  | { kind: 'owner_bypass' }
  | { kind: 'not_member' }
  | { kind: 'not_authenticated' }
  | { kind: 'global_baseline' }
  | { kind: 'banned' }
  | { kind: 'no_roles' }
  | {
      kind: 'evaluate';
      /** Roles in fold order (position ASC, id ASC). */
      roles: RoleInput[];
      /** Category-level partial JSON override (null = none). */
      categoryOverride: Record<string, unknown> | null;
      /** Channel-level partial JSON override (null = none). */
      channelOverride: Record<string, unknown> | null;
    }
  | {
      kind: 'global_evaluate';
      /** The @global role for authenticated non-members. */
      globalRole: RoleInput;
      /** Category-level global overwrite (target_type='global'). */
      categoryGlobalOverride: Record<string, unknown> | null;
      /** Channel-level global overwrite (target_type='global'). */
      channelGlobalOverride: Record<string, unknown> | null;
    };

// ---------------------------------------------------------------------------
// Phase 1: build plan (async, database only, zero business logic)
// ---------------------------------------------------------------------------

export async function buildEvaluationPlan(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  channelId: string | undefined,
): Promise<EvaluationPlan> {
  if (isEchoPermAggregateCacheEnabled()) {
    return buildEvaluationPlanFromAggregate(pool, serverId, userId, channelId);
  }
  const [owner, member, banned] = await Promise.all([
    isEchoServerOwnerLocal(pool, serverId, userId),
    isEchoServerMember(pool, serverId, userId),
    isEchoServerMemberBanned(pool, serverId, userId),
  ]);
  if (owner) return { kind: 'owner_bypass' };
  if (!member) return { kind: 'not_member' };
  if (banned) return { kind: 'banned' };

  const r = await pool.query(
    `
    SELECT r.id, r.position, r.permissions, r.role_type
    FROM echo_roles r
    LEFT JOIN echo_member_roles mr
      ON mr.server_id = r.server_id
     AND mr.role_id = r.id
     AND mr.user_id = $2
    WHERE r.server_id = $1
      AND (
        mr.user_id IS NOT NULL
        OR r.position = (SELECT MIN(position) FROM echo_roles WHERE server_id = $1)
      )
    ORDER BY r.position ASC, r.id ASC
    `,
    [serverId, userId],
  );

  const roles: RoleInput[] = r.rows.map(
    (row: {
      id: unknown;
      position: unknown;
      permissions: unknown;
      role_type?: unknown;
    }) => ({
      id: String(row.id),
      position: Number(row.position ?? 0),
      permissions: row.permissions,
      roleType:
        row.role_type != null && typeof row.role_type === 'string'
          ? row.role_type
          : 'mixed',
    }),
  );

  if (roles.length === 0) return { kind: 'no_roles' };

  let categoryOverride: Record<string, unknown> | null = null;
  let channelOverride: Record<string, unknown> | null = null;

  if (channelId) {
    const ch = await pool.query(
      `SELECT ch.category_id, ch.permission_overrides
       FROM echo_channels ch
       WHERE ch.id = $1 AND ch.server_id = $2`,
      [channelId, serverId],
    );
    if (!ch.rows[0]) {
      /* Channel does not exist in this server (deleted, or a cross-server id).
       * Fail closed — a permission check scoped to a missing channel must not
       * fall through to server-baseline perms. Mirrors buildBatchEvaluationPlans,
       * which returns `no_roles` for unknown channel ids. */
      return { kind: 'no_roles' };
    }
    {
      const categoryId = String(ch.rows[0].category_id ?? '');

      const catOw = await pool.query(
        `SELECT id, target_type, target_id, partial
         FROM echo_category_permission_overwrite_rows
         WHERE server_id = $1 AND category_id = $2`,
        [serverId, categoryId],
      );
      if (catOw.rows.length > 0) {
        const dbRows: DbOverwriteRow[] = catOw.rows.map(
          (row: Record<string, unknown>) => ({
            id: String(row.id),
            target_type: String(row.target_type),
            target_id: row.target_id != null ? String(row.target_id) : null,
            partial: row.partial,
          }),
        );
        categoryOverride = mergeOverwritesForMember(dbRows, roles, userId);
      } else {
        const catRow = await pool.query(
          `SELECT permission_overrides FROM echo_category_permission_overrides WHERE server_id = $1 AND category_id = $2`,
          [serverId, categoryId],
        );
        const catRaw = catRow.rows[0]?.permission_overrides;
        if (
          catRaw != null &&
          typeof catRaw === 'object' &&
          !Array.isArray(catRaw)
        ) {
          categoryOverride = catRaw as Record<string, unknown>;
        }
      }

      const chOw = await pool.query(
        `SELECT id, target_type, target_id, partial
         FROM echo_channel_permission_overwrite_rows
         WHERE server_id = $1 AND channel_id = $2`,
        [serverId, channelId],
      );
      if (chOw.rows.length > 0) {
        const dbRows: DbOverwriteRow[] = chOw.rows.map(
          (row: Record<string, unknown>) => ({
            id: String(row.id),
            target_type: String(row.target_type),
            target_id: row.target_id != null ? String(row.target_id) : null,
            partial: row.partial,
          }),
        );
        channelOverride = mergeOverwritesForMember(dbRows, roles, userId);
      } else {
        const chRaw = ch.rows[0].permission_overrides;
        if (
          chRaw != null &&
          typeof chRaw === 'object' &&
          !Array.isArray(chRaw)
        ) {
          channelOverride = chRaw as Record<string, unknown>;
        }
      }
    }
  }

  return { kind: 'evaluate', roles, categoryOverride, channelOverride };
}

// ---------------------------------------------------------------------------
// Phase 2: execute plan (synchronous, pure computation via primitives only)
// ---------------------------------------------------------------------------

function toServerTrace(
  col: ReturnType<typeof createTraceCollector>,
): ServerAggregationTrace {
  if (col.mode === 'full') {
    return { mode: 'full', full: col.full };
  }
  if (col.compressed) {
    finalizeCompressed(col.compressed);
    return { mode: 'compressed', compressed: col.compressed.compressed };
  }
  return { mode: 'compressed', compressed: [] };
}

export function executeEvaluationPlan(
  plan: EvaluationPlan,
  traceMode: EchoTraceMode = 'compressed',
): EvaluatePermissionSetResult {
  if (plan.kind === 'owner_bypass') {
    const col = createTraceCollector(traceMode);
    if (col.mode === 'compressed' && col.compressed) {
      recordCompressedBulkOwner(col.compressed, ALL_KEYS);
      finalizeCompressed(col.compressed);
    }
    return {
      effective: new Set(ECHO_PERMISSIONS),
      ownerBypass: true,
      traces: [toServerTrace(col)],
    };
  }

  if (
    plan.kind === 'not_member' ||
    plan.kind === 'not_authenticated' ||
    plan.kind === 'banned' ||
    plan.kind === 'no_roles'
  ) {
    return { effective: new Set(), ownerBypass: false, traces: [] };
  }

  // Handle global baseline evaluation (authenticated non-members)
  if (plan.kind === 'global_baseline') {
    // @global role starts with 0 permissions by default
    return { effective: new Set(), ownerBypass: false, traces: [] };
  }

  if (plan.kind === 'global_evaluate') {
    const { globalRole, categoryGlobalOverride, channelGlobalOverride } = plan;

    const foldCol = createTraceCollector(traceMode);
    const foldTrace: FoldTraceContext =
      foldCol.mode === 'full'
        ? { mode: 'full', full: foldCol.full }
        : { mode: 'compressed', compressed: foldCol.compressed! };

    // Start with the @global role permissions only
    let state = foldRolePermissions([globalRole], {
      trace: foldTrace,
      allKeys: ALL_KEYS,
      presorted: true,
    });

    // Apply global category overwrites
    if (
      categoryGlobalOverride &&
      Object.keys(categoryGlobalOverride).length > 0
    ) {
      state = applyLayerFromPartialObject(
        state,
        categoryGlobalOverride,
        ALL_KEYS,
        {
          layer: 'category',
          trace: foldTrace,
        },
      );
    }

    // Apply global channel overwrites
    if (
      channelGlobalOverride &&
      Object.keys(channelGlobalOverride).length > 0
    ) {
      state = applyLayerFromPartialObject(
        state,
        channelGlobalOverride,
        ALL_KEYS,
        {
          layer: 'channel',
          trace: foldTrace,
        },
      );
    }

    return {
      effective: state,
      ownerBypass: false,
      traces: [toServerTrace(foldCol)],
    };
  }

  const foldCol = createTraceCollector(traceMode);
  const foldTrace: FoldTraceContext =
    foldCol.mode === 'full'
      ? { mode: 'full', full: foldCol.full }
      : { mode: 'compressed', compressed: foldCol.compressed! };

  let state = foldRolePermissions(plan.roles, {
    trace: foldTrace,
    allKeys: ALL_KEYS,
    presorted: true,
  });

  if (state.size === 0) {
    state = new Set(MEMBERS_FALLBACK);
  }

  // Discord semantics: ADMINISTRATOR bypasses category/channel overwrites.
  // If it is present after server-role fold, layer denies must not remove SEND_MESSAGES/VIEW_CHANNEL.
  if (state.has('ADMINISTRATOR')) {
    return {
      effective: new Set(ECHO_PERMISSIONS),
      ownerBypass: false,
      traces: [toServerTrace(foldCol)],
    };
  }

  const categoryOverride =
    plan.categoryOverride != null
      ? normalizePermissionOverwritePartial(plan.categoryOverride)
      : null;
  const channelOverride =
    plan.channelOverride != null
      ? normalizePermissionOverwritePartial(plan.channelOverride)
      : null;

  const layerTrace: FoldTraceContext | undefined =
    traceMode === 'full' && foldCol.full
      ? { mode: 'full', full: foldCol.full }
      : undefined;

  if (RBAC_SEPARATE_TRACES) {
    // create separate collectors for category and channel layers to produce separate trace artifacts
    const catCol = createTraceCollector(traceMode);
    const chCol = createTraceCollector(traceMode);
    const catTrace: FoldTraceContext | undefined =
      traceMode === 'full' && catCol.full
        ? ({
            mode: 'full' as EchoTraceMode,
            full: catCol.full,
          } as FoldTraceContext)
        : undefined;
    const chTrace: FoldTraceContext | undefined =
      traceMode === 'full' && chCol.full
        ? ({
            mode: 'full' as EchoTraceMode,
            full: chCol.full,
          } as FoldTraceContext)
        : undefined;

    if (plan.categoryOverride) {
      state = applyLayerFromPartialObject(
        state,
        plan.categoryOverride,
        ALL_KEYS,
        {
          layer: 'category',
          trace: catTrace,
        },
      );
    }
    if (plan.channelOverride) {
      state = applyLayerFromPartialObject(
        state,
        plan.channelOverride,
        ALL_KEYS,
        {
          layer: 'channel',
          trace: chTrace,
        },
      );
    }

    const tracesOut = [toServerTrace(foldCol)];
    // include non-empty layer traces
    const cat = toServerTrace(catCol);
    const ch = toServerTrace(chCol);
    function traceHasContent(t: ServerAggregationTrace): boolean {
      if (t.mode === 'compressed')
        return Array.isArray(t.compressed) && t.compressed.length > 0;
      if (t.mode === 'full') return Array.isArray(t.full) && t.full.length > 0;
      return false;
    }
    if (traceHasContent(cat)) tracesOut.push(cat);
    if (traceHasContent(ch)) tracesOut.push(ch);
    return { effective: state, ownerBypass: false, traces: tracesOut };
  }

  if (categoryOverride && Object.keys(categoryOverride).length > 0) {
    state = applyLayerFromPartialObject(state, categoryOverride, ALL_KEYS, {
      layer: 'category',
      trace: layerTrace,
    });
  }
  if (channelOverride && Object.keys(channelOverride).length > 0) {
    state = applyLayerFromPartialObject(state, channelOverride, ALL_KEYS, {
      layer: 'channel',
      trace: layerTrace,
    });
  }

  return {
    effective: state,
    ownerBypass: false,
    traces: [toServerTrace(foldCol)],
  };
}

// ---------------------------------------------------------------------------
// Batch plan builder — prefetches server-level data once, then builds
// per-channel plans from bulk-fetched overwrite rows.  Produces identical
// results to calling buildEvaluationPlan per channel (including `no_roles`
// for unknown/cross-server channel ids) but with O(1) server queries instead
// of O(channels).
// ---------------------------------------------------------------------------

export async function buildBatchEvaluationPlans(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  channelIds: string[],
): Promise<Map<string, EvaluationPlan>> {
  if (isEchoPermAggregateCacheEnabled()) {
    return buildBatchEvaluationPlansFromAggregate(
      pool,
      serverId,
      userId,
      channelIds,
    );
  }
  const result = new Map<string, EvaluationPlan>();
  if (channelIds.length === 0) return result;

  const [owner, member, banned] = await Promise.all([
    isEchoServerOwnerLocal(pool, serverId, userId),
    isEchoServerMember(pool, serverId, userId),
    isEchoServerMemberBanned(pool, serverId, userId),
  ]);
  if (owner) {
    for (const cid of channelIds) result.set(cid, { kind: 'owner_bypass' });
    return result;
  }
  if (!member) {
    for (const cid of channelIds) result.set(cid, { kind: 'not_member' });
    return result;
  }
  if (banned) {
    for (const cid of channelIds) result.set(cid, { kind: 'banned' });
    return result;
  }

  const r = await pool.query(
    `SELECT r.id, r.position, r.permissions, r.role_type
     FROM echo_roles r
     LEFT JOIN echo_member_roles mr
       ON mr.server_id = r.server_id
      AND mr.role_id = r.id
      AND mr.user_id = $2
     WHERE r.server_id = $1
       AND (
         mr.user_id IS NOT NULL
         OR r.position = (SELECT MIN(position) FROM echo_roles WHERE server_id = $1)
       )
     ORDER BY r.position ASC, r.id ASC`,
    [serverId, userId],
  );

  const roles: RoleInput[] = r.rows.map(
    (row: {
      id: unknown;
      position: unknown;
      permissions: unknown;
      role_type?: unknown;
    }) => ({
      id: String(row.id),
      position: Number(row.position ?? 0),
      permissions: row.permissions,
      roleType:
        row.role_type != null && typeof row.role_type === 'string'
          ? row.role_type
          : 'mixed',
    }),
  );

  if (roles.length === 0) {
    for (const cid of channelIds) result.set(cid, { kind: 'no_roles' });
    return result;
  }

  const chRes = await pool.query(
    `SELECT ch.id, ch.category_id, ch.permission_overrides
     FROM echo_channels ch
     WHERE ch.id = ANY($1::text[]) AND ch.server_id = $2`,
    [channelIds, serverId],
  );
  const channelInfoMap = new Map<
    string,
    { categoryId: string; permissionOverrides: unknown }
  >();
  for (const row of chRes.rows as Record<string, unknown>[]) {
    channelInfoMap.set(String(row.id), {
      categoryId: String(row.category_id ?? ''),
      permissionOverrides: row.permission_overrides,
    });
  }

  const categoryIds = [
    ...new Set(
      [...channelInfoMap.values()].map((c) => c.categoryId).filter(Boolean),
    ),
  ];

  const catOwMap = new Map<string, DbOverwriteRow[]>();
  if (categoryIds.length > 0) {
    const catOwRes = await pool.query(
      `SELECT id, category_id, target_type, target_id, partial
       FROM echo_category_permission_overwrite_rows
       WHERE server_id = $1 AND category_id = ANY($2::text[])`,
      [serverId, categoryIds],
    );
    for (const row of catOwRes.rows as Record<string, unknown>[]) {
      const catId = String(row.category_id);
      if (!catOwMap.has(catId)) catOwMap.set(catId, []);
      catOwMap.get(catId)!.push({
        id: String(row.id),
        target_type: String(row.target_type),
        target_id: row.target_id != null ? String(row.target_id) : null,
        partial: row.partial,
      });
    }
  }

  const categoriesWithoutRows = categoryIds.filter((cid) => !catOwMap.has(cid));
  const catLegacyMap = new Map<string, Record<string, unknown>>();
  if (categoriesWithoutRows.length > 0) {
    const catLegRes = await pool.query(
      `SELECT category_id, permission_overrides
       FROM echo_category_permission_overrides
       WHERE server_id = $1 AND category_id = ANY($2::text[])`,
      [serverId, categoriesWithoutRows],
    );
    for (const row of catLegRes.rows as Record<string, unknown>[]) {
      const raw = row.permission_overrides;
      if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
        catLegacyMap.set(
          String(row.category_id),
          raw as Record<string, unknown>,
        );
      }
    }
  }

  const chOwMap = new Map<string, DbOverwriteRow[]>();
  const chOwRes = await pool.query(
    `SELECT id, channel_id, target_type, target_id, partial
     FROM echo_channel_permission_overwrite_rows
     WHERE server_id = $1 AND channel_id = ANY($2::text[])`,
    [serverId, channelIds],
  );
  for (const row of chOwRes.rows as Record<string, unknown>[]) {
    const chId = String(row.channel_id);
    if (!chOwMap.has(chId)) chOwMap.set(chId, []);
    chOwMap.get(chId)!.push({
      id: String(row.id),
      target_type: String(row.target_type),
      target_id: row.target_id != null ? String(row.target_id) : null,
      partial: row.partial,
    });
  }

  for (const channelId of channelIds) {
    const chInfo = channelInfoMap.get(channelId);
    if (!chInfo) {
      result.set(channelId, { kind: 'no_roles' });
      continue;
    }

    let categoryOverride: Record<string, unknown> | null = null;
    let channelOverride: Record<string, unknown> | null = null;

    const categoryId = chInfo.categoryId;
    if (categoryId) {
      const catRows = catOwMap.get(categoryId);
      if (catRows && catRows.length > 0) {
        categoryOverride = mergeOverwritesForMember(catRows, roles, userId);
      } else {
        categoryOverride = catLegacyMap.get(categoryId) ?? null;
      }
    }

    const chRows = chOwMap.get(channelId);
    if (chRows && chRows.length > 0) {
      channelOverride = mergeOverwritesForMember(chRows, roles, userId);
    } else {
      const raw = chInfo.permissionOverrides;
      if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
        channelOverride = raw as Record<string, unknown>;
      }
    }

    result.set(channelId, {
      kind: 'evaluate',
      roles,
      categoryOverride,
      channelOverride,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public entry: build → execute (the only function callers should use)
// ---------------------------------------------------------------------------

export async function evaluatePermissionSet(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  channelId: string | undefined,
  opts?: { traceMode?: EchoTraceMode },
): Promise<EvaluatePermissionSetResult> {
  const plan = await buildEvaluationPlan(pool, serverId, userId, channelId);
  return executeEvaluationPlan(plan, opts?.traceMode);
}
