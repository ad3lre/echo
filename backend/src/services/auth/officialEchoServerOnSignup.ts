import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { Server as SocketIoServer } from 'socket.io';
import { getEchoStore } from '../../domain/echoStore/bootstrap';
import { joinNewAccountToOfficialEchoServer } from '../../domain/echoStore/officialServerOnboarding';
import { markOfficialEchoServerMembershipChecked } from './officialEchoServerMembershipCache';

/** Best-effort membership in the official Echo server after account creation. */
export async function tryJoinOfficialEchoServerOnSignup(
  log: FastifyBaseLogger,
  userId: string,
  opts?: { joinClientIp?: string | null; io?: SocketIoServer },
): Promise<void> {
  const { enabled, pool } = await getEchoStore();
  if (!enabled || !pool) return;
  try {
    const result = await joinNewAccountToOfficialEchoServer(pool, userId, {
      joinClientIp: opts?.joinClientIp,
      io: opts?.io,
      log,
    });
    if (result.joined) {
      log.info({
        msg: 'echo_product_analytics',
        event: 'official_server_auto_join',
        userId,
        serverId: result.serverId,
      });
    }
  } catch (err) {
    log.warn({ err, userId }, 'official_echo_server_auto_join_failed');
  }
}

/**
 * Idempotent backfill for accounts that missed signup auto-join (server limit at
 * signup, transient failure, or accounts created before onboarding existed).
 */
export async function ensureOfficialEchoServerMembership(
  pool: pg.Pool,
  userId: string,
): Promise<{ joined: boolean; serverId: string | null }> {
  const result = await joinNewAccountToOfficialEchoServer(pool, userId);
  if (result.reason !== 'server_limit') {
    markOfficialEchoServerMembershipChecked(userId);
  }
  return { joined: result.joined, serverId: result.serverId };
}
