import type pg from 'pg';

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}
import { nextEchoSnowflakeId } from '../echoSnowflake';
import { clientImageUrlForResolvedEmoji } from '../../services/echoEmojiAsset';
import { mediaUrlPassesEchoPolicy } from '../../services/mediaUrlPolicy';
import { twemoji72UrlForGlyph } from '../../services/twemojiAssetUrl';
import { getMergedRolePermissions } from './permissions';

export const MAX_SERVER_EMOJI_PACKS = 6;
export const MAX_EMOJIS_PER_PACK = 64;
const MAX_IMAGE_URL_LEN = 600_000;
/** Minimum trimmed length for pack descriptions (create + market listing). */
export const MIN_EMOJI_PACK_DESCRIPTION_LEN = 10;
const MAX_EMOJI_PACK_DESCRIPTION_LEN = 2000;

export type EchoEmojiPackMarketSettingsDto = {
  tags: string[];
};

export type EchoEmojiMarketEmojiDto = {
  id: string;
  name: string;
  kind: 'static' | 'animated';
  char?: string;
  previewUrl?: string;
};

export type EchoEmojiMarketPackDto = {
  id: string;
  name: string;
  description: string;
  authorServerName: string;
  totalUseCount: number;
  marketSettings: EchoEmojiPackMarketSettingsDto;
  emojis: EchoEmojiMarketEmojiDto[];
};

function parseMarketSettingsRow(raw: unknown): EchoEmojiPackMarketSettingsDto {
  if (raw === null || raw === undefined) return { tags: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { tags: [] };
  const o = raw as Record<string, unknown>;
  const tagsRaw = o.tags;
  if (!Array.isArray(tagsRaw)) return { tags: [] };
  const tags: string[] = [];
  for (const t of tagsRaw) {
    if (typeof t !== 'string') continue;
    const s = t.trim().slice(0, 32);
    if (s) tags.push(s.toLowerCase());
    if (tags.length >= 8) break;
  }
  return { tags };
}

export function normalizeMarketSettingsInput(
  input: unknown,
): { ok: true; value: EchoEmojiPackMarketSettingsDto } | { ok: false } {
  if (input === null || input === undefined)
    return { ok: true, value: { tags: [] } };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false };
  const o = input as Record<string, unknown>;
  if (!('tags' in o)) return { ok: true, value: { tags: [] } };
  const tagsRaw = o.tags;
  if (!Array.isArray(tagsRaw)) return { ok: false };
  const tags: string[] = [];
  for (const t of tagsRaw) {
    if (typeof t !== 'string') return { ok: false };
    const s = t.trim().slice(0, 32);
    if (s) tags.push(s.toLowerCase());
    if (tags.length >= 8) break;
  }
  return { ok: true, value: { tags } };
}

function validatePackDescription(raw: string): string | null {
  const t = raw.trim();
  if (t.length < MIN_EMOJI_PACK_DESCRIPTION_LEN) return null;
  if (t.length > MAX_EMOJI_PACK_DESCRIPTION_LEN) return null;
  return t;
}

export type EchoEmojiLibraryEmojiDto = {
  id: string;
  serverId?: string;
  name: string;
  animated: boolean;
  imageUrl: string;
  useCount: number;
  /** When set, message/reaction text may still use this Discord snowflake in <:name:id> tokens. */
  sourceDiscordEmojiId?: string | null;
};

export type EchoEmojiLibraryPackDto = {
  id: string;
  name: string;
  source: 'market' | 'custom';
  marketPackId: string | null;
  position: number;
  description: string;
  listedInMarket: boolean;
  marketSettings: EchoEmojiPackMarketSettingsDto;
  emojis: EchoEmojiLibraryEmojiDto[];
};

export type DiscordImportedEmojiInput = {
  name: string;
  animated: boolean;
  imageUrl: string;
  /** Original Discord emoji id — required for resolving imported message/reaction tokens. */
  discordEmojiId?: string;
};

export async function canManageServerEmojis(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const perms = await getMergedRolePermissions(pool, serverId, userId);
  return perms.has('MANAGE_GUILD') || perms.has('MANAGE_GUILD_EXPRESSIONS');
}

