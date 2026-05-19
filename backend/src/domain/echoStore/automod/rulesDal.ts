import type pg from 'pg';
import { nextEchoSnowflakeId } from '../../echoSnowflake';
import type { EchoAutomodRule } from '../../../../../shared/types/automod';
import { AUTOMOD_MAX_RULES_PER_SERVER } from '../../../../../shared/types/automod';
import { parseAutomodRuleFromRow } from './schema';

export async function listEchoMemberRoleIdsForServerUser(
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

export async function countEchoAutomodRulesForServer(
  pool: pg.Pool,
  serverId: string,
): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM echo_server_automod_rules WHERE server_id = $1`,
    [serverId],
  );
  return Number(r.rows[0]?.c ?? 0);
}

export async function listEchoAutomodRulesForServer(
  pool: pg.Pool,
  serverId: string,
): Promise<EchoAutomodRule[]> {
  const r = await pool.query(
    `
    SELECT r.*,
      COALESCE((
        SELECT COUNT(*)::int
        FROM echo_server_automod_rule_hits h
        WHERE h.rule_id = r.id
          AND h.created_at >= NOW() - interval '24 hours'
          AND h.outcome IN ('blocked', 'applied')
      ), 0) AS hit_count_last_24h
    FROM echo_server_automod_rules r
    WHERE r.server_id = $1
    ORDER BY r.position ASC, r.id ASC
    `,
    [serverId],
  );
  const out: EchoAutomodRule[] = [];
  for (const row of r.rows) {
    const parsed = parseAutomodRuleFromRow(row as Record<string, unknown>);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function getEchoAutomodRuleById(
  pool: pg.Pool,
  serverId: string,
  ruleId: string,
): Promise<EchoAutomodRule | null> {
  const r = await pool.query(
    `
    SELECT r.*,
      COALESCE((
        SELECT COUNT(*)::int
        FROM echo_server_automod_rule_hits h
        WHERE h.rule_id = r.id
          AND h.created_at >= NOW() - interval '24 hours'
          AND h.outcome IN ('blocked', 'applied')
      ), 0) AS hit_count_last_24h
    FROM echo_server_automod_rules r
    WHERE r.server_id = $1 AND r.id = $2
    LIMIT 1
    `,
    [serverId, ruleId],
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseAutomodRuleFromRow(row);
}

export async function insertEchoAutomodRule(
  pool: pg.Pool,
  input: {
    serverId: string;
    createdByUserId: string;
    name: string;
    icon: string;
    enabled: boolean;
    position: number;
    triggerType: string;
    conditionTree: unknown;
    actions: unknown;
    exemptRoleIds: string[];
    exemptChannelIds: string[];
    logChannelId: string | null;
  },
): Promise<string> {
  const cnt = await countEchoAutomodRulesForServer(pool, input.serverId);
  if (cnt >= AUTOMOD_MAX_RULES_PER_SERVER) {
    throw new Error('AUTOMOD_RULE_LIMIT');
  }
  const id = nextEchoSnowflakeId();
  await pool.query(
    `
    INSERT INTO echo_server_automod_rules (
      id, server_id, name, icon, enabled, position, trigger_type,
      condition_tree, actions, exempt_role_ids, exempt_channel_ids,
      log_channel_id, created_by_user_id, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
      $12, $13, NOW(), NOW()
    )
    `,
    [
      id,
      input.serverId,
      input.name.trim().slice(0, 100),
      input.icon.trim().slice(0, 32) || 'shield',
      input.enabled,
      input.position,
      input.triggerType,
      JSON.stringify(input.conditionTree),
      JSON.stringify(input.actions),
      JSON.stringify(input.exemptRoleIds),
      JSON.stringify(input.exemptChannelIds),
      input.logChannelId,
      input.createdByUserId,
    ],
  );
  return id;
}

export async function updateEchoAutomodRule(
  pool: pg.Pool,
  serverId: string,
  ruleId: string,
  patch: {
    name?: string;
    icon?: string;
    enabled?: boolean;
    position?: number;
    triggerType?: string;
    conditionTree?: unknown;
    actions?: unknown;
    exemptRoleIds?: string[];
    exemptChannelIds?: string[];
    logChannelId?: string | null;
  },
): Promise<boolean> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (patch.name !== undefined) {
    updates.push(`name = $${i++}`);
    params.push(String(patch.name).trim().slice(0, 100));
  }
  if (patch.icon !== undefined) {
    updates.push(`icon = $${i++}`);
    params.push(String(patch.icon).trim().slice(0, 32) || 'shield');
  }
  if (patch.enabled !== undefined) {
    updates.push(`enabled = $${i++}`);
    params.push(patch.enabled);
  }
  if (patch.position !== undefined) {
    updates.push(`position = $${i++}`);
    params.push(Math.floor(patch.position));
  }
  if (patch.triggerType !== undefined) {
    updates.push(`trigger_type = $${i++}`);
    params.push(patch.triggerType);
  }
  if (patch.conditionTree !== undefined) {
    updates.push(`condition_tree = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.conditionTree));
  }
  if (patch.actions !== undefined) {
    updates.push(`actions = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.actions));
  }
  if (patch.exemptRoleIds !== undefined) {
    updates.push(`exempt_role_ids = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.exemptRoleIds));
  }
  if (patch.exemptChannelIds !== undefined) {
    updates.push(`exempt_channel_ids = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.exemptChannelIds));
  }
  if (patch.logChannelId !== undefined) {
    updates.push(`log_channel_id = $${i++}`);
    params.push(patch.logChannelId);
  }
  if (updates.length === 0) return false;
  updates.push(`updated_at = NOW()`);
  params.push(serverId, ruleId);
  const r = await pool.query(
    `UPDATE echo_server_automod_rules SET ${updates.join(', ')} WHERE server_id = $${i++} AND id = $${i}`,
    params,
  );
  return (r.rowCount ?? 0) > 0;
}

export async function deleteEchoAutomodRule(
  pool: pg.Pool,
  serverId: string,
  ruleId: string,
): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM echo_server_automod_rules WHERE server_id = $1 AND id = $2`,
    [serverId, ruleId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function reorderEchoAutomodRules(
  pool: pg.Pool,
  serverId: string,
  orderedIds: string[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let pos = 0;
    for (const id of orderedIds) {
      await client.query(
        `UPDATE echo_server_automod_rules SET position = $1, updated_at = NOW() WHERE server_id = $2 AND id = $3`,
        [pos++, serverId, id],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const WINDOW_INTERVAL: Record<string, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

export async function countEchoAutomodPriorHits(
  pool: pg.Pool,
  serverId: string,
  ruleId: string,
  userId: string,
  window: string,
): Promise<number> {
  const interval = WINDOW_INTERVAL[window];
  if (!interval) return 0;
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS c
    FROM echo_server_automod_rule_hits
    WHERE server_id = $1 AND rule_id = $2 AND user_id = $3
      AND outcome IN ('blocked', 'applied')
      AND created_at >= NOW() - $4::interval
    `,
    [serverId, ruleId, userId, interval],
  );
  return Number(r.rows[0]?.c ?? 0);
}

/** Raw hits in last 30d for batching prior counts in evaluator */
export async function listEchoAutomodHitsForUserServerRecent(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<Array<{ rule_id: string; created_at: Date; outcome: string }>> {
  const r = await pool.query(
    `
    SELECT rule_id, created_at, outcome
    FROM echo_server_automod_rule_hits
    WHERE server_id = $1 AND user_id = $2
      AND created_at >= NOW() - interval '30 days'
    `,
    [serverId, userId],
  );
  return r.rows.map((row) => ({
    rule_id: String(row.rule_id),
    created_at:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(String(row.created_at)),
    outcome: String(row.outcome ?? ''),
  }));
}

export async function countEchoAutomodRuleHitsSince(
  pool: pg.Pool,
  ruleId: string,
  since: Date,
): Promise<number> {
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS c
    FROM echo_server_automod_rule_hits
    WHERE rule_id = $1 AND created_at >= $2::timestamptz
    `,
    [ruleId, since],
  );
  return Number(r.rows[0]?.c ?? 0);
}

export async function insertEchoAutomodRuleHit(
  pool: pg.Pool,
  input: {
    id: string;
    ruleId: string;
    serverId: string;
    userId: string;
    channelId: string;
    messageId: string | null;
    correlationId: string;
    outcome: 'blocked' | 'applied' | 'partial_failed';
    actionsApplied: Record<string, unknown>;
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_server_automod_rule_hits (
      id, rule_id, server_id, user_id, channel_id, message_id,
      correlation_id, outcome, actions_applied, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW())
    ON CONFLICT (rule_id, correlation_id) DO NOTHING
    `,
    [
      input.id,
      input.ruleId,
      input.serverId,
      input.userId,
      input.channelId,
      input.messageId,
      input.correlationId,
      input.outcome,
      JSON.stringify(input.actionsApplied),
    ],
  );
}

export async function listEchoAutomodRuleHits(
  pool: pg.Pool,
  ruleId: string,
  limit: number,
): Promise<
  Array<{
    id: string;
    userId: string;
    channelId: string;
    messageId: string | null;
    outcome: string;
    createdAt: string;
  }>
> {
  const lim = Math.min(200, Math.max(1, limit));
  const r = await pool.query(
    `
    SELECT id, user_id, channel_id, message_id, outcome, created_at
    FROM echo_server_automod_rule_hits
    WHERE rule_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [ruleId, lim],
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    channelId: String(row.channel_id),
    messageId: row.message_id != null ? String(row.message_id) : null,
    outcome: String(row.outcome),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }));
}
