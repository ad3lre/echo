/**
 * Server Banned-Words filter — shared contract for API + UI + evaluator.
 *
 * Replaces the old per-rule AutoMod system with a simpler preset-based
 * approach: admins pick a severity level and per-category actions.
 */

export type BannedWordCategory =
  | 'profanity'
  | 'slurs'
  | 'sexual_content'
  | 'insults';

export const BANNED_WORD_CATEGORIES: BannedWordCategory[] = [
  'profanity',
  'slurs',
  'sexual_content',
  'insults',
];

export const BANNED_WORD_CATEGORY_LABELS: Record<BannedWordCategory, string> = {
  profanity: 'Profanity',
  slurs: 'Slurs & Hate Speech',
  sexual_content: 'Sexual Content',
  insults: 'Insults',
};

export const BANNED_WORD_CATEGORY_DESCRIPTIONS: Record<
  BannedWordCategory,
  string
> = {
  profanity: 'Common swear words and vulgar language.',
  slurs: 'Racial, ethnic, and identity-based slurs.',
  sexual_content: 'Sexually explicit terms and phrases.',
  insults: 'Personal attacks and demeaning language.',
};

export type BannedWordPresetLevel =
  | 'off'
  | 'low'
  | 'medium'
  | 'high'
  | 'custom';

export const BANNED_WORD_PRESET_LEVELS: BannedWordPresetLevel[] = [
  'off',
  'low',
  'medium',
  'high',
  'custom',
];

export const BANNED_WORD_PRESET_LABELS: Record<BannedWordPresetLevel, string> =
  {
    off: 'Off',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    custom: 'Custom',
  };

export const BANNED_WORD_PRESET_DESCRIPTIONS: Record<
  BannedWordPresetLevel,
  string
> = {
  off: 'No words are filtered.',
  low: 'Only slurs and sexual content are filtered.',
  medium: 'Slurs, sexual content, and profanity are filtered.',
  high: 'All categories are filtered.',
  custom: 'Choose which categories to enable and what action each takes.',
};

export type BannedWordActionKind =
  | 'block_message'
  | 'delete_message'
  | 'timeout_5m'
  | 'timeout_60m'
  | 'warn_dm';

export const BANNED_WORD_ACTION_KINDS: BannedWordActionKind[] = [
  'block_message',
  'delete_message',
  'timeout_5m',
  'timeout_60m',
  'warn_dm',
];

export const BANNED_WORD_ACTION_LABELS: Record<BannedWordActionKind, string> = {
  block_message: 'Block message',
  delete_message: 'Delete message',
  timeout_5m: 'Timeout (5 min)',
  timeout_60m: 'Timeout (1 hour)',
  warn_dm: 'Warn via DM',
};

export interface BannedWordCategoryConfig {
  enabled: boolean;
  action: BannedWordActionKind;
}

/** Preset category defaults — which categories are on at each level. */
export const BANNED_WORD_PRESET_DEFAULTS: Record<
  Exclude<BannedWordPresetLevel, 'custom' | 'off'>,
  Record<BannedWordCategory, BannedWordCategoryConfig>
> = {
  low: {
    profanity: { enabled: false, action: 'block_message' },
    slurs: { enabled: true, action: 'block_message' },
    sexual_content: { enabled: true, action: 'block_message' },
    insults: { enabled: false, action: 'block_message' },
  },
  medium: {
    profanity: { enabled: true, action: 'block_message' },
    slurs: { enabled: true, action: 'delete_message' },
    sexual_content: { enabled: true, action: 'delete_message' },
    insults: { enabled: false, action: 'block_message' },
  },
  high: {
    profanity: { enabled: true, action: 'delete_message' },
    slurs: { enabled: true, action: 'timeout_5m' },
    sexual_content: { enabled: true, action: 'timeout_5m' },
    insults: { enabled: true, action: 'delete_message' },
  },
};

export interface EchoBannedWordsConfig {
  serverId: string;
  presetLevel: BannedWordPresetLevel;
  categories: Record<BannedWordCategory, BannedWordCategoryConfig>;
  /** Custom words to always filter (in addition to preset wordlists). */
  customWords: string[];
  /** Roles that bypass the banned-words filter entirely. */
  exemptRoleIds: string[];
  updatedAt: string;
}

export const BANNED_WORDS_MAX_CUSTOM_WORDS = 500;
export const BANNED_WORDS_MAX_WORD_LENGTH = 100;
export const BANNED_WORDS_MAX_EXEMPT_ROLES = 50;

/** Creates a default (off) config for a server. */
export function defaultBannedWordsConfig(
  serverId: string,
): EchoBannedWordsConfig {
  return {
    serverId,
    presetLevel: 'off',
    categories: {
      profanity: { enabled: false, action: 'block_message' },
      slurs: { enabled: false, action: 'block_message' },
      sexual_content: { enabled: false, action: 'block_message' },
      insults: { enabled: false, action: 'block_message' },
    },
    customWords: [],
    exemptRoleIds: [],
    updatedAt: new Date().toISOString(),
  };
}
