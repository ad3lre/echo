import type pg from 'pg';
import { clampEchoChannelName } from '../../../../shared/echoChannelLimits';
import { normalizeEchoMessageFormatTemplateInput } from '../../../../shared/messageChunkLimits';
import { normalizeForumCreatorDefaultPerms } from '../../../../shared/types/forumCreator';
import { invalidateEchoPermissionCacheForServer } from '../echoPermissionCache';
import { normalizePermissionOverwritePartial } from '../echoPermissionPrimitives';
import { selectLastAuthorMessageCreatedAtForSlowmode } from '../echoMessagesDal';
import { nextEchoSnowflakeId } from '../echoSnowflake';
import { getEchoChannelMeta } from './channelMeta';
import {
  ALLOWED_PERMS_SET,
  ALLOWED_SLOWMODE_SECONDS,
  ECHO_VOICE_BITRATE_MAX_BPS,
  ECHO_VOICE_BITRATE_MIN_BPS,
} from './constants';
import { normalizeEchoChannelIconKeyForDb } from './categoriesWorkspace';
import { parseAutoDeleteAfterSecondsPatch } from './messageAutoDelete';
import { applyEchoChannelPlacement } from './channelTreeMove';
import {
  getEffectiveChannelPermissions,
  getMergedRolePermissions,
} from './permissions';
import { isEchoServerOwner } from './access';
import { actorMayGrantPermissionSet } from './roles';

export type UpdateEchoChannelPermissionOverridesResult =
  | 'ok'
  | { ok: true; warnings: PermissionOverwriteSaveWarnings }
  | 'forbidden'
  | 'not_found'
  | 'invalid_body';

export type EchoPermissionOverwriteRowInput = {
  targetType: 'members' | 'global' | 'role' | 'member' | 'everyone';
  /** Role id or member user id; omit or null for members/global. */
  targetId?: string | null;
  partial: Record<string, unknown>;
};

export type EchoPermissionOverwriteRowDto = {
  id: string;
  targetType: 'members' | 'global' | 'role' | 'member' | 'everyone';
  targetId: string | null;
  partial: Record<string, boolean>;
};

function cleanPermissionPartialObject(
  raw: Record<string, unknown>,
): Record<string, boolean> {
  const norm = normalizePermissionOverwritePartial(raw);
  if (!norm) return {};
  const cleaned: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(norm)) {
    if (!ALLOWED_PERMS_SET.has(k)) continue;
    if (v === true || v === false) cleaned[k] = v;
  }
  return cleaned;
}

export type PermissionOverwriteSaveWarnings = {
  /** Allow bits removed because the actor does not hold those permissions. */
  strippedAllows: string[];
};

function sanitizePartialAllowsForActor(
  cleaned: Record<string, boolean>,
  actorPerms: ReadonlySet<string>,
  actorIsOwner: boolean,
): { partial: Record<string, boolean>; strippedAllows: string[] } {
  const strippedAllows: string[] = [];
  const partial: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(cleaned)) {
    if (
      v === true &&
      !actorMayGrantPermissionSet(actorPerms, new Set([k]), actorIsOwner)
    ) {
      strippedAllows.push(k);
      continue;
    }
    partial[k] = v;
  }
  return { partial, strippedAllows };
}

type PreparedPermissionOverwriteRow = {
  targetType: 'members' | 'global' | 'role' | 'member' | 'everyone';
  targetId: string | null;
  partial: Record<string, boolean>;
};

type PreparePermissionOverwriteRowsResult =
  | {
      ok: true;
      prepared: PreparedPermissionOverwriteRow[];
      roleIdsToValidate: string[];
      memberIdsToValidate: string[];
      strippedAllows: string[];
    }
  | 'invalid_body';

