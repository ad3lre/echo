import { randomUUID } from 'crypto';
import type {
  AutomodAction,
  AutomodConditionField,
  AutomodConditionNode,
  AutomodConditionOp,
  AutomodDeleteRecentMinutes,
  AutomodGroupCombinator,
  AutomodNode,
  AutomodTimeWindow,
  AutomodTriggerType,
  EchoAutomodRule,
} from '../../../../../shared/types/automod';
import {
  AUTOMOD_DELETE_RECENT_MAX_MESSAGES,
  AUTOMOD_DELETE_RECENT_MINUTES,
  AUTOMOD_MAX_NODES_PER_RULE,
  AUTOMOD_MAX_RE2_PATTERN_LEN,
  AUTOMOD_MAX_RULES_PER_SERVER,
  AUTOMOD_MAX_TREE_DEPTH,
  AUTOMOD_MAX_WORDLIST_ENTRIES,
} from '../../../../../shared/types/automod';
import { isRe2AutomodAvailable } from './re2Safe';

export type AutomodSchemaErrorCode =
  | 'invalid_tree'
  | 'invalid_actions'
  | 'regex_requires_re2'
  | 'block_and_delete_conflict'
  | 'too_many_nodes'
  | 'too_deep'
  | 'invalid_condition';

const TIME_WINDOWS: AutomodTimeWindow[] = ['1h', '24h', '7d', '30d'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string' || !x.trim()) return null;
    out.push(x.trim());
  }
  return out;
}

function normalizeId(id: unknown): string {
  const s = asString(id);
  if (s && s.trim()) return s.trim();
  return randomUUID();
}

export function parseAutomodNode(raw: unknown): AutomodNode | null {
  if (!isRecord(raw)) return null;
  const kind = raw.kind;
  if (kind === 'group') {
    const comb = raw.combinator === 'OR' ? 'OR' : 'AND';
    const childrenRaw = raw.children;
    if (!Array.isArray(childrenRaw)) return null;
    const children: AutomodNode[] = [];
    for (const c of childrenRaw) {
      const n = parseAutomodNode(c);
      if (!n) return null;
      children.push(n);
    }
    return {
      kind: 'group',
      id: normalizeId(raw.id),
      combinator: comb as AutomodGroupCombinator,
      children,
    };
  }
  if (kind === 'condition') {
    const field = asString(raw.field);
    const op = asString(raw.op);
    if (!field || !op) return null;
    return {
      kind: 'condition',
      id: normalizeId(raw.id),
      field: field as AutomodConditionField,
      op: op as AutomodConditionOp,
      value: raw.value,
      negate: raw.negate === true,
    };
  }
  return null;
}

function countNodes(n: AutomodNode): number {
  if (n.kind === 'condition') return 1;
  return 1 + n.children.reduce((a, c) => a + countNodes(c), 0);
}

function maxDepth(n: AutomodNode, d = 1): number {
  if (n.kind === 'condition') return d;
  return Math.max(
    d,
    ...n.children.map((c) => maxDepth(c, d + 1)),
  );
}

