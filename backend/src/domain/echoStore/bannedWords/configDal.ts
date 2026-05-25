import type pg from 'pg';
import type {
  BannedWordCategory,
  BannedWordCategoryConfig,
  BannedWordPresetLevel,
  EchoBannedWordsConfig,
} from '../../../../../shared/types/bannedWords';
import {
  BANNED_WORD_CATEGORIES,
  BANNED_WORDS_MAX_CUSTOM_WORDS,
  BANNED_WORDS_MAX_EXEMPT_ROLES,
  BANNED_WORDS_MAX_WORD_LENGTH,
  defaultBannedWordsConfig,
} from '../../../../../shared/types/bannedWords';

function parseConfigFromRow(
  row: Record<string, unknown>,
): EchoBannedWordsConfig | null {
  const serverId = row.server_id != null ? String(row.server_id) : null;
  if (!serverId) return null;

  const presetLevel = (String(row.preset_level ?? 'off') ||
    'off') as BannedWordPresetLevel;

  let categories: Record<BannedWordCategory, BannedWordCategoryConfig>;
  try {
    const raw =
      typeof row.categories === 'string'
        ? JSON.parse(row.categories)
        : row.categories;
    categories = {} as Record<BannedWordCategory, BannedWordCategoryConfig>;
    for (const cat of BANNED_WORD_CATEGORIES) {
      const entry = raw?.[cat];
      categories[cat] = {
        enabled: entry?.enabled === true,
        action:
          typeof entry?.action === 'string' ? entry.action : 'block_message',
      };
    }
  } catch {
    categories = defaultBannedWordsConfig('').categories;
  }

  let customWords: string[] = [];
  try {
    const raw =
      typeof row.custom_words === 'string'
        ? JSON.parse(row.custom_words)
        : row.custom_words;
    if (Array.isArray(raw)) {
      customWords = raw
        .filter(
          (x): x is string => typeof x === 'string' && x.trim().length > 0,
        )
        .map((w) =>
          w.trim().toLowerCase().slice(0, BANNED_WORDS_MAX_WORD_LENGTH),
        )
        .slice(0, BANNED_WORDS_MAX_CUSTOM_WORDS);
    }
  } catch {
    customWords = [];
  }

  let exemptRoleIds: string[] = [];
  try {
    const raw =
      typeof row.exempt_role_ids === 'string'
        ? JSON.parse(row.exempt_role_ids)
        : row.exempt_role_ids;
    if (Array.isArray(raw)) {
      exemptRoleIds = raw
        .filter(
          (x): x is string => typeof x === 'string' && x.trim().length > 0,
        )
        .slice(0, BANNED_WORDS_MAX_EXEMPT_ROLES);
    }
  } catch {
    exemptRoleIds = [];
  }

  const updatedAt =
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at ?? new Date().toISOString());

  return {
    serverId,
    presetLevel,
    categories,
    customWords,
    exemptRoleIds,
    updatedAt,
  };
}

export async function getEchoBannedWordsConfig(
  pool: pg.Pool,
  serverId: string,
): Promise<EchoBannedWordsConfig> {
  const r = await pool.query(
    `SELECT * FROM echo_server_banned_words_config WHERE server_id = $1 LIMIT 1`,
    [serverId],
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return defaultBannedWordsConfig(serverId);
  return parseConfigFromRow(row) ?? defaultBannedWordsConfig(serverId);
}

export async function upsertEchoBannedWordsConfig(
  pool: pg.Pool,
  config: EchoBannedWordsConfig,
): Promise<EchoBannedWordsConfig> {
  const customWords = (config.customWords ?? [])
    .map((w) => w.trim().toLowerCase().slice(0, BANNED_WORDS_MAX_WORD_LENGTH))
    .filter((w) => w.length > 0)
    .slice(0, BANNED_WORDS_MAX_CUSTOM_WORDS);

  const exemptRoleIds = (config.exemptRoleIds ?? [])
    .filter((r) => typeof r === 'string' && r.trim().length > 0)
    .slice(0, BANNED_WORDS_MAX_EXEMPT_ROLES);

  await pool.query(
    `
    INSERT INTO echo_server_banned_words_config (
      server_id, preset_level, categories, custom_words, exempt_role_ids, updated_at
    ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, NOW())
    ON CONFLICT (server_id) DO UPDATE SET
      preset_level = EXCLUDED.preset_level,
      categories = EXCLUDED.categories,
      custom_words = EXCLUDED.custom_words,
      exempt_role_ids = EXCLUDED.exempt_role_ids,
      updated_at = NOW()
    `,
    [
      config.serverId,
      config.presetLevel,
      JSON.stringify(config.categories),
      JSON.stringify(customWords),
      JSON.stringify(exemptRoleIds),
    ],
  );

  return getEchoBannedWordsConfig(pool, config.serverId);
}
