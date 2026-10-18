import type pg from 'pg';
import type {
  EchoRoleDto,
  EchoRoleRow,
  ListEchoRolesForServerOptions,
} from './echoRoleDto';
import { mapEchoRoleRowToDto } from './mapEchoRoleRow';
import { normalizeEchoRoleType } from '../../../../../../contracts/echoRoleTypes';

export async function listEchoRolesForServer(
  pool: pg.Pool,
  serverId: string,
  options?: ListEchoRolesForServerOptions,
): Promise<EchoRoleDto[]> {
  const includeAuthority = options?.includeAuthorityRoles !== false;
  const r = await pool.query<EchoRoleRow>(
    `
    SELECT r.id, r.name, r.color, r.dark_color, r.light_color, r.separate_theme_colors,
           r.position, r.permissions, r.hoist, r.default_on_join, r.role_category_id,
           r.rank_in_category, r.role_scope, r.role_icon_url, r.role_icon_emoji_id, r.role_type,
           r.sync_with_category_defaults
    FROM echo_roles r
    LEFT JOIN echo_role_categories c
      ON c.id = r.role_category_id AND c.server_id = r.server_id
    WHERE r.server_id = $1
    ORDER BY
      CASE
        WHEN r.name = '@global' THEN 2
        WHEN r.name = '@members' THEN 1
        ELSE 0
      END,
      COALESCE(c.position, 0) ASC,
      r.rank_in_category DESC,
      r.position DESC,
      r.id ASC
    `,
    [serverId],
  );
  const out: EchoRoleDto[] = [];
  for (const row of r.rows) {
    const roleType = normalizeEchoRoleType(row.role_type);
    if (!includeAuthority && roleType === 'authority') continue;
    out.push(mapEchoRoleRowToDto(row));
  }
  return out;
}
