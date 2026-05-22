# Echo permission compatibility (Option A)

This document is the runtime contract for RBAC merge behavior. Implementation must live in `backend/src/domain/echoPermissionPrimitives.ts` and related modules; do not duplicate sort or fold logic elsewhere.

## Sort order (fold order)

- Sort keys: `position` ascending, tie-break `id` ascending.
- **Higher `position` is evaluated later** in the fold (last in sorted array wins per bit).

## Writes

- A write to bit `p` is a JSON object entry with key `p` and value **exactly** `true` or `false`.
- Missing key, `null`, `undefined`, non-boolean: **not a write** (inherit in layered merges; for array-stored role permissions, absence means deny for that role’s contribution in the fold).

## Merge model

- Single left-to-right fold, **last write wins per bit** (no separate deny-priority pass).
- `ADMINISTRATOR` on a role is a **sentinel**: that role’s contribution is treated as allow-all Echo bits before it enters the fold (see `foldRolePermissions`).

## Traces

- Production default: **compressed** trace (final provenance per bit / layer summary).
- Debug: **full** trace (per overwrite). Never reconstruct traces from inputs alone.
- ADMIN roles emit a single `bit: '*'` event in full mode and use `recordCompressedBulkAdmin` in compressed mode.

## Performance contract

- **Sort skip:** `foldRolePermissions` accepts `presorted: true`; callers that fetch roles with SQL `ORDER BY position ASC, id ASC` should use it to avoid a redundant O(R log R) sort.
- **ADMIN sentinel:** The fold defers full-mask materialization when an ADMIN role is encountered. If the fold ends on the sentinel (no later non-admin role), the frozen `FULL_PERMISSION_SET` is returned without per-bit construction.
- **Layer apply:** `applyLayerFromPartialObject` iterates only `Object.keys(obj)` intersected with the allowed set — O(writes), not O(|allKeys|).
- **Compressed trace batching:** ADMIN and owner paths use bulk helpers (`recordCompressedBulkAdmin`, `recordCompressedBulkOwner`) instead of per-bit `recordCompressedSource` calls.
- **Auth hot paths are compressed-only:** `getMergedRolePermissions` and `getEffectiveChannelPermissions` always pass `traceMode: 'compressed'`; full traces are reserved for the explicit `permission-explain` debug endpoint.

## Role categories (Echo extension)

- Each server has a pinned **Global Roles** category (`echo_role_categories.is_system`, `position = 0`). Uncategorized roles are stored in that category after migration.
- **Guild/channel effective permissions** still use the single global `echo_roles.position` ladder (fold order unchanged).
- **Role administration** is category-scoped unless the actor holds a granting role with `role_scope = 'global'`:
  - `MANAGE_ROLES` — create/edit/delete roles, reorder roles/categories (within scope).
  - `ASSIGN_ROLES` — assign/remove member roles (within scope); `MANAGE_ROLES` implies assign.
- Scope checks compare the actor’s top `position` among assigned roles in the same category (or globally when a global-scope granting role is present).