export async function listEchoServerEmojiLibrary(
  pool: pg.Pool,
  serverId: string,
): Promise<{ packs: EchoEmojiLibraryPackDto[] }> {
  const packsRes = await pool.query<{
    id: string;
    name: string;
    source: string;
    market_pack_id: string | null;
    position: number;
    description: string;
    listed_in_market: boolean;
    market_settings: unknown;
  }>(
    `SELECT id, name, source, market_pack_id, position,
            COALESCE(description, '') AS description,
            listed_in_market,
            market_settings
     FROM echo_server_emoji_packs WHERE server_id = $1 ORDER BY position ASC, created_at ASC`,
    [serverId],
  );

  const emojiRows = await pool.query<{
    id: string;
    pack_id: string;
    name: string;
    animated: boolean;
    image_url: string;
    use_count: string;
    discord_source_emoji_id: string | null;
  }>(
    `SELECT e.id, e.pack_id, e.name, e.animated, e.image_url,
            COALESCE(u.use_count, 0)::text AS use_count,
            e.discord_source_emoji_id
     FROM echo_server_custom_emojis e
     LEFT JOIN echo_server_emoji_usage u
       ON u.server_id = e.server_id AND u.emoji_id = e.id
     WHERE e.server_id = $1`,
    [serverId],
  );

  const byPack = new Map<string, EchoEmojiLibraryEmojiDto[]>();
  for (const row of emojiRows.rows) {
    const list = byPack.get(row.pack_id) ?? [];
    const d = row.discord_source_emoji_id?.trim();
    list.push({
      id: row.id,
      serverId,
      name: row.name,
      animated: row.animated,
      imageUrl: row.image_url,
      useCount: Number(row.use_count) || 0,
      ...(d ? { sourceDiscordEmojiId: d } : {}),
    });
    byPack.set(row.pack_id, list);
  }

  for (const [, emojis] of byPack) {
    emojis.sort((a, b) => {
      if (b.useCount !== a.useCount) return b.useCount - a.useCount;
      return a.name.localeCompare(b.name);
    });
  }

  const packMaxUse = new Map<string, number>();
  for (const p of packsRes.rows) {
    const em = byPack.get(p.id) ?? [];
    const mx = em.reduce((m, e) => Math.max(m, e.useCount), 0);
    packMaxUse.set(p.id, mx);
  }

  const sortedPacks = [...packsRes.rows].sort((a, b) => {
    const ua = packMaxUse.get(a.id) ?? 0;
    const ub = packMaxUse.get(b.id) ?? 0;
    if (ub !== ua) return ub - ua;
    return a.name.localeCompare(b.name);
  });

  const packs: EchoEmojiLibraryPackDto[] = sortedPacks.map((p) => ({
    id: p.id,
    name: p.name,
    source: p.source === 'custom' ? 'custom' : 'market',
    marketPackId: p.market_pack_id,
    position: p.position,
    description: p.description ?? '',
    listedInMarket: p.listed_in_market,
    marketSettings: parseMarketSettingsRow(p.market_settings),
    emojis: byPack.get(p.id) ?? [],
  }));

  return { packs };
}

export type EchoEmojiTokenResolveDto = {
  key: string;
  id: string;
  name: string;
  animated: boolean;
  imageUrl: string;
  /** Cross-guild proxy path when bytes live under `echo/emoji/{serverId}/…`. */
  assetUrl?: string;
  /** Original Discord emoji snowflake when imported. */
  sourceDiscordEmojiId?: string;
};

export async function resolveEchoEmojiTokens(
  pool: pg.Pool,
  _requesterUserId: string,
  ids: readonly string[],
): Promise<EchoEmojiTokenResolveDto[]> {
  const cleaned: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim();
    if (!t) continue;
    if (t.length > 64) continue;
    if (!/^\d+$/.test(t)) continue;
    cleaned.push(t);
    if (cleaned.length >= 200) break;
  }
  if (!cleaned.length) return [];

  const res = await pool.query<{
    id: string;
    server_id: string;
    name: string;
    animated: boolean;
    image_url: string;
    discord_source_emoji_id: string | null;
  }>(
    `SELECT e.id, e.server_id, e.name, e.animated, e.image_url, e.discord_source_emoji_id
     FROM echo_server_custom_emojis e
     WHERE e.id = ANY($1::text[]) OR e.discord_source_emoji_id = ANY($1::text[])`,
    [cleaned],
  );

  const want = new Set(cleaned);
  const out: EchoEmojiTokenResolveDto[] = [];
  const usedKeys = new Set<string>();

  const pushResolve = (key: string, row: (typeof res.rows)[0]) => {
    const stored = row.image_url?.trim() ?? '';
    if (!stored) return;
    const { imageUrl, assetUrl } = clientImageUrlForResolvedEmoji(
      row.id,
      stored,
    );
    const discordSource = row.discord_source_emoji_id?.trim() ?? '';
    out.push({
      key,
      id: row.id,
      name: row.name,
      animated: row.animated,
      imageUrl,
      ...(assetUrl ? { assetUrl } : {}),
      ...(discordSource ? { sourceDiscordEmojiId: discordSource } : {}),
    });
  };

  for (const row of res.rows) {
    if (want.has(row.id) && !usedKeys.has(row.id)) {
      usedKeys.add(row.id);
      pushResolve(row.id, row);
    }
    const d = row.discord_source_emoji_id?.trim() ?? '';
    if (d && want.has(d) && !usedKeys.has(d)) {
      usedKeys.add(d);
      pushResolve(d, row);
    }
  }
  return out;
}

