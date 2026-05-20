import type { FastifyBaseLogger } from 'fastify';
import { getEchoStore } from '../../domain/echoStore/bootstrap';
import { joinNewAccountToOfficialEchoServer } from '../../domain/echoStore/officialServerOnboarding';

/** Best-effort membership in the official Echo server after account creation. */
export async function tryJoinOfficialEchoServerOnSignup(
  log: FastifyBaseLogger,
  userId: string,
  opts?: { joinClientIp?: string | null },
): Promise<void> {
  const { enabled, pool } = await getEchoStore();
  if (!enabled || !pool) return;
  try {
    const result = await joinNewAccountToOfficialEchoServer(pool, userId, opts);
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
