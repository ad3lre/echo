import type { Pool } from 'pg';
import {
  invalidateEchoPermissionCacheForServer,
  invalidateEchoPermissionCacheForUser,
} from './echoPermissionCache';
import { reattributeEchoMessagesAuthorFromShadow } from './echoMessagesDal';
import {
  applyStoredDiscordImportedRoleAssignments,
  moveDiscordImportedMemberOverwrites,
} from './discordImportParity';
import { addEchoServerMember } from './echoStore/servers';

/**
 * When an Echo user links their Discord account, find all shadow users (placeholders)
 * created for that Discord ID and re-attribute their messages and memberships to the real user.
 *
 * This effectively merges the "sub-profile" into the main Echo profile.
 */
export async function mergeDiscordShadows(
  pool: Pool,
  params: {
    discordUserId: string;
    canonicalUserId: string;
  },
): Promise<void> {
  const { discordUserId, canonicalUserId } = params;

  // 1. Find shadow users for this discord ID
  const shadows = await pool.query(
    `SELECT shadow_user_id, source_server_id FROM echo_discord_shadow_users WHERE discord_user_id = $1`,
    [discordUserId],
  );

  for (const shadow of shadows.rows) {
    const shadowId = shadow.shadow_user_id;
    const serverId = shadow.source_server_id;

    // Skip if shadow is somehow the same as canonical (should not happen)
    if (shadowId === canonicalUserId) continue;

    // 2. Re-attribute messages
    await reattributeEchoMessagesAuthorFromShadow(
      pool,
      canonicalUserId,
      shadowId,
    );

    // 3. Re-attribute reactions if any (though shadows usually won't have them)
    await pool
      .query(
        `UPDATE echo_message_reactions SET user_id = $1 WHERE user_id = $2`,
        [canonicalUserId, shadowId],
      )
      .catch(() => {
        /* ignore duplicates if user reacted with same emoji as shadow */
      });

    // 4. Ensure canonical membership and move Discord-managed roles/overwrites.
    await pool.query(
      `INSERT INTO echo_server_members (server_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [serverId, canonicalUserId],
    );
    const shadowRoles = await pool.query<{ role_id: string }>(
      `SELECT role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
      [serverId, shadowId],
    );
    await applyStoredDiscordImportedRoleAssignments({
      pool,
      serverId: String(serverId),
      discordUserId,
      echoUserId: canonicalUserId,
      fallbackRoleIds: shadowRoles.rows.map((row) => String(row.role_id)),
    });
    await addEchoServerMember(pool, String(serverId), canonicalUserId);
    await moveDiscordImportedMemberOverwrites({
      pool,
      serverId: String(serverId),
      shadowUserId: String(shadowId),
      canonicalUserId,
    });
    await pool.query(
      `DELETE FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
      [serverId, shadowId],
    );
    await pool.query(
      `DELETE FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
      [serverId, shadowId],
    );

    // 5. Clean up presence and shadow entry
    await pool.query(`DELETE FROM echo_presence WHERE user_id = $1`, [
      shadowId,
    ]);
    await pool.query(
      `DELETE FROM echo_discord_shadow_users WHERE shadow_user_id = $1`,
      [shadowId],
    );

    // 6. Delete shadow user (Cascades to anything remaining)
    await pool.query(`DELETE FROM auth_users WHERE id = $1`, [shadowId]);

    invalidateEchoPermissionCacheForServer(String(serverId));
    invalidateEchoPermissionCacheForUser(String(serverId), canonicalUserId);
  }
}