/**
 * Public emoji market: every custom pack opted into listing with a valid description,
 * sorted by aggregate usage (this pack + all servers that imported it).
 */
export async function listEchoEmojiMarketPacks(
  pool: pg.Pool,
  query: string,
): Promise<EchoEmojiMarketPackDto[]> {
  const q = query.trim().toLowerCase();
  const minLen = MIN_EMOJI_PACK_DESCRIPTION_LEN;
  const rows = await pool.query<{
    id: string;
    name: string;
    description: string;
    server_name: string;
    total_uses: string;
    market_settings: unknown;
    emojis_json: unknown;
  }>(
    `SELECT
       p.id,
       p.name,
       TRIM(p.description) AS description,
       s.name AS server_name,
       sub.total_uses::text,
       p.market_settings,
       COALESCE(
         json_agg(
           json_build_object(
             'id', e.id,
             'name', e.name,
             'kind', CASE WHEN e.animated THEN 'animated' ELSE 'static' END,
             'previewUrl', e.image_url
           )
           ORDER BY e.name
         ) FILTER (WHERE e.id IS NOT NULL),
         '[]'::json
       ) AS emojis_json
     FROM echo_server_emoji_packs p
     JOIN echo_servers s ON s.id = p.server_id
     LEFT JOIN echo_server_custom_emojis e ON e.pack_id = p.id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(u.use_count), 0)::bigint AS total_uses
       FROM echo_server_custom_emojis e2
       JOIN echo_server_emoji_packs p2 ON p2.id = e2.pack_id
       LEFT JOIN echo_server_emoji_usage u ON u.emoji_id = e2.id AND u.server_id = e2.server_id
       WHERE p2.id = p.id OR p2.market_pack_id = p.id
     ) sub ON true
     WHERE p.source = 'custom'
       AND p.listed_in_market = true
       AND LENGTH(TRIM(p.description)) >= $2
     GROUP BY p.id, s.name, p.name, p.description, p.market_settings, sub.total_uses
     HAVING COUNT(e.id) > 0
       AND (
         $1 = ''
         OR LOWER(p.name) LIKE '%' || $1 || '%'
         OR LOWER(TRIM(p.description)) LIKE '%' || $1 || '%'
         OR LOWER(p.market_settings::text) LIKE '%' || $1 || '%'
       )
     ORDER BY sub.total_uses DESC NULLS LAST, p.name ASC`,
    [q, minLen],
  );

  const out: EchoEmojiMarketPackDto[] = [];
  for (const row of rows.rows) {
    const emRaw = row.emojis_json;
    const emojis: EchoEmojiMarketEmojiDto[] = [];
    if (Array.isArray(emRaw)) {
      for (const item of emRaw) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const id = typeof o.id === 'string' ? o.id : '';
        const name = typeof o.name === 'string' ? o.name : '';
        const kind =
          o.kind === 'animated' || o.kind === 'static' ? o.kind : 'static';
        const previewUrl =
          typeof o.previewUrl === 'string' ? o.previewUrl : undefined;
        if (!id || !name) continue;
        emojis.push({
          id,
          name,
          kind,
          ...(previewUrl ? { previewUrl } : {}),
        });
      }
    }
    out.push({
      id: row.id,
      name: row.name,
      description: row.description,
      authorServerName: row.server_name,
      totalUseCount: Number(row.total_uses) || 0,
      marketSettings: parseMarketSettingsRow(row.market_settings),
      emojis,
    });
  }
  return out;
}

