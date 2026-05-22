import type pg from 'pg';
import { invalidateEchoPermissionCacheForServer } from '../echoPermissionCache';
import { getGlobalRoleCategoryId } from './roleCategoryGlobals';

type RoleRow = {
  id: string;
  name: string;
  role_category_id: string | null;
  rank_in_category: number;
};

type CategoryRow = { id: string; position: number; is_system: boolean };

/**
 * Renumbers global `position` and `rank_in_category` from per-category top-to-bottom lists.
 * `categoryRoleIdsTopToBottom` maps category id → role ids (highest first). Omit @everyone.
 */
export async function applyRolePositionsFromCategoryBlocks(
  pool: pg.Pool,
  serverId: string,
  categoryRoleIdsTopToBottom: Map<string, string[]>,
): Promise<void> {
  const cats = await pool.query<CategoryRow>(
    `
    SELECT id, position, is_system
    FROM echo_role_categories
    WHERE server_id = $1
    ORDER BY position ASC, id ASC
    `,
    [serverId],
  );
  const roles = await pool.query<RoleRow>(
    `
    SELECT id, name, role_category_id, rank_in_category
    FROM echo_roles
    WHERE server_id = $1
    `,
    [serverId],
  );
  const everyone = roles.rows.find((r) => r.name === '@everyone');
  const everyoneId = everyone ? String(everyone.id) : null;

  const ordered: string[] = [];
  for (const cat of cats.rows) {
    const catId = String(cat.id);
    const list = categoryRoleIdsTopToBottom.get(catId);
    if (list?.length) {
      for (const id of list) {
        if (id !== everyoneId) ordered.push(id);
      }
      continue;
    }
    const inCat = roles.rows
      .filter(
        (r) =>
          r.name !== '@everyone' &&
          String(r.role_category_id ?? '') === catId,
      )
      .sort(
        (a, b) =>
          Number(b.rank_in_category ?? 0) - Number(a.rank_in_category ?? 0) ||
          String(a.id).localeCompare(String(b.id)),
      );
    for (const r of inCat) ordered.push(String(r.id));
  }

  const globalId = await getGlobalRoleCategoryId(pool, serverId);
  const uncategorized = roles.rows
    .filter(
      (r) =>
        r.name !== '@everyone' &&
        !ordered.includes(String(r.id)) &&
        (r.role_category_id == null ||
          (globalId && String(r.role_category_id) === globalId)),
    )
    .sort(
      (a, b) =>
        Number(b.rank_in_category ?? 0) - Number(a.rank_in_category ?? 0),
    );
  for (const r of uncategorized) {
    const id = String(r.id);
    if (!ordered.includes(id)) ordered.push(id);
  }

  if (everyoneId) ordered.push(everyoneId);

  const n = ordered.length;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rankByCat = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const roleId = ordered[i]!;
      const row = roles.rows.find((r) => String(r.id) === roleId);
      const catKey = row?.role_category_id
        ? String(row.role_category_id)
        : globalId ?? '__none__';
      const rank = rankByCat.get(catKey) ?? 0;
      rankByCat.set(catKey, rank + 1);
      await client.query(
        `
        UPDATE echo_roles
        SET position = $3, rank_in_category = $4
        WHERE server_id = $1 AND id = $2
        `,
        [serverId, roleId, n - 1 - i, rank],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  invalidateEchoPermissionCacheForServer(serverId);
}

export async function buildCategoryRoleOrderMap(
  pool: pg.Pool,
  serverId: string,
): Promise<Map<string, string[]>> {
  const globalId = await getGlobalRoleCategoryId(pool, serverId);
  const r = await pool.query<RoleRow>(
    `
    SELECT r.id, r.name, r.role_category_id, r.rank_in_category, c.position AS cat_pos
    FROM echo_roles r
    LEFT JOIN echo_role_categories c
      ON c.id = r.role_category_id AND c.server_id = r.server_id
    WHERE r.server_id = $1 AND r.name <> '@everyone'
    ORDER BY COALESCE(c.position, 0) ASC, r.rank_in_category DESC, r.position DESC, r.id ASC
    `,
    [serverId],
  );
  const map = new Map<string, string[]>();
  for (const row of r.rows) {
    const catId =
      row.role_category_id != null && String(row.role_category_id).trim()
        ? String(row.role_category_id)
        : globalId ?? '__uncategorized__';
    const list = map.get(catId) ?? [];
    list.push(String(row.id));
    map.set(catId, list);
  }
  return map;
}
