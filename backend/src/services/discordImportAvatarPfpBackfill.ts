import type pg from 'pg';
import { parseDiscordUserIdFromAvatarCdnUrl } from '../domain/discordNormalized';
import {
  isCorruptedDiscordImportPfp,
  repairDiscordImportUserPfpIfNeeded,
} from './discordImportAvatarMirror';

export type DiscordAvatarPfpBackfillRow = {
  userId: string;
  pfp: string;
  displayName: string;
  discordUserId: string;
  shadowAvatarMeta: string;
  isShadow: boolean;
};

type RawBackfillRow = {
  id: string;
  pfp: string;
  display_label: string;
  is_discord_shadow: boolean;
  shadow_discord_user_id: string | null;
  shadow_avatar_url: string | null;
  linked_discord_user_id: string | null;
};

export function resolveDiscordUserIdForPfpBackfill(row: {
  pfp: string;
  shadowDiscordUserId?: string | null;
  linkedDiscordUserId?: string | null;
}): string {
  const fromShadow = row.shadowDiscordUserId?.trim() ?? '';
  if (fromShadow) return fromShadow;
  const fromLink = row.linkedDiscordUserId?.trim() ?? '';
  if (fromLink) return fromLink;
  return parseDiscordUserIdFromAvatarCdnUrl(row.pfp) ?? '';
}

export async function listUsersWithCorruptedDiscordImportPfp(
  pool: pg.Pool,
): Promise<DiscordAvatarPfpBackfillRow[]> {
  const { rows } = await pool.query<RawBackfillRow>(
    `
    SELECT
      u.id,
      TRIM(u.pfp) AS pfp,
      COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.username), ''), 'user') AS display_label,
      u.is_discord_shadow,
      s.discord_user_id AS shadow_discord_user_id,
      NULLIF(TRIM(s.avatar_url), '') AS shadow_avatar_url,
      l.discord_user_id AS linked_discord_user_id
    FROM auth_users u
    LEFT JOIN echo_discord_shadow_users s ON s.shadow_user_id = u.id
    LEFT JOIN auth_discord_user_links l ON l.user_id = u.id
    WHERE TRIM(COALESCE(u.pfp, '')) <> ''
    ORDER BY u.id ASC
    `,
  );

  const out: DiscordAvatarPfpBackfillRow[] = [];
  for (const row of rows) {
    const pfp = String(row.pfp ?? '').trim();
    if (!isCorruptedDiscordImportPfp(pfp)) continue;

    const discordUserId = resolveDiscordUserIdForPfpBackfill({
      pfp,
      shadowDiscordUserId: row.shadow_discord_user_id,
      linkedDiscordUserId: row.linked_discord_user_id,
    });
    if (!discordUserId) continue;

    out.push({
      userId: String(row.id),
      pfp,
      displayName: String(row.display_label ?? 'user'),
      discordUserId,
      shadowAvatarMeta: String(row.shadow_avatar_url ?? '').trim(),
      isShadow: row.is_discord_shadow === true,
    });
  }
  return out;
}

export type DiscordAvatarPfpBackfillUserResult =
  | { status: 'updated'; userId: string; before: string; after: string }
  | { status: 'skipped'; userId: string; reason: string }
  | { status: 'failed'; userId: string; reason: string };

export async function backfillDiscordImportAvatarPfpForUser(
  pool: pg.Pool,
  row: DiscordAvatarPfpBackfillRow,
  execute: boolean,
): Promise<DiscordAvatarPfpBackfillUserResult> {
  const userId = row.userId.trim();
  const discordUserId = row.discordUserId.trim();
  if (!userId || !discordUserId) {
    return { status: 'skipped', userId, reason: 'missing_user_or_discord_id' };
  }

  if (!isCorruptedDiscordImportPfp(row.pfp)) {
    return { status: 'skipped', userId, reason: 'not_corrupted' };
  }

  let mirrored: string;
  try {
    mirrored = await repairDiscordImportUserPfpIfNeeded({
      pool,
      userId,
      pfp: row.pfp,
      displayName: row.displayName,
      discordUserId,
      shadowAvatarMeta: row.shadowAvatarMeta || undefined,
      isShadow: row.isShadow,
      persist: execute,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { status: 'failed', userId, reason };
  }

  if (!mirrored) {
    return { status: 'failed', userId, reason: 'repair_returned_empty' };
  }
  if (mirrored === row.pfp) {
    return { status: 'skipped', userId, reason: 'unchanged_after_repair' };
  }
  if (isCorruptedDiscordImportPfp(mirrored)) {
    return { status: 'failed', userId, reason: 'repair_still_corrupted' };
  }

  return { status: 'updated', userId, before: row.pfp, after: mirrored };
}

export type DiscordAvatarPfpBackfillSummary = {
  scanned: number;
  candidates: number;
  updated: number;
  skipped: number;
  failed: number;
};

export async function runDiscordImportAvatarPfpBackfill(
  pool: pg.Pool,
  opts: { execute: boolean },
): Promise<DiscordAvatarPfpBackfillSummary> {
  const { rows: allRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM auth_users WHERE TRIM(COALESCE(pfp, '')) <> ''`,
  );
  const scanned = Number(allRows[0]?.count ?? 0);

  const candidates = await listUsersWithCorruptedDiscordImportPfp(pool);
  const summary: DiscordAvatarPfpBackfillSummary = {
    scanned,
    candidates: candidates.length,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const row of candidates) {
    const result = await backfillDiscordImportAvatarPfpForUser(
      pool,
      row,
      opts.execute,
    );
    if (result.status === 'updated') summary.updated += 1;
    else if (result.status === 'skipped') summary.skipped += 1;
    else summary.failed += 1;
  }

  return summary;
}