export async function getEchoEmojiMarketPackById(
  pool: pg.Pool,
  packId: string,
): Promise<EchoEmojiMarketPackDto | null> {
  const id = packId.trim();
  if (!id) return null;
  const rows = await pool.query<{
    id: string;
    name: string;
    description: string;
    server_name: string;
    total_uses: string;
    market_settings: unknown;
  }>(
    `SELECT
       p.id,
       p.name,
       TRIM(p.description) AS description,
       s.name AS server_name,
       sub.total_uses::text,
       p.market_settings
     FROM echo_server_emoji_packs p
     JOIN echo_servers s ON s.id = p.server_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(u.use_count), 0)::bigint AS total_uses
       FROM echo_server_custom_emojis e2
       JOIN echo_server_emoji_packs p2 ON p2.id = e2.pack_id
       LEFT JOIN echo_server_emoji_usage u ON u.emoji_id = e2.id AND u.server_id = e2.server_id
       WHERE p2.id = p.id OR p2.market_pack_id = p.id
     ) sub ON true
     WHERE p.id = $1
       AND p.source = 'custom'
       AND p.listed_in_market = true
       AND LENGTH(TRIM(p.description)) >= $2`,
    [id, MIN_EMOJI_PACK_DESCRIPTION_LEN],
  );
  const head = rows.rows[0];
  if (!head) return null;

  const emojisRes = await pool.query<{
    id: string;
    name: string;
    animated: boolean;
    image_url: string;
  }>(
    `SELECT id, name, animated, image_url
     FROM echo_server_custom_emojis WHERE pack_id = $1 ORDER BY name ASC`,
    [id],
  );
  if (emojisRes.rows.length === 0) return null;

  const emojis: EchoEmojiMarketEmojiDto[] = emojisRes.rows.map((e) => ({
    id: e.id,
    name: e.name,
    kind: e.animated ? 'animated' : 'static',
    previewUrl: e.image_url,
  }));

  return {
    id: head.id,
    name: head.name,
    description: head.description,
    authorServerName: head.server_name,
    totalUseCount: Number(head.total_uses) || 0,
    marketSettings: parseMarketSettingsRow(head.market_settings),
    emojis,
  };
}

export async function listEchoUserEmojiLibrary(pool: pg.Pool): Promise<{
  packs: EchoEmojiLibraryPackDto[];
}> {
  const packsRes = await pool.query<{
    id: string;
    server_id: string;
    name: string;
    source: string;
    market_pack_id: string | null;
    position: number;
    description: string;
    listed_in_market: boolean;
    market_settings: unknown;
  }>(
    `SELECT id, server_id, name, source, market_pack_id, position,
            COALESCE(description, '') AS description,
            listed_in_market,
            market_settings
     FROM echo_server_emoji_packs
     ORDER BY position ASC, created_at ASC`,
  );
  if (packsRes.rows.length === 0) return { packs: [] };

  const emojiRows = await pool.query<{
    id: string;
    server_id: string;
    pack_id: string;
    name: string;
    animated: boolean;
    image_url: string;
    use_count: string;
    discord_source_emoji_id: string | null;
  }>(
    `SELECT e.id, e.server_id, e.pack_id, e.name, e.animated, e.image_url,
            COALESCE(SUM(u.use_count), 0)::text AS use_count,
            e.discord_source_emoji_id
     FROM echo_server_custom_emojis e
     LEFT JOIN echo_server_emoji_usage u
       ON u.emoji_id = e.id
     GROUP BY
       e.id, e.server_id, e.pack_id, e.name, e.animated, e.image_url, e.discord_source_emoji_id`,
  );

  const byPack = new Map<string, EchoEmojiLibraryEmojiDto[]>();
  for (const row of emojiRows.rows) {
    const list = byPack.get(row.pack_id) ?? [];
    const d = row.discord_source_emoji_id?.trim();
    list.push({
      id: row.id,
      serverId: row.server_id,
      name: row.name,
      animated: row.animated,
      imageUrl: row.image_url,
      useCount: Number(row.use_count) || 0,
      ...(d ? { sourceDiscordEmojiId: d } : {}),
    });
    byPack.set(row.pack_id, list);
  }

  for (const [, emojis] of byPack) {
    emojis.sort((a, b) => {
      if (b.useCount !== a.useCount) return b.useCount - a.useCount;
      return a.name.localeCompare(b.name);
    });
  }

  const packMaxUse = new Map<string, number>();
  for (const p of packsRes.rows) {
    const em = byPack.get(p.id) ?? [];
    const mx = em.reduce((m, e) => Math.max(m, e.useCount), 0);
    packMaxUse.set(p.id, mx);
  }

  const sortedPacks = [...packsRes.rows].sort((a, b) => {
    const ua = packMaxUse.get(a.id) ?? 0;
    const ub = packMaxUse.get(b.id) ?? 0;
    if (ub !== ua) return ub - ua;
    return a.name.localeCompare(b.name);
  });

  const packs: EchoEmojiLibraryPackDto[] = sortedPacks
    .filter((p) => (byPack.get(p.id)?.length ?? 0) > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      source: p.source === 'custom' ? 'custom' : 'market',
      marketPackId: p.market_pack_id,
      position: p.position,
      description: p.description ?? '',
      listedInMarket: p.listed_in_market,
      marketSettings: parseMarketSettingsRow(p.market_settings),
      emojis: byPack.get(p.id) ?? [],
    }));

  return { packs };
}

