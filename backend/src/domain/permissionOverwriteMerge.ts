/**
 * Per-member overwrite layering for one category/channel layer.
 *
 * Matches Discord's documented precedence
 * (https://discord.com/developers/docs/topics/permissions#permission-overwrites):
 *
 *   3. @members deny
 *   4. @members allow
 *   5. role deny  (union across ALL of the member's roles)
 *   6. role allow (union across ALL of the member's roles)
 *   7. member deny
 *   8. member allow
 *
 * The key consequence for the role layer is that **allow wins over deny across roles**,
 * regardless of role hierarchy/position. A muted role's `deny CONNECT` does NOT override
 * a verified role's `allow CONNECT` even when muted is the higher role.
 *
 * The single partial returned here folds these eight steps into one
 * `Record<string, boolean>` suitable for `applyLayerFromPartialObject`. Because each step
 * is idempotent per-bit, collapsing into one partial is equivalent to executing the steps
 * sequentially against any base state.
 */

import type { OverrideRow } from './mergeOverrideRows';

export type PermissionOverwriteTargetType =
  | 'members'
  | 'global'
  | 'role'
  | 'member'
  | 'everyone';

export type DbOverwriteRow = {
  id: string;
  target_type: string;
  target_id: string | null;
  partial: unknown;
};

type RoleInOrder = { id: string; position: number; permissions: unknown };

type LayerRow = { id: string; partial: Record<string, unknown> };

export type LayeredOverwritesForMember = {
  members: LayerRow | null;
  everyone: LayerRow | null; // deprecated alias for members
  /** Only the role rows whose role the member actually has (in fold order). */
  roles: LayerRow[];
  member: LayerRow | null;
};

function asPartialObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * Partition raw overwrite rows into Discord's three layer slots for one member:
 *  - the single @members row (if any)
 *  - role rows the member actually carries (deduplicated by role id, in fold order)
 *  - the member's own row (if any)
 *
 * Rows whose target a member does not carry are dropped — they never affect this member.
 */
export function partitionOverwriteRowsForMember(
  dbRows: readonly DbOverwriteRow[],
  rolesInFoldOrder: readonly RoleInOrder[],
  userId: string,
): LayeredOverwritesForMember {
  let members: LayerRow | null = null;
  const roleRowById = new Map<string, DbOverwriteRow>();
  let memberRow: DbOverwriteRow | null = null;

  for (const r of dbRows) {
    if (r.target_type === 'members' || r.target_type === 'everyone') {
      if (!members) {
        const partial = asPartialObject(r.partial);
        if (partial) members = { id: r.id, partial };
      }
      continue;
    }
    if (r.target_type === 'role' && r.target_id) {
      if (!roleRowById.has(r.target_id)) roleRowById.set(r.target_id, r);
      continue;
    }
    if (r.target_type === 'member' && r.target_id === userId) {
      if (!memberRow) memberRow = r;
    }
  }

  const roles: LayerRow[] = [];
  for (const role of rolesInFoldOrder) {
    const rw = roleRowById.get(role.id);
    if (!rw) continue;
    const partial = asPartialObject(rw.partial);
    if (!partial) continue;
    roles.push({ id: rw.id, partial });
  }

  let member: LayerRow | null = null;
  if (memberRow) {
    const partial = asPartialObject(memberRow.partial);
    if (partial) member = { id: memberRow.id, partial };
  }

  return { members, everyone: members, roles, member };
}

/**
 * Collapse @members + (combined-roles) + member overwrites into a single partial
 * with Discord's "allow wins over deny within the role layer" semantics.
 *
 * Precedence per bit:
 *  1. @members partial value (true/false), if set
 *  2. Union of role denies across ALL member roles → false (only when bit isn't role-allowed)
 *  3. Union of role allows across ALL member roles → true (always wins over role denies)
 *  4. Member partial value (true/false), if set (overrides everything)
 *
 * Bits not touched by any layer are absent from the output (caller treats as "inherit").
 */
export function mergeLayeredOverwritesForMember(
  layered: LayeredOverwritesForMember,
): Record<string, boolean> | null {
  const merged: Record<string, boolean> = {};

  const membersRow = layered.members ?? layered.everyone;
  if (membersRow) {
    for (const [k, v] of Object.entries(membersRow.partial)) {
      if (v === true || v === false) merged[k] = v;
    }
  }

  const roleDeny = new Set<string>();
  const roleAllow = new Set<string>();
  for (const role of layered.roles) {
    for (const [k, v] of Object.entries(role.partial)) {
      if (v === false) roleDeny.add(k);
      else if (v === true) roleAllow.add(k);
    }
  }
  for (const k of roleDeny) merged[k] = false;
  for (const k of roleAllow) merged[k] = true;

  if (layered.member) {
    for (const [k, v] of Object.entries(layered.member.partial)) {
      if (v === true || v === false) merged[k] = v;
    }
  }

  return Object.keys(merged).length === 0 ? null : merged;
}