function preparePermissionOverwriteRows(
  rows: EchoPermissionOverwriteRowInput[],
  actorPerms: ReadonlySet<string>,
  actorIsOwner: boolean,
): PreparePermissionOverwriteRowsResult {
  const seen = new Set<string>();
  const roleIdsToValidate: string[] = [];
  const memberIdsToValidate: string[] = [];
  const prepared: PreparedPermissionOverwriteRow[] = [];
  const strippedAllows: string[] = [];

  for (const row of rows) {
    const tt = row.targetType;
    if (
      tt !== 'members' &&
      tt !== 'global' &&
      tt !== 'everyone' &&
      tt !== 'role' &&
      tt !== 'member'
    )
      return 'invalid_body';
    const tid = typeof row.targetId === 'string' ? row.targetId.trim() : '';
    if (tt === 'members' || tt === 'global' || tt === 'everyone') {
      if (tid !== '') return 'invalid_body';
    } else if (!tid) {
      return 'invalid_body';
    }
    const key = `${tt}:${tt === 'members' || tt === 'global' || tt === 'everyone' ? '' : tid}`;
    if (seen.has(key)) return 'invalid_body';
    seen.add(key);

    if (
      typeof row.partial !== 'object' ||
      row.partial === null ||
      Array.isArray(row.partial)
    )
      return 'invalid_body';

    const cleaned = cleanPermissionPartialObject(row.partial);
    const { partial, strippedAllows: rowStripped } =
      sanitizePartialAllowsForActor(cleaned, actorPerms, actorIsOwner);
    strippedAllows.push(...rowStripped);

    const canonicalType: PreparedPermissionOverwriteRow['targetType'] =
      tt === 'everyone' ? 'members' : tt;
    prepared.push({
      targetType: canonicalType,
      targetId:
        tt === 'members' || tt === 'global' || tt === 'everyone' ? null : tid,
      partial,
    });

    if (tt === 'role') roleIdsToValidate.push(tid);
    if (tt === 'member') memberIdsToValidate.push(tid);
  }

  return {
    ok: true,
    prepared,
    roleIdsToValidate,
    memberIdsToValidate,
    strippedAllows,
  };
}

function replaceOverwriteResultFromStripped(
  strippedAllows: string[],
): ReplaceEchoPermissionOverwritesResult {
  const unique = [...new Set(strippedAllows)];
  if (unique.length === 0) return 'ok';
  return { ok: true, warnings: { strippedAllows: unique } };
}

export async function listEchoChannelPermissionOverwrites(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<EchoPermissionOverwriteRowDto[]> {
  const r = await pool.query(
    `SELECT id, target_type, target_id, partial
     FROM echo_channel_permission_overwrite_rows
     WHERE server_id = $1 AND channel_id = $2
     ORDER BY target_type ASC, target_id ASC NULLS FIRST`,
    [serverId, channelId],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    targetType: row.target_type as EchoPermissionOverwriteRowDto['targetType'],
    targetId: row.target_id != null ? String(row.target_id) : null,
    partial: cleanPermissionPartialObject(
      (row.partial as Record<string, unknown>) ?? {},
    ),
  }));
}

export async function listEchoCategoryPermissionOverwrites(
  pool: pg.Pool,
  serverId: string,
  categoryId: string,
): Promise<EchoPermissionOverwriteRowDto[]> {
  const r = await pool.query(
    `SELECT id, target_type, target_id, partial
     FROM echo_category_permission_overwrite_rows
     WHERE server_id = $1 AND category_id = $2
     ORDER BY target_type ASC, target_id ASC NULLS FIRST`,
    [serverId, categoryId],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    targetType: row.target_type as EchoPermissionOverwriteRowDto['targetType'],
    targetId: row.target_id != null ? String(row.target_id) : null,
    partial: cleanPermissionPartialObject(
      (row.partial as Record<string, unknown>) ?? {},
    ),
  }));
}

export type ReplaceEchoPermissionOverwritesResult =
  | 'ok'
  | { ok: true; warnings: PermissionOverwriteSaveWarnings }
  | 'forbidden'
  | 'not_found'
  | 'invalid_body';

export function permissionOverwriteSaveWarnings(
  result: ReplaceEchoPermissionOverwritesResult,
): PermissionOverwriteSaveWarnings | undefined {
  return typeof result === 'object' && result.ok === true
    ? result.warnings
    : undefined;
}

