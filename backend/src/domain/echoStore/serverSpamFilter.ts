import type pg from 'pg';
import type { MentionEntity } from '../../../../shared/types';
import {
  countEchoMessagesAuthorBurstInServer,
  countEchoMessagesAuthorDuplicateInServer,
} from '../echoMessagesDal';
import { getMergedRolePermissions } from './permissions';

const SPAM_BURST_WINDOW_SECONDS = 8;
const SPAM_BURST_MAX_MESSAGES = 5;
const SPAM_DUPLICATE_WINDOW_SECONDS = 30;
/** Block only after this many prior messages in the window share the same normalized body (then the next send is rejected). */
const SPAM_DUPLICATE_MAX_PREVIOUS_MATCHES = 4;
const SPAM_MAX_MENTIONS_PER_MESSAGE = 6;

function normalizeComparableContent(content: string): string {
  return content.trim().toLowerCase().slice(0, 500);
}

async function isSpamFilterEnabled(
  pool: pg.Pool,
  serverId: string,
): Promise<boolean> {
  const res = await pool.query(
    `SELECT automod_spam_enabled FROM echo_servers WHERE id = $1 LIMIT 1`,
    [serverId],
  );
  if (!res.rows[0]) return false;
  return res.rows[0].automod_spam_enabled !== false;
}

async function mayBypassSpamFilter(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const perms = await getMergedRolePermissions(pool, serverId, userId);
  return (
    perms.has('ADMINISTRATOR') ||
    perms.has('MANAGE_GUILD') ||
    perms.has('MANAGE_MESSAGES')
  );
}

export type EchoServerSpamFilterResult =
  | { ok: true }
  | { ok: false; detail: string };

export async function checkEchoServerSpamFilter(
  pool: pg.Pool,
  input: {
    serverId: string;
    userId: string;
    content: string;
    mentions?: MentionEntity[];
  },
): Promise<EchoServerSpamFilterResult> {
  const { serverId, userId, content, mentions } = input;
  if (!(await isSpamFilterEnabled(pool, serverId))) {
    return { ok: true };
  }
  if (await mayBypassSpamFilter(pool, serverId, userId)) {
    return { ok: true };
  }

  if ((mentions?.length ?? 0) >= SPAM_MAX_MENTIONS_PER_MESSAGE) {
    return {
      ok: false,
      detail:
        'Spam filter blocked that message because it mentioned too many people at once.',
    };
  }

  const recentMessageCount = await countEchoMessagesAuthorBurstInServer(
    pool,
    serverId,
    userId,
    SPAM_BURST_WINDOW_SECONDS,
  );
  if (recentMessageCount >= SPAM_BURST_MAX_MESSAGES) {
    return {
      ok: false,
      detail:
        'Spam filter blocked that message because you are sending too quickly in this server.',
    };
  }

  const comparable = normalizeComparableContent(content);
  if (comparable.length >= 8) {
    const duplicateCount = await countEchoMessagesAuthorDuplicateInServer(
      pool,
      serverId,
      userId,
      SPAM_DUPLICATE_WINDOW_SECONDS,
      comparable,
    );
    if (duplicateCount >= SPAM_DUPLICATE_MAX_PREVIOUS_MATCHES) {
      return {
        ok: false,
        detail:
          'Spam filter blocked that message because it repeats the same content too many times.',
      };
    }
  }

  return { ok: true };
}