export type ImportMarketPackResult =
  | 'ok'
  | 'not_found'
  | 'limit'
  | 'forbidden'
  | 'duplicate';

export async function importEchoMarketEmojiPack(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  marketPackId: string,
): Promise<ImportMarketPackResult> {
  if (!(await canManageServerEmojis(pool, serverId, userId)))
    return 'forbidden';
  const catalog = await getEchoEmojiMarketPackById(pool, marketPackId);
  if (!catalog) return 'not_found';

  const cnt = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM echo_server_emoji_packs WHERE server_id = $1`,
    [serverId],
  );
  if (Number(cnt.rows[0]?.n ?? 0) >= MAX_SERVER_EMOJI_PACKS) return 'limit';

  const dup = await pool.query(
    `SELECT 1 FROM echo_server_emoji_packs WHERE server_id = $1 AND market_pack_id = $2`,
    [serverId, catalog.id],
  );
  if (dup.rows.length) return 'duplicate';

  const packId = nextEchoSnowflakeId();
  const posRow = await pool.query<{ p: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM echo_server_emoji_packs WHERE server_id = $1`,
    [serverId],
  );
  const position = Number(posRow.rows[0]?.p ?? 0);

  const client = await pool.connect();
  try {
    await client.query(`BEGIN`);
    try {
      await client.query(
        `INSERT INTO echo_server_emoji_packs (id, server_id, name, source, market_pack_id, position, description, listed_in_market, market_settings)
       VALUES ($1, $2, $3, 'market', $4, $5, $6, false, '{}'::jsonb)`,
        [
          packId,
          serverId,
          catalog.name,
          catalog.id,
          position,
          catalog.description.slice(0, MAX_EMOJI_PACK_DESCRIPTION_LEN),
        ],
      );
      if (catalog.emojis.length > 0) {
        const emojiValues: unknown[] = [];
        const tuples: string[] = [];
        catalog.emojis.forEach((em, index) => {
          const eid = nextEchoSnowflakeId();
          const url =
            em.previewUrl?.trim() || twemoji72UrlForGlyph(em.char ?? '❓');
          emojiValues.push(
            eid,
            serverId,
            packId,
            em.name,
            em.kind === 'animated',
            url,
          );
          const base = index * 6;
          tuples.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
          );
        });
        await client.query(
          `INSERT INTO echo_server_custom_emojis (id, server_id, pack_id, name, animated, image_url)
         VALUES ${tuples.join(', ')}`,
          emojiValues,
        );
      }
      await client.query(`COMMIT`);
    } catch (e) {
      await client.query(`ROLLBACK`);
      throw e;
    }
  } finally {
    client.release();
  }
  return 'ok';
}

export type CreateCustomPackResult =
  | { ok: true; packId: string }
  | {
      ok: false;
      reason: 'forbidden' | 'limit' | 'bad_description' | 'bad_settings';
    };

export async function createEchoCustomEmojiPack(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  displayName: string,
  descriptionRaw: string,
  marketSettingsInput: unknown,
  /** When true, pack appears in the public market (still requires non-empty valid description). */
  listedInMarket: boolean,
): Promise<CreateCustomPackResult> {
  if (!(await canManageServerEmojis(pool, serverId, userId)))
    return { ok: false, reason: 'forbidden' };
  const desc = validatePackDescription(descriptionRaw);
  if (!desc) return { ok: false, reason: 'bad_description' };
  const ms = normalizeMarketSettingsInput(marketSettingsInput);
  if (!ms.ok) return { ok: false, reason: 'bad_settings' };

  const cnt = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM echo_server_emoji_packs WHERE server_id = $1`,
    [serverId],
  );
  if (Number(cnt.rows[0]?.n ?? 0) >= MAX_SERVER_EMOJI_PACKS)
    return { ok: false, reason: 'limit' };

  const packId = nextEchoSnowflakeId();
  const posRow = await pool.query<{ p: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM echo_server_emoji_packs WHERE server_id = $1`,
    [serverId],
  );
  const position = Number(posRow.rows[0]?.p ?? 0);
  const name = displayName.trim() || 'My Emoji Pack';
  const list =
    listedInMarket && desc.length >= MIN_EMOJI_PACK_DESCRIPTION_LEN
      ? true
      : false;
  await pool.query(
    `INSERT INTO echo_server_emoji_packs (id, server_id, name, source, market_pack_id, position, description, listed_in_market, market_settings)
     VALUES ($1, $2, $3, 'custom', NULL, $4, $5, $6, $7::jsonb)`,
    [packId, serverId, name, position, desc, list, JSON.stringify(ms.value)],
  );
  return { ok: true, packId };
}

