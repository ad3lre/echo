import type pg from 'pg';
import type { BannedWordActionKind } from '../../../../../../contracts/types/bannedWords';
import { getMergedRolePermissions } from '../roles/permissions';
import { getEchoBannedWordsConfig } from './configDal';
import {
  matchBannedWords,
  mostSevereAction,
  shouldBlockMessage,
  type BannedWordMatch,
} from './matcher';

export type BannedWordsEvalResult = {
  shouldBlock: boolean;
  blockUserDetail?: string;
  matches: BannedWordMatch[];
  action: BannedWordActionKind | null;
};

export async function evaluateBannedWordsOnMessageSend(
  pool: pg.Pool,
  input: {
    serverId: string;
    userId: string;
    content: string;
  },
): Promise<BannedWordsEvalResult> {
  const perms = await getMergedRolePermissions(
    pool,
    input.serverId,
    input.userId,
  );
  if (
    perms.has('ADMINISTRATOR') ||
    perms.has('MANAGE_GUILD') ||
    perms.has('MANAGE_MESSAGES')
  ) {
    return { shouldBlock: false, matches: [], action: null };
  }

  const config = await getEchoBannedWordsConfig(pool, input.serverId);
  if (config.presetLevel === 'off') {
    return { shouldBlock: false, matches: [], action: null };
  }

  const memberRoleIds = await getMemberRoleIdsForUser(
    pool,
    input.serverId,
    input.userId,
  );
  const isExempt = config.exemptRoleIds.some((rid) =>
    memberRoleIds.includes(rid),
  );
  if (isExempt) {
    return { shouldBlock: false, matches: [], action: null };
  }

  const matches = matchBannedWords(input.content, config);
  if (matches.length === 0) {
    return { shouldBlock: false, matches: [], action: null };
  }

  const action = mostSevereAction(matches);
  const block = action != null && shouldBlockMessage(action);

  return {
    shouldBlock: block,
    blockUserDetail: block
      ? "Your message was blocked by the server's word filter."
      : undefined,
    matches,
    action,
  };
}

async function getMemberRoleIdsForUser(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<string[]> {
  const r = await pool.query(
    `SELECT role_id::text AS role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  return r.rows.map((row) => String(row.role_id));
}