/**
 * One-call helper for `buildEvaluationPlan` / `buildBatchEvaluationPlans`.
 * Returns the per-layer merged partial (channel-level or category-level) or `null`
 * when no row touches this member.
 */
export function mergeOverwritesForMember(
  dbRows: readonly DbOverwriteRow[],
  rolesInFoldOrder: readonly RoleInOrder[],
  userId: string,
): Record<string, boolean> | null {
  if (dbRows.length === 0) return null;
  return mergeLayeredOverwritesForMember(
    partitionOverwriteRowsForMember(dbRows, rolesInFoldOrder, userId),
  );
}

/**
 * Legacy ordering helper — emits rows in @members → roles (fold order) → member order.
 * Kept for tests that exercise ordering directly; production evaluators should use
 * {@link mergeOverwritesForMember} so the role layer combines allow/deny correctly.
 */
export function orderOverwriteRowsForMember(
  dbRows: readonly DbOverwriteRow[],
  rolesInFoldOrder: readonly RoleInOrder[],
  userId: string,
): OverrideRow[] {
  const layered = partitionOverwriteRowsForMember(
    dbRows,
    rolesInFoldOrder,
    userId,
  );
  const out: OverrideRow[] = [];
  let pos = 0;
  if (layered.everyone) {
    out.push({
      id: layered.everyone.id,
      position: pos++,
      body: layered.everyone.partial,
    });
  }
  for (const role of layered.roles) {
    out.push({ id: role.id, position: pos++, body: role.partial });
  }
  if (layered.member) {
    out.push({
      id: layered.member.id,
      position: pos++,
      body: layered.member.partial,
    });
  }
  return out;
}

/**
 * Partition raw overwrite rows for global (authenticated non-member) users:
 *  - the single @global row (if any)
 *
 * Ignores members/role/member overwrites — global users only see global-target rows.
 */
export function partitionOverwriteRowsForGlobal(
  dbRows: readonly DbOverwriteRow[],
): { global: LayerRow | null } {
  let globalRow: LayerRow | null = null;

  for (const r of dbRows) {
    if (r.target_type === 'global') {
      if (!globalRow) {
        const partial = asPartialObject(r.partial);
        if (partial) globalRow = { id: r.id, partial };
      }
    }
  }

  return { global: globalRow };
}

/**
 * Collapse @global overwrites into a single partial.
 * Precedence per bit:
 *  1. @global partial value (true/false), if set
 *
 * Bits not touched are absent from the output (caller treats as "inherit" → deny for @global).
 */
export function mergeLayeredOverwritesForGlobal(layered: {
  global: LayerRow | null;
}): Record<string, boolean> | null {
  const merged: Record<string, boolean> = {};

  if (layered.global) {
    for (const [k, v] of Object.entries(layered.global.partial)) {
      if (v === true || v === false) merged[k] = v;
    }
  }

  return Object.keys(merged).length === 0 ? null : merged;
}

/**
 * One-call helper for `buildEvaluationPlan` / `buildBatchEvaluationPlans` for global users.
 * Returns the per-layer merged partial (channel-level or category-level) or `null`
 * when no row touches this global user.
 */
export function mergeOverwritesForGlobal(
  dbRows: readonly DbOverwriteRow[],
): Record<string, boolean> | null {
  if (dbRows.length === 0) return null;
  return mergeLayeredOverwritesForGlobal(
    partitionOverwriteRowsForGlobal(dbRows),
  );
}

/**
 * @deprecated Use {@link mergeOverwritesForMember} so role overwrites follow Discord's
 *   "allow wins over deny across roles" rule. This helper keeps the old last-write-wins
 *   behaviour for any external callers that still depend on it.
 */
export function mergeOrderedOverwrites(
  ordered: readonly OverrideRow[],
): Record<string, unknown> | null {
  if (ordered.length === 0) return null;
  const merged: Record<string, boolean> = {};
  for (const row of ordered) {
    const obj = asPartialObject(row.body);
    if (!obj) continue;
    for (const [k, v] of Object.entries(obj)) {
      if (v === true || v === false) merged[k] = v;
    }
  }
  return Object.keys(merged).length === 0 ? null : merged;
}