function validateConditionValue(
  field: AutomodConditionField,
  op: AutomodConditionOp,
  value: unknown,
  re2Ok: boolean,
): AutomodSchemaErrorCode | null {
  if (field === 'message.content') {
    if (op === 'contains' || op === 'equals') {
      const s = asString(value);
      if (!s || s.length > 2000) return 'invalid_condition';
      return null;
    }
    if (op === 'matches_regex_re2') {
      if (!re2Ok) return 'regex_requires_re2';
      const s = asString(value);
      if (!s || s.length > AUTOMOD_MAX_RE2_PATTERN_LEN)
        return 'invalid_condition';
      return null;
    }
    return 'invalid_condition';
  }
  if (field === 'message.mention_count') {
    if (op !== 'gte') return 'invalid_condition';
    const n = asNumber(value);
    if (n == null || n < 0 || n > 200) return 'invalid_condition';
    return null;
  }
  if (field === 'channel.id') {
    if (op !== 'in' && op !== 'not_in') return 'invalid_condition';
    const arr = asStringArray(value);
    if (!arr || arr.length === 0 || arr.length > 200) return 'invalid_condition';
    return null;
  }
  if (field === 'author.role_ids') {
    if (op !== 'intersects') return 'invalid_condition';
    const arr = asStringArray(value);
    if (!arr || arr.length === 0 || arr.length > AUTOMOD_MAX_WORDLIST_ENTRIES)
      return 'invalid_condition';
    return null;
  }
  if (field === 'counter.prior_rule_hits') {
    if (op !== 'gte') return 'invalid_condition';
    if (!isRecord(value)) return 'invalid_condition';
    const ruleId = asString(value.ruleId);
    const window = asString(value.window);
    const min = asNumber(value.min);
    if (!ruleId || !window || min == null || min < 0 || min > 10_000)
      return 'invalid_condition';
    if (!TIME_WINDOWS.includes(window as AutomodTimeWindow))
      return 'invalid_condition';
    return null;
  }
  if (field === 'counter.burst_messages' || field === 'counter.duplicate_messages') {
    if (op !== 'gte') return 'invalid_condition';
    const n = asNumber(value);
    if (n == null || n < 0 || n > 10_000) return 'invalid_condition';
    return null;
  }
  return 'invalid_condition';
}

function walkConditions(
  n: AutomodNode,
  fn: (c: AutomodConditionNode) => AutomodSchemaErrorCode | null,
): AutomodSchemaErrorCode | null {
  if (n.kind === 'condition') return fn(n);
  for (const c of n.children) {
    const e = walkConditions(c, fn);
    if (e) return e;
  }
  return null;
}

export function parseActions(raw: unknown): AutomodAction[] | null {
  if (!Array.isArray(raw)) return null;
  const out: AutomodAction[] = [];
  for (const a of raw) {
    if (!isRecord(a)) return null;
    const kind = asString(a.kind);
    if (!kind) return null;
    if (kind === 'block_message') {
      out.push({ kind: 'block_message', phase: 'pre_send' });
      continue;
    }
    if (kind === 'delete_recent_messages') {
      const wm = asNumber(a.windowMinutes);
      if (
        wm == null ||
        !AUTOMOD_DELETE_RECENT_MINUTES.includes(
          wm as AutomodDeleteRecentMinutes,
        )
      )
        return null;
      out.push({
        kind: 'delete_recent_messages',
        phase: 'must_succeed_post',
        windowMinutes: wm as AutomodDeleteRecentMinutes,
      });
      continue;
    }
    if (kind === 'timeout') {
      const minutes = asNumber(a.minutes);
      if (minutes == null || minutes < 1 || minutes > 40320) return null;
      out.push({ kind: 'timeout', phase: 'must_succeed_post', minutes });
      continue;
    }
    if (kind === 'kick') {
      out.push({ kind: 'kick', phase: 'must_succeed_post' });
      continue;
    }
    if (kind === 'ban') {
      const hours = a.deleteRecentMessagesHours;
      const h =
        typeof hours === 'number' && Number.isFinite(hours)
          ? Math.floor(hours)
          : undefined;
      out.push({
        kind: 'ban',
        phase: 'must_succeed_post',
        ...(h != null && h > 0 ? { deleteRecentMessagesHours: h } : {}),
      });
      continue;
    }
    if (kind === 'warn_user_dm') {
      const text = asString(a.text);
      if (!text || text.length > 2000) return null;
      out.push({ kind: 'warn_user_dm', phase: 'best_effort_post', text });
      continue;
    }
    if (kind === 'alert_log_channel') {
      const text = asString(a.text);
      if (!text || text.length > 2000) return null;
      out.push({ kind: 'alert_log_channel', phase: 'best_effort_post', text });
      continue;
    }
    if (kind === 'system_notice_in_channel') {
      const text = asString(a.text);
      if (!text || text.length > 2000) return null;
      const channelId = asString(a.channelId);
      out.push({
        kind: 'system_notice_in_channel',
        phase: 'best_effort_post',
        text,
        ...(channelId ? { channelId } : {}),
      });
      continue;
    }
    if (kind === 'add_role' || kind === 'remove_role') {
      const roleId = asString(a.roleId);
      if (!roleId) return null;
      out.push({
        kind,
        phase: 'best_effort_post',
        roleId,
      });
      continue;
    }
    return null;
  }
  return out;
}