export async function replaceEchoChannelPermissionOverwrites(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  channelId: string,
  rows: EchoPermissionOverwriteRowInput[],
): Promise<ReplaceEchoPermissionOverwritesResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!actorPerms.has('MANAGE_ROLES') && !actorPerms.has('MANAGE_GUILD'))
    return 'forbidden';
  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  const ch = await pool.query(
    `SELECT id FROM echo_channels WHERE id = $1 AND server_id = $2`,
    [channelId, serverId],
  );
  if (ch.rows.length === 0) return 'not_found';
  if (!Array.isArray(rows)) return 'invalid_body';

  if (rows.length === 0) {
    await pool.query(
      `DELETE FROM echo_channel_permission_overwrite_rows WHERE server_id = $1 AND channel_id = $2`,
      [serverId, channelId],
    );
    await pool.query(
      `UPDATE echo_channels SET permission_overrides = NULL WHERE id = $1 AND server_id = $2`,
      [channelId, serverId],
    );
    invalidateEchoPermissionCacheForServer(serverId);
    return 'ok';
  }

  const preparedRows = preparePermissionOverwriteRows(
    rows,
    actorPerms,
    actorIsOwner,
  );
  if (preparedRows === 'invalid_body') return 'invalid_body';

  const { prepared, roleIdsToValidate, memberIdsToValidate, strippedAllows } =
    preparedRows;

  if (roleIdsToValidate.length > 0) {
    const q = await pool.query(
      `SELECT id FROM echo_roles WHERE server_id = $1 AND id = ANY($2::text[])`,
      [serverId, [...new Set(roleIdsToValidate)]],
    );
    const ok = new Set(q.rows.map((r: { id: unknown }) => String(r.id)));
    for (const rid of roleIdsToValidate) {
      if (!ok.has(rid)) return 'invalid_body';
    }
  }
  if (memberIdsToValidate.length > 0) {
    const q = await pool.query(
      `SELECT user_id FROM echo_server_members WHERE server_id = $1 AND user_id = ANY($2::text[])`,
      [serverId, [...new Set(memberIdsToValidate)]],
    );
    const ok = new Set(
      q.rows.map((r: { user_id: unknown }) => String(r.user_id)),
    );
    for (const uid of memberIdsToValidate) {
      if (!ok.has(uid)) return 'invalid_body';
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM echo_channel_permission_overwrite_rows WHERE server_id = $1 AND channel_id = $2`,
      [serverId, channelId],
    );
    for (const row of prepared) {
      await client.query(
        `INSERT INTO echo_channel_permission_overwrite_rows (id, server_id, channel_id, target_type, target_id, partial)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          nextEchoSnowflakeId(),
          serverId,
          channelId,
          row.targetType,
          row.targetId,
          JSON.stringify(row.partial),
        ],
      );
    }
    await client.query(
      `UPDATE echo_channels SET permission_overrides = NULL WHERE id = $1 AND server_id = $2`,
      [channelId, serverId],
    );
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
    throw new Error('replaceEchoChannelPermissionOverwrites failed');
  } finally {
    client.release();
  }
  invalidateEchoPermissionCacheForServer(serverId);
  return replaceOverwriteResultFromStripped(strippedAllows);
}

