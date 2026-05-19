/**
 * Server AutoMod custom rules — shared contract for API + UI + evaluator.
 * @see backend/src/domain/echoStore/automod for authoritative validation.
 */

export type AutomodTriggerType = 'message.create';

export type AutomodTimeWindow = '1h' | '24h' | '7d' | '30d';

export const AUTOMOD_DELETE_RECENT_MINUTES = [5, 15, 60] as const;
export type AutomodDeleteRecentMinutes =
  (typeof AUTOMOD_DELETE_RECENT_MINUTES)[number];

export type AutomodActionPhase =
  | 'pre_send'
  | 'must_succeed_post'
  | 'best_effort_post';

export type AutomodAction =
  | { kind: 'block_message'; phase: 'pre_send' }
  | {
      kind: 'delete_recent_messages';
      phase: 'must_succeed_post';
      windowMinutes: AutomodDeleteRecentMinutes;
    }
  | { kind: 'timeout'; phase: 'must_succeed_post'; minutes: number }
  | { kind: 'kick'; phase: 'must_succeed_post' }
  | {
      kind: 'ban';
      phase: 'must_succeed_post';
      /** Optional ban purge hours (whitelist via moderation meta). */
      deleteRecentMessagesHours?: number;
    }
  | { kind: 'warn_user_dm'; phase: 'best_effort_post'; text: string }
  | { kind: 'alert_log_channel'; phase: 'best_effort_post'; text: string }
  | {
      kind: 'system_notice_in_channel';
      phase: 'best_effort_post';
      /** Omit to use trigger channel. */
      channelId?: string;
      text: string;
    }
  | { kind: 'add_role'; phase: 'best_effort_post'; roleId: string }
  | { kind: 'remove_role'; phase: 'best_effort_post'; roleId: string };

export type AutomodGroupCombinator = 'AND' | 'OR';

export type AutomodConditionNode = {
  kind: 'condition';
  /** Stable id for UI + test annotations */
  id: string;
  field: AutomodConditionField;
  op: AutomodConditionOp;
  value: unknown;
  negate?: boolean;
};

export type AutomodConditionField =
  | 'message.content'
  | 'message.mention_count'
  | 'channel.id'
  | 'author.role_ids'
  | 'counter.prior_rule_hits'
  | 'counter.burst_messages'
  | 'counter.duplicate_messages';

export type AutomodConditionOp =
  | 'contains'
  | 'equals'
  | 'matches_regex_re2'
  | 'gte'
  | 'in'
  | 'not_in'
  | 'intersects';

export type AutomodGroupNode = {
  kind: 'group';
  id: string;
  combinator: AutomodGroupCombinator;
  children: AutomodNode[];
};

export type AutomodNode = AutomodGroupNode | AutomodConditionNode;

export interface EchoAutomodRule {
  id: string;
  serverId: string;
  name: string;
  icon: string;
  enabled: boolean;
  position: number;
  triggerType: AutomodTriggerType;
  conditionTree: AutomodNode;
  actions: AutomodAction[];
  exemptRoleIds: string[];
  exemptChannelIds: string[];
  logChannelId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Server-computed: qualifying hits in the last 24h (list/detail API). */
  recentHitCount24h?: number;
}

/** Hard caps — mirrored in backend schema validation */
export const AUTOMOD_MAX_RULES_PER_SERVER = 50;
export const AUTOMOD_MAX_NODES_PER_RULE = 64;
export const AUTOMOD_MAX_TREE_DEPTH = 6;
export const AUTOMOD_MAX_RE2_PATTERN_LEN = 200;
export const AUTOMOD_MAX_WORDLIST_ENTRIES = 200;
export const AUTOMOD_DELETE_RECENT_MAX_MESSAGES = 100;

export type AutomodFieldValueKind =
  | 'string'
  | 'number'
  | 'string_list'
  | 'regex'
  | 'time_window'
  | 'rule_id_and_window'
  | 'burst_window'
  | 'duplicate_window';

export type AutomodFieldDef = {
  field: AutomodConditionField;
  label: string;
  valueKind: AutomodFieldValueKind;
  ops: AutomodConditionOp[];
  /** Help for editors / RE2 subset */
  help?: string;
};

export const AUTOMOD_FIELDS: AutomodFieldDef[] = [
  {
    field: 'message.content',
    label: 'Message text',
    valueKind: 'string',
    ops: ['contains', 'equals', 'matches_regex_re2'],
    help: 'Regex uses RE2 syntax only (no backreferences). Disabled if this server build lacks RE2.',
  },
  {
    field: 'message.mention_count',
    label: 'Mention count',
    valueKind: 'number',
    ops: ['gte'],
  },
  {
    field: 'channel.id',
    label: 'Channel',
    valueKind: 'string_list',
    ops: ['in', 'not_in'],
  },
  {
    field: 'author.role_ids',
    label: 'Member roles',
    valueKind: 'string_list',
    ops: ['intersects'],
  },
  {
    field: 'counter.prior_rule_hits',
    label: 'Prior rule hits',
    valueKind: 'rule_id_and_window',
    ops: ['gte'],
    help: 'Count of prior triggers for this rule in the rolling window (excludes the current send until it succeeds).',
  },
  {
    field: 'counter.burst_messages',
    label: 'Burst messages (server window)',
    valueKind: 'burst_window',
    ops: ['gte'],
    help: 'Uses the same sliding window as the built-in spam filter burst check.',
  },
  {
    field: 'counter.duplicate_messages',
    label: 'Duplicate matches (server window)',
    valueKind: 'duplicate_window',
    ops: ['gte'],
    help: 'Normalized body matches in the duplicate-detection window.',
  },
];

export type AutomodEffectiveCapabilities = {
  re2RegexAvailable: boolean;
  automodActorUserId: string;
  /** Server owner is the actor for automated moderation calls. */
  ownerActsAsAutomod: true;
};
