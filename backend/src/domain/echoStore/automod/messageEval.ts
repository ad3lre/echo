import { randomUUID } from 'crypto';
import type pg from 'pg';
import type { EchoAutomodRule } from '../../../../../shared/types/automod';
import { getMergedRolePermissions } from '../permissions';
import { buildAutomodEvalContext, ruleMatches } from './evaluator';
import {
  listEchoAutomodHitsForUserServerRecent,
  listEchoAutomodRulesForServer,
  listEchoMemberRoleIdsForServerUser,
} from './rulesDal';

export type AutomodMessageEvalResult = {
  correlationId: string;
  shouldBlock: boolean;
  blockUserDetail?: string;
  firedRules: EchoAutomodRule[];
};

export async function evaluateAutomodOnMessageSend(
  pool: pg.Pool,
  input: {
    serverId: string;
    channelId: string;
    userId: string;
    content: string;
    mentionCount: number;
    correlationId?: string;
  },
): Promise<AutomodMessageEvalResult> {
  const correlationId = input.correlationId?.trim() || randomUUID();
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
    return { correlationId, shouldBlock: false, firedRules: [] };
  }
  const rules = await listEchoAutomodRulesForServer(pool, input.serverId);
  if (rules.length === 0) {
    return { correlationId, shouldBlock: false, firedRules: [] };
  }
  const [memberRoleIds, recentHits] = await Promise.all([
    listEchoMemberRoleIdsForServerUser(pool, input.serverId, input.userId),
    listEchoAutomodHitsForUserServerRecent(pool, input.serverId, input.userId),
  ]);
  const ctx = await buildAutomodEvalContext(pool, {
    serverId: input.serverId,
    channelId: input.channelId,
    userId: input.userId,
    content: input.content,
    mentionCount: input.mentionCount,
    memberRoleIds,
    recentHits,
  });
  const firedRules: EchoAutomodRule[] = [];
  for (const rule of rules) {
    if (ruleMatches(ctx, rule)) firedRules.push(rule);
  }
  const blocking = firedRules.find((r) =>
    r.actions.some((a) => a.kind === 'block_message'),
  );
  if (blocking) {
    return {
      correlationId,
      shouldBlock: true,
      blockUserDetail: `AutoMod blocked that message (${blocking.name}).`,
      firedRules,
    };
  }
  return { correlationId, shouldBlock: false, firedRules };
}