export async function replaceEchoCategoryPermissionOverwrites(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  categoryId: string,
  rows: EchoPermissionOverwriteRowInput[],
): Promise<ReplaceEchoPermissionOverwritesResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!actorPerms.has('MANAGE_ROLES') && !actorPerms.has('MANAGE_GUILD'))
    return 'forbidden';
  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  const catOk = await pool.query(
    `SELECT 1 FROM echo_categories WHERE id = $1 AND server_id = $2`,
    [categoryId, serverId],
  );
  if (catOk.rows.length === 0) return 'not_found';
  if (!Array.isArray(rows)) return 'invalid_body';

  if (rows.length === 0) {
    await pool.query(
      `DELETE FROM echo_category_permission_overwrite_rows WHERE server_id = $1 AND category_id = $2`,
      [serverId, categoryId],
    );
    await pool.query(
      `DELETE FROM echo_category_permission_overrides WHERE server_id = $1 AND category_id = $2`,
      [serverId, categoryId],
    );
    invalidateEchoPermissionCacheForServer(serverId);
    return 'ok';
  }

  const preparedRows = preparePermissionOverwriteRows(
    rows,
    actorPerms,
    actorIsOwner,
  );
  if (preparedRows === 'invalid_body') return 'invalid_body';

  const { prepared, roleIdsToValidate, memberIdsToValidate, strippedAllows } =
    preparedRows;

  if (roleIdsToValidate.length > 0) {
    const q = await pool.query(
      `SELECT id FROM echo_roles WHERE server_id = $1 AND id = ANY($2::text[])`,
      [serverId, [...new Set(roleIdsToValidate)]],
    );
    const ok = new Set(q.rows.map((r: { id: unknown }) => String(r.id)));
    for (const rid of roleIdsToValidate) {
      if (!ok.has(rid)) return 'invalid_body';
    }
  }
  if (memberIdsToValidate.length > 0) {
    const q = await pool.query(
      `SELECT user_id FROM echo_server_members WHERE server_id = $1 AND user_id = ANY($2::text[])`,
      [serverId, [...new Set(memberIdsToValidate)]],
    );
    const ok = new Set(
      q.rows.map((r: { user_id: unknown }) => String(r.user_id)),
    );
    for (const uid of memberIdsToValidate) {
      if (!ok.has(uid)) return 'invalid_body';
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM echo_category_permission_overwrite_rows WHERE server_id = $1 AND category_id = $2`,
      [serverId, categoryId],
    );
    for (const row of prepared) {
      await client.query(
        `INSERT INTO echo_category_permission_overwrite_rows (id, server_id, category_id, target_type, target_id, partial)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          nextEchoSnowflakeId(),
          serverId,
          categoryId,
          row.targetType,
          row.targetId,
          JSON.stringify(row.partial),
        ],
      );
    }
    await client.query(
      `DELETE FROM echo_category_permission_overrides WHERE server_id = $1 AND category_id = $2`,
      [serverId, categoryId],
    );
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
    throw new Error('replaceEchoCategoryPermissionOverwrites failed');
  } finally {
    client.release();
  }
  invalidateEchoPermissionCacheForServer(serverId);
  return replaceOverwriteResultFromStripped(strippedAllows);
}

export type PatchEchoChannelInput = {
  name?: string;
  /** `null` moves the channel to uncategorized (no category). */
  categoryId?: string | null;
  /** 0-based index within the target category bucket (or root) after the move / reorder. */
  siblingIndex?: number;
  /**
   * When moving from a category to uncategorized: `sync` snapshots the source category’s
   * permission overwrite rows onto the channel; `keep` leaves channel overwrites unchanged.
   * When moving between two categories: `sync` clears channel overwrite rows so the channel
   * inherits from the destination category; `keep` leaves channel overwrite rows unchanged.
   */
  moveOutOfCategoryPermission?: 'sync' | 'keep';
  slowmodeSeconds?: number;
  userLimit?: number;
  bitrateBps?: number | null;
  nsfw?: boolean;
  /** Client icon picker value, e.g. `sparkle.svg`. Empty string clears to default. */
  iconKey?: string;
  permissionOverrides?: Record<string, unknown> | null;
  /** Forum channels only: JSON defaults merged server-side. */
  forumCreatorDefaultPerms?: unknown;
  /** Voice channels: require LiveKit E2EE + epoch flow for joins. */
  voiceE2eeEnabled?: boolean;
  /** Text/forum: message auto-delete TTL when not syncing to category. */
  autoDeleteAfterSeconds?: number | null;
  /** Text/forum: inherit category auto-delete when true (default). */
  autoDeleteSyncedToCategory?: boolean;
  /** Text/forum: default message body prefix shown in composer (UTF-16 capped). */
  messageFormatTemplate?: string;
  /** Text/forum: when true with non-empty template, prefix cannot be removed (enforced server-side on send). */
  messageFormatHard?: boolean;
  /** Paper channels: margin comments enabled. */
  paperCommentsEnabled?: boolean;
  /** Paper channels: show author gutter. */
  paperShowAuthorGutter?: boolean;
};

