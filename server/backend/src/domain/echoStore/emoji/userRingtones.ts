import type pg from 'pg';
import { nextEchoSnowflakeId } from '../../echoSnowflake';

export type EchoUserRingtoneRow = {
  id: string;
  userId: string;
  label: string;
  storageKey: string;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

function mapRow(r: Record<string, unknown>): EchoUserRingtoneRow {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    label: String(r.label ?? ''),
    storageKey: String(r.storage_key),
    publicUrl: String(r.public_url),
    mimeType: String(r.mime_type ?? 'audio/mpeg'),
    sizeBytes: Number(r.size_bytes ?? 0),
    createdAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at ?? ''),
  };
}

export function echoUserRingtoneStorageKeyPrefix(userId: string): string {
  return `echo/ringtones/${userId.trim()}/`;
}

export function isEchoUserRingtoneStorageKeyForUser(
  storageKey: string,
  userId: string,
): boolean {
  const prefix = echoUserRingtoneStorageKeyPrefix(userId);
  const key = storageKey.trim();
  return key.startsWith(prefix) && key.length > prefix.length;
}

export async function countEchoUserRingtones(
  pool: pg.Pool,
  userId: string,
): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM echo_user_ringtones WHERE user_id = $1`,
    [userId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

export async function listEchoUserRingtones(
  pool: pg.Pool,
  userId: string,
): Promise<EchoUserRingtoneRow[]> {
  const r = await pool.query(
    `
    SELECT id, user_id, label, storage_key, public_url, mime_type, size_bytes, created_at
    FROM echo_user_ringtones
    WHERE user_id = $1
    ORDER BY created_at ASC, id ASC
    `,
    [userId],
  );
  return r.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function insertEchoUserRingtone(
  pool: pg.Pool,
  userId: string,
  input: {
    label: string;
    storageKey: string;
    publicUrl: string;
    mimeType: string;
    sizeBytes: number;
  },
): Promise<EchoUserRingtoneRow> {
  const id = nextEchoSnowflakeId();
  const r = await pool.query(
    `
    INSERT INTO echo_user_ringtones (
      id, user_id, label, storage_key, public_url, mime_type, size_bytes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, user_id, label, storage_key, public_url, mime_type, size_bytes, created_at
    `,
    [
      id,
      userId,
      input.label.slice(0, 120),
      input.storageKey,
      input.publicUrl.slice(0, 4096),
      input.mimeType.slice(0, 128),
      Math.max(0, Math.floor(input.sizeBytes)),
    ],
  );
  return mapRow(r.rows[0] as Record<string, unknown>);
}

export async function deleteEchoUserRingtone(
  pool: pg.Pool,
  userId: string,
  ringtoneId: string,
): Promise<{ storageKey: string } | null> {
  const r = await pool.query(
    `
    DELETE FROM echo_user_ringtones
    WHERE id = $1 AND user_id = $2
    RETURNING storage_key
    `,
    [ringtoneId, userId],
  );
  const storageKey = r.rows[0]?.storage_key;
  if (typeof storageKey !== 'string' || !storageKey.trim()) return null;
  return { storageKey: storageKey.trim() };
}

export async function getEchoUserRingtoneById(
  pool: pg.Pool,
  userId: string,
  ringtoneId: string,
): Promise<EchoUserRingtoneRow | null> {
  const r = await pool.query(
    `
    SELECT id, user_id, label, storage_key, public_url, mime_type, size_bytes, created_at
    FROM echo_user_ringtones
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    `,
    [ringtoneId, userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return mapRow(row as Record<string, unknown>);
}