export function validateAutomodRuleDraft(input: {
  name: string;
  icon?: string;
  enabled?: boolean;
  position?: number;
  triggerType?: AutomodTriggerType;
  conditionTree: AutomodNode;
  actions: AutomodAction[];
  exemptRoleIds: string[];
  exemptChannelIds: string[];
  logChannelId: string | null;
}): { ok: true } | { ok: false; code: AutomodSchemaErrorCode } {
  const re2Ok = isRe2AutomodAvailable();
  const depth = maxDepth(input.conditionTree);
  if (depth > AUTOMOD_MAX_TREE_DEPTH)
    return { ok: false, code: 'too_deep' };
  const nodes = countNodes(input.conditionTree);
  if (nodes > AUTOMOD_MAX_NODES_PER_RULE)
    return { ok: false, code: 'too_many_nodes' };

  const condErr = walkConditions(input.conditionTree, (c) =>
    validateConditionValue(c.field, c.op, c.value, re2Ok),
  );
  if (condErr) return { ok: false, code: condErr };

  const hasBlock = input.actions.some((a) => a.kind === 'block_message');
  const hasDelete = input.actions.some(
    (a) => a.kind === 'delete_recent_messages',
  );
  if (hasBlock && hasDelete) return { ok: false, code: 'block_and_delete_conflict' };

  if (input.actions.length === 0)
    return { ok: false, code: 'invalid_actions' };

  return { ok: true };
}

export function parseAutomodRuleFromRow(
  row: Record<string, unknown>,
): EchoAutomodRule | null {
  const tree = parseAutomodNode(row.condition_tree);
  const actions = parseActions(row.actions);
  if (!tree || !actions) return null;
  const exemptRoleIds = asStringArray(row.exempt_role_ids) ?? [];
  const exemptChannelIds = asStringArray(row.exempt_channel_ids) ?? [];
  const logRaw = row.log_channel_id;
  const logChannelId =
    logRaw != null && String(logRaw).trim() !== ''
      ? String(logRaw).trim()
      : null;
  const createdAt =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at ?? '');
  const updatedAt =
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at ?? '');
  const draft = {
    name: String(row.name ?? '').trim() || 'Rule',
    conditionTree: tree,
    actions,
    exemptRoleIds,
    exemptChannelIds,
    logChannelId,
  };
  const v = validateAutomodRuleDraft(draft);
  if (!v.ok) return null;
  const hitRaw = row.hit_count_last_24h;
  const recentHitCount24h =
    typeof hitRaw === 'number' && Number.isFinite(hitRaw)
      ? Math.max(0, Math.floor(hitRaw))
      : hitRaw != null && String(hitRaw).trim() !== ''
        ? Math.max(0, Math.floor(Number(hitRaw)) || 0)
        : undefined;

  return {
    id: String(row.id),
    serverId: String(row.server_id),
    name: draft.name,
    icon: String(row.icon ?? 'shield').trim() || 'shield',
    enabled: row.enabled !== false,
    position: Number(row.position ?? 0),
    triggerType: (String(row.trigger_type ?? 'message.create') ||
      'message.create') as AutomodTriggerType,
    conditionTree: tree,
    actions,
    exemptRoleIds,
    exemptChannelIds,
    logChannelId,
    createdByUserId:
      row.created_by_user_id != null
        ? String(row.created_by_user_id)
        : null,
    createdAt,
    updatedAt,
    ...(recentHitCount24h !== undefined
      ? { recentHitCount24h }
      : {}),
  };
}

export { AUTOMOD_MAX_RULES_PER_SERVER, AUTOMOD_DELETE_RECENT_MAX_MESSAGES };
