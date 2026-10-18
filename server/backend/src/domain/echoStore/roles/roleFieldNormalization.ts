import type pg from 'pg';
import { normalizePermissionListForStorage } from '../../permissions/echoPermissionPrimitives';
import { ALLOWED_PERMS_SET } from '../constants';

const HEX_ROLE_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const RESERVED_ECHO_ROLE_NAMES = new Set<string>([
  '@members',
  '@global',
]);

/** Visual roles store at most this permission in `echo_roles.permissions` (role mentionability). */
export function normalizeVisualRolePermissionsForStorage(
  permissions: unknown,
): string[] {
  const normalized = normalizePermissionListForStorage(
    permissions,
    ALLOWED_PERMS_SET,
  );
  return normalized.filter((p) => p === 'MENTION_EVERYONE');
}

export function normalizeRoleName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

export function normalizeRoleColor(raw: unknown): string | null {
  if (raw == null) return '';
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return HEX_ROLE_COLOR_RE.test(trimmed) ? trimmed : null;
}

export function normalizeRoleIconUrl(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) return null;
  return trimmed;
}

export function normalizeRoleIconEmojiId(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) return null;
  return trimmed;
}

export async function roleIconEmojiBelongsToServer(
  pool: pg.Pool,
  serverId: string,
  emojiId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM echo_server_custom_emojis WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, emojiId],
  );
  return r.rows.length > 0;
}