function patchEchoChannelHasAnyField(p: PatchEchoChannelInput): boolean {
  return (
    p.name !== undefined ||
    p.categoryId !== undefined ||
    p.siblingIndex !== undefined ||
    p.moveOutOfCategoryPermission !== undefined ||
    p.slowmodeSeconds !== undefined ||
    p.userLimit !== undefined ||
    p.bitrateBps !== undefined ||
    p.nsfw !== undefined ||
    p.iconKey !== undefined ||
    p.permissionOverrides !== undefined ||
    p.forumCreatorDefaultPerms !== undefined ||
    p.voiceE2eeEnabled !== undefined ||
    p.autoDeleteAfterSeconds !== undefined ||
    p.autoDeleteSyncedToCategory !== undefined ||
    p.messageFormatTemplate !== undefined ||
    p.messageFormatHard !== undefined ||
    p.paperCommentsEnabled !== undefined ||
    p.paperShowAuthorGutter !== undefined
  );
}

function normChannelCategoryId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  return t === '' ? null : t;
}

function channelCategoryIdsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normChannelCategoryId(a) === normChannelCategoryId(b);
}

/**
 * Channel overview + permission overrides. Same gate as `updateEchoChannelPermissionOverrides`.
 */
export async function patchEchoChannel(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  channelId: string,
  patch: PatchEchoChannelInput,
): Promise<UpdateEchoChannelPermissionOverridesResult> {
  if (!patchEchoChannelHasAnyField(patch)) return 'invalid_body';
  const merged = await getMergedRolePermissions(pool, serverId, actorId);
  if (!merged.has('MANAGE_ROLES') && !merged.has('MANAGE_GUILD')) {
    const effective = await getEffectiveChannelPermissions(
      pool,
      serverId,
      actorId,
      channelId,
    );
    if (!effective.has('MANAGE_CHANNELS')) {
      return 'forbidden';
    }
  }

  const chQ = await pool.query(
    `SELECT id, name, type, category_id,
            COALESCE(message_format_template, '') AS message_format_template,
            message_format_hard
     FROM echo_channels WHERE id = $1 AND server_id = $2`,
    [channelId, serverId],
  );
  if (chQ.rows.length === 0) return 'not_found';
  const ch = chQ.rows[0] as {
    id: string;
    name: string;
    type: string;
    category_id: string | null;
    message_format_template: string;
    message_format_hard: boolean;
  };
  const chType = String(ch.type);

  if (patch.name !== undefined) {
    const nm =
      typeof patch.name === 'string' ? clampEchoChannelName(patch.name) : '';
    if (!nm) return 'invalid_body';
  }
  if (patch.categoryId !== undefined && patch.categoryId !== null) {
    const cid = String(patch.categoryId).trim();
    if (!cid) return 'invalid_body';
    const catOk = await pool.query(
      `SELECT 1 FROM echo_categories WHERE id = $1 AND server_id = $2`,
      [cid, serverId],
    );
    if (catOk.rows.length === 0) return 'invalid_body';
  }
  if (patch.slowmodeSeconds !== undefined) {
    const sm = patch.slowmodeSeconds;
    if (
      typeof sm !== 'number' ||
      !Number.isFinite(sm) ||
      !ALLOWED_SLOWMODE_SECONDS.has(Math.floor(sm))
    ) {
      return 'invalid_body';
    }
  }
  if (patch.userLimit !== undefined) {
    const ul = patch.userLimit;
    if (
      typeof ul !== 'number' ||
      !Number.isFinite(ul) ||
      ul < 0 ||
      ul > 99 ||
      Math.floor(ul) !== ul
    ) {
      return 'invalid_body';
    }
  }
  if (patch.bitrateBps !== undefined) {
    if (chType !== 'voice') {
      if (patch.bitrateBps !== null) return 'invalid_body';
    } else if (patch.bitrateBps !== null) {
      const br = patch.bitrateBps;
      if (
        typeof br !== 'number' ||
        !Number.isFinite(br) ||
        br < ECHO_VOICE_BITRATE_MIN_BPS ||
        br > ECHO_VOICE_BITRATE_MAX_BPS
      ) {
        return 'invalid_body';
      }
    }
  }
  if (patch.nsfw !== undefined && typeof patch.nsfw !== 'boolean')
    return 'invalid_body';
  if (patch.iconKey !== undefined && typeof patch.iconKey !== 'string')
    return 'invalid_body';
  if (patch.forumCreatorDefaultPerms !== undefined) {
    if (chType !== 'forum') return 'invalid_body';
    if (
      patch.forumCreatorDefaultPerms !== null &&
      (typeof patch.forumCreatorDefaultPerms !== 'object' ||
        Array.isArray(patch.forumCreatorDefaultPerms))
    ) {
      return 'invalid_body';
    }
  }
  if (patch.voiceE2eeEnabled !== undefined) {
    if (chType !== 'voice') return 'invalid_body';
    if (typeof patch.voiceE2eeEnabled !== 'boolean') return 'invalid_body';
  }
  if (patch.autoDeleteAfterSeconds !== undefined) {
    if (chType !== 'text' && chType !== 'forum') return 'invalid_body';
    const parsed = parseAutoDeleteAfterSecondsPatch(
      patch.autoDeleteAfterSeconds,
    );
    if (parsed === undefined) return 'invalid_body';
  }
  if (patch.autoDeleteSyncedToCategory !== undefined) {
    if (chType !== 'text' && chType !== 'forum') return 'invalid_body';
    if (typeof patch.autoDeleteSyncedToCategory !== 'boolean')
      return 'invalid_body';
  }
  const formatPatchRequested =
    patch.messageFormatTemplate !== undefined ||
    patch.messageFormatHard !== undefined;
  if (formatPatchRequested) {
    if (chType !== 'text' && chType !== 'forum') return 'invalid_body';
  }
  if (
    patch.messageFormatTemplate !== undefined &&
    typeof patch.messageFormatTemplate !== 'string'
  )
    return 'invalid_body';
  if (
    patch.messageFormatHard !== undefined &&
    typeof patch.messageFormatHard !== 'boolean'
  )
    return 'invalid_body';
  if (patch.paperCommentsEnabled !== undefined) {
    if (chType !== 'paper') return 'invalid_body';
    if (typeof patch.paperCommentsEnabled !== 'boolean') return 'invalid_body';
  }
  if (patch.paperShowAuthorGutter !== undefined) {
    if (chType !== 'paper') return 'invalid_body';
    if (typeof patch.paperShowAuthorGutter !== 'boolean') return 'invalid_body';
  }

  const wantsPlacement =
    patch.siblingIndex !== undefined ||
    (patch.categoryId !== undefined &&
      !channelCategoryIdsEqual(patch.categoryId, ch.category_id));

  if (patch.moveOutOfCategoryPermission !== undefined && !wantsPlacement)
    return 'invalid_body';

  if (wantsPlacement) {
    const pr = await applyEchoChannelPlacement(
      pool,
      serverId,
      actorId,
      channelId,
      {
        targetCategoryId:
          patch.categoryId !== undefined ? patch.categoryId : undefined,
        siblingIndex: patch.siblingIndex,
        moveOutOfCategoryPermission: patch.moveOutOfCategoryPermission,
      },
    );
    if (pr !== 'ok') return pr;
  }

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (patch.name !== undefined) {
    sets.push(`name = $${vals.length + 1}`);
    vals.push(clampEchoChannelName(String(patch.name)));
  }
  if (patch.slowmodeSeconds !== undefined) {
    sets.push(`slowmode_seconds = $${vals.length + 1}`);
    vals.push(Math.floor(patch.slowmodeSeconds));
  }
  if (patch.userLimit !== undefined) {
    sets.push(`user_limit = $${vals.length + 1}`);
    vals.push(Math.floor(patch.userLimit));
  }
  if (patch.bitrateBps !== undefined) {
    sets.push(`bitrate_bps = $${vals.length + 1}`);
    vals.push(patch.bitrateBps);
  }
  if (patch.nsfw !== undefined) {
    sets.push(`nsfw = $${vals.length + 1}`);
    vals.push(patch.nsfw);
  }
  if (patch.iconKey !== undefined) {
    sets.push(`icon_key = $${vals.length + 1}`);
    vals.push(normalizeEchoChannelIconKeyForDb(patch.iconKey));
  }
  if (patch.forumCreatorDefaultPerms !== undefined) {
    const norm = normalizeForumCreatorDefaultPerms(
      patch.forumCreatorDefaultPerms,
    );
    sets.push(`forum_creator_default_perms = $${vals.length + 1}`);
    vals.push(norm);
  }
  if (patch.voiceE2eeEnabled !== undefined) {
    sets.push(`voice_e2ee_enabled = $${vals.length + 1}`);
    vals.push(patch.voiceE2eeEnabled);
  }
  if (patch.autoDeleteAfterSeconds !== undefined) {
    const parsed = parseAutoDeleteAfterSecondsPatch(
      patch.autoDeleteAfterSeconds,
    );
    sets.push(`auto_delete_after_seconds = $${vals.length + 1}`);
    vals.push(parsed ?? null);
  }
  if (patch.autoDeleteSyncedToCategory !== undefined) {
    sets.push(`auto_delete_synced_to_category = $${vals.length + 1}`);
    vals.push(patch.autoDeleteSyncedToCategory);
  }
  if (patch.paperCommentsEnabled !== undefined) {
    sets.push(`paper_comments_enabled = $${vals.length + 1}`);
    vals.push(patch.paperCommentsEnabled);
  }
  if (patch.paperShowAuthorGutter !== undefined) {
    sets.push(`paper_show_author_gutter = $${vals.length + 1}`);
    vals.push(patch.paperShowAuthorGutter);
  }

  if (formatPatchRequested) {
    const dbT = String(ch.message_format_template ?? '');
    const dbH = ch.message_format_hard === true;
    const nextT =
      patch.messageFormatTemplate !== undefined
        ? normalizeEchoMessageFormatTemplateInput(patch.messageFormatTemplate)
        : dbT;
    let nextH =
      patch.messageFormatHard !== undefined ? patch.messageFormatHard : dbH;
    if (!nextT) nextH = false;
    if (patch.messageFormatTemplate !== undefined) {
      sets.push(`message_format_template = $${vals.length + 1}`);
      vals.push(nextT);
      sets.push(`message_format_hard = $${vals.length + 1}`);
      vals.push(nextH);
    } else if (patch.messageFormatHard !== undefined) {
      sets.push(`message_format_hard = $${vals.length + 1}`);
      vals.push(nextH);
    }
  }

  if (sets.length > 0) {
    const wBase = vals.length;
    vals.push(serverId, channelId);
    await pool.query(
      `UPDATE echo_channels SET ${sets.join(', ')} WHERE server_id = $${wBase + 1} AND id = $${wBase + 2}`,
      vals,
    );
    invalidateEchoPermissionCacheForServer(serverId);
  }

  if (patch.permissionOverrides !== undefined) {
    const pr = await updateEchoChannelPermissionOverrides(
      pool,
      serverId,
      actorId,
      channelId,
      patch.permissionOverrides,
    );
    if (pr === 'forbidden' || pr === 'not_found' || pr === 'invalid_body') {
      return pr;
    }
  }

  return 'ok';
}

