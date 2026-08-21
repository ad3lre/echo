import type { Pool } from 'pg';
import { invalidateEchoPermissionCacheForServer } from '../permissions/echoPermissionCache';
import { addEchoServerMember } from '../echoStore/servers/servers';

async function listTrackedDiscordRoleIds(
  pool: Pool,
  serverId: string,
  discordUserId: string,
): Promise<string[]> {
  const result = await pool.query<{ role_id: string }>(
    `
    SELECT role_id
    FROM echo_discord_member_role_grants
    WHERE server_id = $1 AND discord_user_id = $2
    ORDER BY role_id ASC
    `,
    [serverId, discordUserId],
  );
  return result.rows.map((row) => String(row.role_id));
}

async function listShadowUserIdsForDiscordMember(
  pool: Pool,
  serverId: string,
  discordUserId: string,
): Promise<string[]> {
  const result = await pool.query<{ shadow_user_id: string }>(
    `
    SELECT shadow_user_id
    FROM echo_discord_shadow_users
    WHERE source_server_id = $1 AND discord_user_id = $2
    ORDER BY shadow_user_id ASC
    `,
    [serverId, discordUserId],
  );
  return result.rows.map((row) => String(row.shadow_user_id));
}

function uniqueText(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function syncDiscordImportedRoleAssignments(params: {
  pool: Pool;
  serverId: string;
  discordUserId: string;
  echoUserId: string;
  desiredRoleIds: string[];
}): Promise<void> {
  const { pool, serverId, discordUserId, echoUserId, desiredRoleIds } = params;
  const desired = uniqueText(desiredRoleIds);
  const tracked = uniqueText(
    await listTrackedDiscordRoleIds(pool, serverId, discordUserId),
  );
  const candidateUsers = uniqueText([
    echoUserId,
    ...(await listShadowUserIdsForDiscordMember(pool, serverId, discordUserId)),
  ]);
  const touchedRoleIds = uniqueText([...tracked, ...desired]);
  const client = await pool.connect();
  let changed = false;
  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM echo_discord_member_role_grants WHERE server_id = $1 AND discord_user_id = $2`,
      [serverId, discordUserId],
    );
    for (const roleId of desired) {
      await client.query(
        `
        INSERT INTO echo_discord_member_role_grants (server_id, discord_user_id, role_id)
        VALUES ($1, $2, $3)
        `,
        [serverId, discordUserId, roleId],
      );
    }

    if (candidateUsers.length > 0 && touchedRoleIds.length > 0) {
      const removed = await client.query(
        `
        DELETE FROM echo_member_roles
        WHERE server_id = $1
          AND user_id = ANY($2::text[])
          AND role_id = ANY($3::text[])
        `,
        [serverId, candidateUsers, touchedRoleIds],
      );
      changed = changed || (removed.rowCount ?? 0) > 0;
    }

    for (const roleId of desired) {
      const inserted = await client.query(
        `
        INSERT INTO echo_member_roles (server_id, user_id, role_id)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        `,
        [serverId, echoUserId, roleId],
      );
      changed = changed || (inserted.rowCount ?? 0) > 0;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (changed || tracked.length !== desired.length) {
    invalidateEchoPermissionCacheForServer(serverId);
  }
}

/**
 * Re-applies `echo_discord_member_role_grants` for this Discord id onto the
 * canonical Echo user on every server where they are already a member.
 * Call after Discord account linking so imported roles match stored grants.
 */
export async function reapplyDiscordGrantRolesForLinkedUser(
  pool: Pool,
  params: { echoUserId: string; discordUserId: string },
): Promise<void> {
  const d = params.discordUserId.trim();
  const u = params.echoUserId.trim();
  if (!d || !u) return;
  const res = await pool.query<{ server_id: string }>(
    `
    SELECT DISTINCT g.server_id
    FROM echo_discord_member_role_grants g
    INNER JOIN echo_server_members m
      ON m.server_id = g.server_id AND m.user_id = $2
    WHERE g.discord_user_id = $1
    `,
    [d, u],
  );
  for (const row of res.rows) {
    const serverId = String(row.server_id);
    await applyStoredDiscordImportedRoleAssignments({
      pool,
      serverId,
      discordUserId: d,
      echoUserId: u,
    });
    await addEchoServerMember(pool, serverId, u);
  }
}

export async function applyStoredDiscordImportedRoleAssignments(params: {
  pool: Pool;
  serverId: string;
  discordUserId: string;
  echoUserId: string;
  fallbackRoleIds?: string[];
}): Promise<void> {
  const { pool, serverId, discordUserId, echoUserId, fallbackRoleIds } = params;
  const trackedRoleIds = await listTrackedDiscordRoleIds(
    pool,
    serverId,
    discordUserId,
  );
  const desiredRoleIds =
    trackedRoleIds.length > 0
      ? trackedRoleIds
      : uniqueText(fallbackRoleIds ?? []);
  await syncDiscordImportedRoleAssignments({
    pool,
    serverId,
    discordUserId,
    echoUserId,
    desiredRoleIds,
  });
}

export async function moveDiscordImportedMemberOverwrites(params: {
  pool: Pool;
  serverId: string;
  shadowUserId: string;
  canonicalUserId: string;
}): Promise<void> {
  const { pool, serverId, shadowUserId, canonicalUserId } = params;
  if (!shadowUserId.trim() || !canonicalUserId.trim()) return;
  const client = await pool.connect();
  let changed = false;
  try {
    await client.query('BEGIN');

    const deletedChannelConflicts = await client.query(
      `
      DELETE FROM echo_channel_permission_overwrite_rows canonical
      USING echo_channel_permission_overwrite_rows shadow
      WHERE canonical.server_id = $1
        AND shadow.server_id = $1
        AND canonical.target_type = 'member'
        AND shadow.target_type = 'member'
        AND canonical.target_id = $2
        AND shadow.target_id = $3
        AND canonical.channel_id = shadow.channel_id
      `,
      [serverId, canonicalUserId, shadowUserId],
    );
    changed = changed || (deletedChannelConflicts.rowCount ?? 0) > 0;

    const updatedChannelRows = await client.query(
      `
      UPDATE echo_channel_permission_overwrite_rows
      SET target_id = $2
      WHERE server_id = $1
        AND target_type = 'member'
        AND target_id = $3
      `,
      [serverId, canonicalUserId, shadowUserId],
    );
    changed = changed || (updatedChannelRows.rowCount ?? 0) > 0;

    const deletedCategoryConflicts = await client.query(
      `
      DELETE FROM echo_category_permission_overwrite_rows canonical
      USING echo_category_permission_overwrite_rows shadow
      WHERE canonical.server_id = $1
        AND shadow.server_id = $1
        AND canonical.target_type = 'member'
        AND shadow.target_type = 'member'
        AND canonical.target_id = $2
        AND shadow.target_id = $3
        AND canonical.category_id = shadow.category_id
      `,
      [serverId, canonicalUserId, shadowUserId],
    );
    changed = changed || (deletedCategoryConflicts.rowCount ?? 0) > 0;

    const updatedCategoryRows = await client.query(
      `
      UPDATE echo_category_permission_overwrite_rows
      SET target_id = $2
      WHERE server_id = $1
        AND target_type = 'member'
        AND target_id = $3
      `,
      [serverId, canonicalUserId, shadowUserId],
    );
    changed = changed || (updatedCategoryRows.rowCount ?? 0) > 0;

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (changed) {
    invalidateEchoPermissionCacheForServer(serverId);
  }
}
