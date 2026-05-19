import type pg from 'pg';
import type {
  AutomodConditionNode,
  AutomodNode,
  AutomodTimeWindow,
  EchoAutomodRule,
} from '../../../../../shared/types/automod';
import {
  countEchoMessagesAuthorBurstInServer,
  countEchoMessagesAuthorDuplicateInServer,
} from '../../echoMessagesDal';
import { automodRe2Test, isRe2AutomodAvailable } from './re2Safe';

const SPAM_BURST_WINDOW_SECONDS = 8;
const SPAM_DUPLICATE_WINDOW_SECONDS = 30;

function normalizeComparableContent(content: string): string {
  return content.trim().toLowerCase().slice(0, 500);
}

function windowMs(w: AutomodTimeWindow): number {
  switch (w) {
    case '1h':
      return 3600_000;
    case '24h':
      return 86400_000;
    case '7d':
      return 7 * 86400_000;
    case '30d':
      return 30 * 86400_000;
    default:
      return 0;
  }
}

export type AutomodEvalContext = {
  serverId: string;
  channelId: string;
  userId: string;
  content: string;
  mentionCount: number;
  memberRoleIds: Set<string>;
  burstCount: number;
  duplicateCount: number;
  priorHitCounter: (ruleId: string, window: AutomodTimeWindow) => number;
};

export async function buildAutomodEvalContext(
  pool: pg.Pool,
  input: {
    serverId: string;
    channelId: string;
    userId: string;
    content: string;
    mentionCount: number;
    memberRoleIds: string[];
    /** Pre-fetched recent hits (same as listEchoAutomodHitsForUserServerRecent) */
    recentHits: Array<{ rule_id: string; created_at: Date; outcome: string }>;
  },
): Promise<AutomodEvalContext> {
  const burstCount = await countEchoMessagesAuthorBurstInServer(
    pool,
    input.serverId,
    input.userId,
    SPAM_BURST_WINDOW_SECONDS,
  );
  const comparable = normalizeComparableContent(input.content);
  let duplicateCount = 0;
  if (comparable.length >= 8) {
    duplicateCount = await countEchoMessagesAuthorDuplicateInServer(
      pool,
      input.serverId,
      input.userId,
      SPAM_DUPLICATE_WINDOW_SECONDS,
      comparable,
    );
  }

  const now = Date.now();
  const eligibleHits = input.recentHits.filter(
    (h) => h.outcome === 'blocked' || h.outcome === 'applied',
  );

  function priorHitCounter(ruleId: string, window: AutomodTimeWindow): number {
    const ms = windowMs(window);
    const cutoff = now - ms;
    let n = 0;
    for (const h of eligibleHits) {
      if (h.rule_id !== ruleId) continue;
      const t = h.created_at.getTime();
      if (t >= cutoff) n++;
    }
    return n;
  }

  return {
    serverId: input.serverId,
    channelId: input.channelId,
    userId: input.userId,
    content: input.content,
    mentionCount: input.mentionCount,
    memberRoleIds: new Set(input.memberRoleIds),
    burstCount,
    duplicateCount,
    priorHitCounter,
  };
}

function evalCondition(
  ctx: AutomodEvalContext,
  c: AutomodConditionNode,
): boolean {
  let ok = false;
  switch (c.field) {
    case 'message.content': {
      const text = ctx.content;
      if (c.op === 'contains') {
        const needle = typeof c.value === 'string' ? c.value : '';
        ok = needle.length > 0 && text.includes(needle);
      } else if (c.op === 'equals') {
        const v = typeof c.value === 'string' ? c.value : '';
        ok = v.length > 0 && text === v;
      } else if (c.op === 'matches_regex_re2') {
        const pat = typeof c.value === 'string' ? c.value : '';
        if (!pat || !isRe2AutomodAvailable()) ok = false;
        else {
          try {
            ok = automodRe2Test(pat, text);
          } catch {
            ok = false;
          }
        }
      }
      break;
    }
    case 'message.mention_count': {
      if (c.op === 'gte') {
        const n = typeof c.value === 'number' ? c.value : NaN;
        ok = Number.isFinite(n) && ctx.mentionCount >= n;
      }
      break;
    }
    case 'channel.id': {
      const arr = Array.isArray(c.value)
        ? c.value.filter((x): x is string => typeof x === 'string')
        : [];
      if (c.op === 'in') ok = arr.includes(ctx.channelId);
      if (c.op === 'not_in')
        ok = arr.length > 0 && !arr.includes(ctx.channelId);
      break;
    }
    case 'author.role_ids': {
      const arr = Array.isArray(c.value)
        ? c.value.filter((x): x is string => typeof x === 'string')
        : [];
      if (c.op === 'intersects') {
        ok = arr.some((rid) => ctx.memberRoleIds.has(rid));
      }
      break;
    }
    case 'counter.prior_rule_hits': {
      if (c.op === 'gte' && c.value && typeof c.value === 'object') {
        const v = c.value as Record<string, unknown>;
        const ruleId = typeof v.ruleId === 'string' ? v.ruleId : '';
        const window = v.window as AutomodTimeWindow;
        const min = typeof v.min === 'number' ? v.min : NaN;
        if (ruleId && TIME_WINDOW_SET.has(window) && Number.isFinite(min)) {
          ok = ctx.priorHitCounter(ruleId, window) >= min;
        }
      }
      break;
    }
    case 'counter.burst_messages': {
      if (c.op === 'gte') {
        const n = typeof c.value === 'number' ? c.value : NaN;
        ok = Number.isFinite(n) && ctx.burstCount >= n;
      }
      break;
    }
    case 'counter.duplicate_messages': {
      if (c.op === 'gte') {
        const n = typeof c.value === 'number' ? c.value : NaN;
        ok = Number.isFinite(n) && ctx.duplicateCount >= n;
      }
      break;
    }
    default:
      ok = false;
  }
  if (c.negate) ok = !ok;
  return ok;
}

const TIME_WINDOW_SET = new Set<AutomodTimeWindow>(['1h', '24h', '7d', '30d']);

export function evaluateAutomodNode(
  ctx: AutomodEvalContext,
  node: AutomodNode,
): boolean {
  if (node.kind === 'condition') {
    return evalCondition(ctx, node);
  }
  const { combinator, children } = node;
  if (children.length === 0) return false;
  if (combinator === 'AND') {
    return children.every((ch) => evaluateAutomodNode(ctx, ch));
  }
  return children.some((ch) => evaluateAutomodNode(ctx, ch));
}

export function ruleMatches(
  ctx: AutomodEvalContext,
  rule: EchoAutomodRule,
): boolean {
  if (!rule.enabled) return false;
  if (rule.exemptChannelIds.includes(ctx.channelId)) return false;
  for (const rid of rule.exemptRoleIds) {
    if (ctx.memberRoleIds.has(rid)) return false;
  }
  return evaluateAutomodNode(ctx, rule.conditionTree);
}

export function annotateAutomodNode(
  ctx: AutomodEvalContext,
  node: AutomodNode,
): { node: AutomodNode; matched: boolean; children?: unknown[] } {
  if (node.kind === 'condition') {
    return { node, matched: evalCondition(ctx, node) };
  }
  const childAnn = node.children.map((ch) => annotateAutomodNode(ctx, ch));
  const matched =
    node.combinator === 'AND'
      ? childAnn.every((c) => c.matched)
      : childAnn.some((c) => c.matched);
  return { node, matched, children: childAnn };
}