/** Text slowmode: false if user must wait. Bypass: MANAGE_MESSAGES, MANAGE_CHANNELS, or Discord BYPASS_SLOWMODE. */
export async function echoChannelAllowsMessageUnderSlowmode(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  channelId: string,
): Promise<boolean> {
  const meta = await getEchoChannelMeta(pool, channelId);
  if (!meta || meta.serverId !== serverId) return true;
  if (meta.type !== 'text') return true;
  const sm = meta.slowmodeSeconds;
  if (sm <= 0) return true;
  const perms = await getEffectiveChannelPermissions(
    pool,
    serverId,
    userId,
    channelId,
  );
  if (
    perms.has('BYPASS_SLOWMODE') ||
    perms.has('MANAGE_MESSAGES') ||
    perms.has('MANAGE_CHANNELS')
  ) {
    return true;
  }
  const lastAt = await selectLastAuthorMessageCreatedAtForSlowmode(
    pool,
    channelId,
    userId,
  );
  if (!lastAt) return true;
  const elapsedSec = (Date.now() - lastAt.getTime()) / 1000;
  return elapsedSec >= sm;
}

export async function updateEchoChannelPermissionOverrides(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  channelId: string,
  permissionOverrides: Record<string, unknown> | null,
): Promise<UpdateEchoChannelPermissionOverridesResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!actorPerms.has('MANAGE_ROLES') && !actorPerms.has('MANAGE_GUILD'))
    return 'forbidden';
  const ch = await pool.query(
    `SELECT id FROM echo_channels WHERE id = $1 AND server_id = $2`,
    [channelId, serverId],
  );
  if (ch.rows.length === 0) return 'not_found';
  if (permissionOverrides === null) {
    await pool.query(
      `DELETE FROM echo_channel_permission_overwrite_rows WHERE server_id = $1 AND channel_id = $2`,
      [serverId, channelId],
    );
    await pool.query(
      `UPDATE echo_channels SET permission_overrides = NULL WHERE id = $1 AND server_id = $2`,
      [channelId, serverId],
    );
    invalidateEchoPermissionCacheForServer(serverId);
    return 'ok';
  }
  if (
    typeof permissionOverrides !== 'object' ||
    Array.isArray(permissionOverrides)
  )
    return 'invalid_body';
  const cleaned = cleanPermissionPartialObject(
    permissionOverrides as Record<string, unknown>,
  );
  return replaceEchoChannelPermissionOverwrites(
    pool,
    serverId,
    actorId,
    channelId,
    [{ targetType: 'members', partial: cleaned }],
  );
}

