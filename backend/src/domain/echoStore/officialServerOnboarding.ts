import type pg from 'pg';
import { config } from '../../config';
import { assertEchoUserHasServerMembershipSlot } from '../echoPlanEntitlements';
import { isUserBannedFromServer } from './access';
import { insertEchoAudit } from './auditLog';
import { normalizeEchoVanityCode } from './invites';
import { isClientIpBannedFromEchoServer } from './serverIpBans';
import { addEchoServerMember } from './servers';

let cachedOfficialServerId: string | null | undefined;

/** Resolve the platform official Echo server id (env id, then vanity slug). */
export async function resolveOfficialEchoServerId(
  pool: pg.Pool,
): Promise<string | null> {
  if (cachedOfficialServerId !== undefined) return cachedOfficialServerId;

  const fromEnv = config.echoOfficialServerId.trim();
  if (fromEnv) {
    const exists = await pool.query(
      `SELECT 1 FROM echo_servers WHERE id = $1 LIMIT 1`,
      [fromEnv],
    );
    cachedOfficialServerId = exists.rows[0] ? fromEnv : null;
    return cachedOfficialServerId;
  }

  const vanity = normalizeEchoVanityCode(config.echoOfficialServerVanity);
  if (vanity === null || vanity === '') {
    cachedOfficialServerId = null;
    return null;
  }
  const v = await pool.query(
    `SELECT id FROM echo_servers WHERE LOWER(vanity_code) = $1 AND vanity_code <> '' LIMIT 1`,
    [vanity],
  );
  cachedOfficialServerId = v.rows[0] ? String(v.rows[0].id) : null;
  return cachedOfficialServerId;
}

/** Clear resolver cache (tests). */
export function resetOfficialEchoServerIdCacheForTests(): void {
  cachedOfficialServerId = undefined;
}

/**
 * Add a newly created account to the official Echo server. Bypasses invite/directory/raid
 * gates; still honors bans and plan server membership slots.
 */
export async function joinNewAccountToOfficialEchoServer(
  pool: pg.Pool,
  userId: string,
  opts?: { joinClientIp?: string | null },
): Promise<{ joined: boolean; serverId: string | null; reason?: string }> {
  const serverId = await resolveOfficialEchoServerId(pool);
  if (!serverId) return { joined: false, serverId: null, reason: 'not_configured' };

  const uid = userId.trim();
  if (!uid) return { joined: false, serverId, reason: 'invalid_user' };

  if (await isUserBannedFromServer(pool, serverId, uid)) {
    return { joined: false, serverId, reason: 'banned' };
  }
  if (await isClientIpBannedFromEchoServer(pool, serverId, opts?.joinClientIp ?? null)) {
    return { joined: false, serverId, reason: 'banned' };
  }

  const client = await pool.connect();
  let alreadyMember = false;
  try {
    await client.query(`BEGIN`);
    try {
      const mem = await client.query(
        `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
        [serverId, uid],
      );
      alreadyMember = mem.rows.length > 0;
      if (!alreadyMember) {
        const slot = await assertEchoUserHasServerMembershipSlot(client, uid);
        if (!slot.ok) {
          await client.query(`ROLLBACK`);
          return { joined: false, serverId, reason: 'server_limit' };
        }
        await addEchoServerMember(client, serverId, uid);
      }
      await client.query(`COMMIT`);
    } catch (e) {
      await client.query(`ROLLBACK`);
      throw e;
    }
  } finally {
    client.release();
  }

  if (!alreadyMember) {
    await insertEchoAudit(pool, serverId, uid, 'member.join', 'user', uid, {
      source: 'official_onboarding',
    });
  }
  return { joined: !alreadyMember, serverId };
}