function normalizeCustomEmojiNameBase(
  nameRaw: string,
  fallbackIndex = 1,
): string {
  const normalized = nameRaw
    .trim()
    .replace(/\s+/g, '_')
    .replace(/:/g, '_')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '');
  if (normalized && /^[\w.-]{1,64}$/.test(normalized)) return normalized;
  return `emoji_${fallbackIndex}`;
}

function nextUniqueEmojiName(
  nameRaw: string,
  takenLower: Set<string>,
  fallbackIndex: number,
): string {
  const base = normalizeCustomEmojiNameBase(nameRaw, fallbackIndex);
  let candidate = base.slice(0, 64) || `emoji_${fallbackIndex}`;
  let suffix = 2;
  while (takenLower.has(candidate.toLowerCase())) {
    const suffixText = `_${suffix}`;
    const trimmedBase = base.slice(0, Math.max(1, 64 - suffixText.length));
    candidate = `${trimmedBase}${suffixText}`;
    suffix += 1;
  }
  takenLower.add(candidate.toLowerCase());
  return candidate;
}

export async function replaceDiscordImportedEmojiPack(
  pool: pg.Pool,
  serverId: string,
  input: {
    guildName: string;
    discordGuildId?: string | null;
    emojis: DiscordImportedEmojiInput[];
  },
): Promise<{ packId: string; importedCount: number }> {
  const packName = `${
    input.guildName.trim() || 'Imported Discord Server'
  } Emoji Pack`;
  const discordGuildId = input.discordGuildId?.trim() || '';
  const description = discordGuildId
    ? `Imported from Discord server ${discordGuildId}.`
    : 'Imported from Discord server.';

  const client = await pool.connect();
  try {
    await client.query(`BEGIN`);
    try {
      const existingPack = await client.query<{ id: string }>(
        `SELECT id
       FROM echo_server_emoji_packs
       WHERE server_id = $1
         AND source = 'custom'
         AND (
           (market_settings->>'importKind' = 'discord' AND market_settings->>'discordGuildId' = $2)
           OR description = $3
         )
       ORDER BY created_at ASC
       LIMIT 1`,
        [serverId, discordGuildId, description],
      );

      let packId = String(existingPack.rows[0]?.id ?? '');
      if (!packId) {
        packId = nextEchoSnowflakeId();
        const posRow = await client.query<{ p: number }>(
          `SELECT COALESCE(MAX(position), -1) + 1 AS p
         FROM echo_server_emoji_packs
         WHERE server_id = $1`,
          [serverId],
        );
        const position = Number(posRow.rows[0]?.p ?? 0);
        await client.query(
          `INSERT INTO echo_server_emoji_packs (
           id, server_id, name, source, market_pack_id, position,
           description, listed_in_market, market_settings
         )
         VALUES ($1, $2, $3, 'custom', NULL, $4, $5, false, $6::jsonb)`,
          [
            packId,
            serverId,
            packName,
            position,
            description,
            JSON.stringify({
              tags: [],
              importKind: 'discord',
              ...(discordGuildId ? { discordGuildId } : {}),
            }),
          ],
        );
      } else {
        await client.query(
          `UPDATE echo_server_emoji_packs
         SET name = $3,
             description = $4,
             market_settings = $5::jsonb
         WHERE id = $1 AND server_id = $2`,
          [
            packId,
            serverId,
            packName,
            description,
            JSON.stringify({
              tags: [],
              importKind: 'discord',
              ...(discordGuildId ? { discordGuildId } : {}),
            }),
          ],
        );
        await client.query(
          `DELETE FROM echo_server_custom_emojis
         WHERE server_id = $1 AND pack_id = $2`,
          [serverId, packId],
        );
      }

      if (input.emojis.length > 0) {
        const namesRes = await client.query<{ name: string }>(
          `SELECT name
         FROM echo_server_custom_emojis
         WHERE server_id = $1 AND pack_id <> $2`,
          [serverId, packId],
        );
        const takenLower = new Set(
          namesRes.rows
            .map((row) => row.name.trim().toLowerCase())
            .filter((name) => !!name),
        );

        const emojiValues: unknown[] = [];
        const tuples: string[] = [];
        input.emojis.forEach((emoji, index) => {
          const emojiId = nextEchoSnowflakeId();
          const name = nextUniqueEmojiName(emoji.name, takenLower, index + 1);
          const discordSource =
            typeof emoji.discordEmojiId === 'string'
              ? emoji.discordEmojiId.trim() || null
              : null;
          emojiValues.push(
            emojiId,
            serverId,
            packId,
            name,
            emoji.animated,
            emoji.imageUrl,
            discordSource,
          );
          const base = index * 7;
          tuples.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
          );
        });
        await client.query(
          `INSERT INTO echo_server_custom_emojis (
           id, server_id, pack_id, name, animated, image_url, discord_source_emoji_id
         )
         VALUES ${tuples.join(', ')}`,
          emojiValues,
        );
      }

      await client.query(`COMMIT`);
      return { packId, importedCount: input.emojis.length };
    } catch (error) {
      await client.query(`ROLLBACK`);
      throw error;
    }
  } finally {
    client.release();
  }
}

export type UpdateCustomPackMetaResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'not_custom'
  | 'bad_description'
  | 'bad_settings';

export async function updateEchoCustomEmojiPackMeta(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  packId: string,
  input: {
    name?: string;
    description?: string;
    listedInMarket?: boolean;
    marketSettings?: unknown;
  },
): Promise<UpdateCustomPackMetaResult> {
  if (!(await canManageServerEmojis(pool, serverId, userId)))
    return 'forbidden';
  const pack = await pool.query<{
    source: string;
    description: string;
    listed_in_market: boolean;
  }>(
    `SELECT source, COALESCE(description,'') AS description, listed_in_market
     FROM echo_server_emoji_packs WHERE id = $1 AND server_id = $2`,
    [packId, serverId],
  );
  if (!pack.rows[0]) return 'not_found';
  if (pack.rows[0].source !== 'custom') return 'not_custom';

  let nextName: string | undefined;
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (n) nextName = n.slice(0, 128);
  }
  let nextDesc: string | undefined;
  if (input.description !== undefined) {
    const d = validatePackDescription(input.description);
    if (!d) return 'bad_description';
    nextDesc = d;
  }
  let nextListed: boolean | undefined;
  if (input.listedInMarket !== undefined) {
    nextListed = !!input.listedInMarket;
  }
  let nextSettings: EchoEmojiPackMarketSettingsDto | undefined;
  if (input.marketSettings !== undefined) {
    const ms = normalizeMarketSettingsInput(input.marketSettings);
    if (!ms.ok) return 'bad_settings';
    nextSettings = ms.value;
  }

  const finalDesc = nextDesc ?? pack.rows[0].description;
  const finalListed = nextListed ?? pack.rows[0].listed_in_market;
  if (finalListed && validatePackDescription(finalDesc) === null)
    return 'bad_description';

  const parts: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (nextName !== undefined) {
    parts.push(`name = $${i}`);
    vals.push(nextName);
    i += 1;
  }
  if (nextDesc !== undefined) {
    parts.push(`description = $${i}`);
    vals.push(nextDesc);
    i += 1;
  }
  if (nextListed !== undefined) {
    parts.push(`listed_in_market = $${i}`);
    vals.push(nextListed);
    i += 1;
  }
  if (nextSettings !== undefined) {
    parts.push(`market_settings = $${i}::jsonb`);
    vals.push(JSON.stringify(nextSettings));
    i += 1;
  }
  if (parts.length === 0) return 'ok';

  vals.push(packId, serverId);
  await pool.query(
    `UPDATE echo_server_emoji_packs SET ${parts.join(', ')} WHERE id = $${i} AND server_id = $${i + 1}`,
    vals,
  );
  return 'ok';
}

export type AddCustomEmojiResult =
  | { ok: true; emojiId: string }
  | {
      ok: false;
      reason:
        | 'forbidden'
        | 'not_found'
        | 'not_custom_pack'
        | 'limit'
        | 'invalid'
        | 'duplicate_name';
    };

export function isSafeCustomEmojiImageUrl(imageUrl: string): boolean {
  const url = imageUrl.trim();
  if (!url || url.length > MAX_IMAGE_URL_LEN) return false;
  if (url.toLowerCase().startsWith('data:')) return false;
  if (!url.startsWith('/')) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
    } catch {
      return false;
    }
  }
  return mediaUrlPassesEchoPolicy(url);
}