export type UpdateEchoCategoryPermissionOverridesResult =
  | 'ok'
  | { ok: true; warnings: PermissionOverwriteSaveWarnings }
  | 'forbidden'
  | 'not_found'
  | 'invalid_body';

export async function updateEchoCategoryPermissionOverrides(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  categoryId: string,
  permissionOverrides: Record<string, unknown> | null,
): Promise<UpdateEchoCategoryPermissionOverridesResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!actorPerms.has('MANAGE_ROLES') && !actorPerms.has('MANAGE_GUILD'))
    return 'forbidden';
  const catOk = await pool.query(
    `SELECT 1 FROM echo_categories WHERE id = $1 AND server_id = $2`,
    [categoryId, serverId],
  );
  if (catOk.rows.length === 0) return 'not_found';
  if (permissionOverrides === null) {
    await pool.query(
      `DELETE FROM echo_category_permission_overwrite_rows WHERE server_id = $1 AND category_id = $2`,
      [serverId, categoryId],
    );
    await pool.query(
      `DELETE FROM echo_category_permission_overrides WHERE server_id = $1 AND category_id = $2`,
      [serverId, categoryId],
    );
    invalidateEchoPermissionCacheForServer(serverId);
    return 'ok';
  }
  if (
    typeof permissionOverrides !== 'object' ||
    Array.isArray(permissionOverrides)
  )
    return 'invalid_body';
  const cleaned = cleanPermissionPartialObject(
    permissionOverrides as Record<string, unknown>,
  );
  return replaceEchoCategoryPermissionOverwrites(
    pool,
    serverId,
    actorId,
    categoryId,
    [{ targetType: 'members', partial: cleaned }],
  );
}
