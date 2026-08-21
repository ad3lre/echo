import type pg from 'pg';
import type { MentionEntity } from '../../../../../../contracts/types';
import { getEchoChannelServerId } from '../members/access';
import {
  ECHO_DM_REALM_SERVER_ID,
  listEchoDmParticipantUserIds,
} from '../social/dmThreads';

/**
 * Server-authoritative mention scope filter.
 *
 * Prevents cross-context pings by dropping mention entities that reference:
 * - users who are not members of the current server (server channels)
 * - roles not in the current server
 * - channels not in the current server
 * - DM mentions that target users outside the DM participant set
 *
 * Note: mass-mention kinds ('everyone' / 'active') are left as-is for server channels
 * (they are permission-gated elsewhere) and dropped for DM realm.
 */
export async function filterMentionsForChannelContext(
  pool: pg.Pool,
  channelId: string,
  mentions: MentionEntity[] | undefined,
): Promise<MentionEntity[] | undefined> {
  if (!mentions?.length) return undefined;

  const sid = await getEchoChannelServerId(pool, channelId);
  if (!sid) return mentions;

  if (sid === ECHO_DM_REALM_SERVER_ID) {
    const participantIds = new Set(
      await listEchoDmParticipantUserIds(pool, channelId),
    );
    const filtered = mentions.filter((m) => {
      if (m.kind === 'user') return !!m.userId && participantIds.has(m.userId);
      // No server-scoped constructs in DMs.
      return false;
    });
    return filtered.length ? filtered : undefined;
  }

  const userIds = [
    ...new Set(
      mentions
        .filter((m) => m.kind === 'user' && typeof m.userId === 'string')
        .map((m) => String(m.userId).trim())
        .filter(Boolean),
    ),
  ];
  const roleIds = [
    ...new Set(
      mentions
        .filter((m) => m.kind === 'role' && typeof m.roleId === 'string')
        .map((m) => String(m.roleId).trim())
        .filter(Boolean),
    ),
  ];
  const channelIds = [
    ...new Set(
      mentions
        .filter((m) => m.kind === 'channel' && typeof m.channelId === 'string')
        .map((m) => String(m.channelId).trim())
        .filter(Boolean),
    ),
  ];

  const [membersOk, rolesOk, channelsOk] = await Promise.all([
    userIds.length
      ? pool
          .query<{
            user_id: unknown;
          }>(
            `SELECT user_id FROM echo_server_members WHERE server_id = $1 AND user_id = ANY($2::text[])`,
            [sid, userIds],
          )
          .then((r) => new Set(r.rows.map((row) => String(row.user_id))))
      : Promise.resolve(new Set<string>()),
    roleIds.length
      ? pool
          .query<{
            id: unknown;
          }>(
            `SELECT id FROM echo_roles WHERE server_id = $1 AND id = ANY($2::text[])`,
            [sid, roleIds],
          )
          .then((r) => new Set(r.rows.map((row) => String(row.id))))
      : Promise.resolve(new Set<string>()),
    channelIds.length
      ? pool
          .query<{
            id: unknown;
          }>(
            `SELECT id FROM echo_channels WHERE server_id = $1 AND id = ANY($2::text[])`,
            [sid, channelIds],
          )
          .then((r) => new Set(r.rows.map((row) => String(row.id))))
      : Promise.resolve(new Set<string>()),
  ]);

  const filtered = mentions.filter((m) => {
    if (m.kind === 'user') return !!m.userId && membersOk.has(m.userId);
    if (m.kind === 'role') return !!m.roleId && rolesOk.has(m.roleId);
    if (m.kind === 'channel')
      return !!m.channelId && channelsOk.has(m.channelId);
    // 'everyone' / 'active' are validated by capability checks.
    return m.kind === 'everyone' || m.kind === 'active';
  });

  return filtered.length ? filtered : undefined;
}