export async function addEchoServerCustomEmoji(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  packId: string,
  nameRaw: string,
  animated: boolean,
  imageUrl: string,
): Promise<AddCustomEmojiResult> {
  if (!(await canManageServerEmojis(pool, serverId, userId)))
    return { ok: false, reason: 'forbidden' };
  const url = imageUrl.trim();
  if (!isSafeCustomEmojiImageUrl(url)) return { ok: false, reason: 'invalid' };

  const pack = await pool.query<{ source: string }>(
    `SELECT source FROM echo_server_emoji_packs WHERE id = $1 AND server_id = $2`,
    [packId, serverId],
  );
  if (!pack.rows[0]) return { ok: false, reason: 'not_found' };
  if (pack.rows[0].source !== 'custom')
    return { ok: false, reason: 'not_custom_pack' };

  const emojiCount = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM echo_server_custom_emojis WHERE pack_id = $1`,
    [packId],
  );
  if (Number(emojiCount.rows[0]?.n ?? 0) >= MAX_EMOJIS_PER_PACK)
    return { ok: false, reason: 'limit' };

  const name =
    nameRaw.trim().replace(/\s+/g, '_').replace(/:/g, '_') || 'emoji';
  if (!/^[\w.-]{1,64}$/.test(name)) return { ok: false, reason: 'invalid' };

  const eid = nextEchoSnowflakeId();
  try {
    await pool.query(
      `INSERT INTO echo_server_custom_emojis (id, server_id, pack_id, name, animated, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [eid, serverId, packId, name, animated, url],
    );
  } catch (e: unknown) {
    if (isPgUniqueViolation(e)) return { ok: false, reason: 'duplicate_name' };
    throw e;
  }
  return { ok: true, emojiId: eid };
}

export type RemoveEmojiResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'not_custom_pack';

export async function removeEchoServerCustomEmoji(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  packId: string,
  emojiId: string,
): Promise<RemoveEmojiResult> {
  if (!(await canManageServerEmojis(pool, serverId, userId)))
    return 'forbidden';
  const pack = await pool.query<{ source: string }>(
    `SELECT source FROM echo_server_emoji_packs WHERE id = $1 AND server_id = $2`,
    [packId, serverId],
  );
  if (!pack.rows[0]) return 'not_found';
  if (pack.rows[0].source !== 'custom') return 'not_custom_pack';

  const r = await pool.query(
    `DELETE FROM echo_server_custom_emojis WHERE id = $1 AND server_id = $2 AND pack_id = $3`,
    [emojiId, serverId, packId],
  );
  if (r.rowCount === 0) return 'not_found';
  return 'ok';
}

export async function renameEchoServerCustomEmoji(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  packId: string,
  emojiId: string,
  nameRaw: string,
): Promise<
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'not_custom_pack'
  | 'invalid'
  | 'duplicate_name'
> {
  if (!(await canManageServerEmojis(pool, serverId, userId)))
    return 'forbidden';
  const pack = await pool.query<{ source: string }>(
    `SELECT source FROM echo_server_emoji_packs WHERE id = $1 AND server_id = $2`,
    [packId, serverId],
  );
  if (!pack.rows[0]) return 'not_found';
  if (pack.rows[0].source !== 'custom') return 'not_custom_pack';

  const name = nameRaw.trim().replace(/\s+/g, '_').replace(/:/g, '_');
  if (!name || !/^[\w.-]{1,64}$/.test(name)) return 'invalid';

  try {
    const r = await pool.query(
      `UPDATE echo_server_custom_emojis SET name = $1 WHERE id = $2 AND server_id = $3 AND pack_id = $4`,
      [name, emojiId, serverId, packId],
    );
    if (r.rowCount === 0) return 'not_found';
  } catch (e: unknown) {
    if (isPgUniqueViolation(e)) return 'duplicate_name';
    throw e;
  }
  return 'ok';
}

export async function incrementEchoEmojiUsage(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  emojiId: string,
): Promise<boolean> {
  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  if (!mem.rows.length) return false;

  const ex = await pool.query(
    `SELECT 1 FROM echo_server_custom_emojis WHERE id = $1 AND server_id = $2`,
    [emojiId, serverId],
  );
  if (!ex.rows.length) return false;

  await pool.query(
    `INSERT INTO echo_server_emoji_usage (server_id, emoji_id, use_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (server_id, emoji_id) DO UPDATE SET use_count = echo_server_emoji_usage.use_count + 1`,
    [serverId, emojiId],
  );
  return true;
}
