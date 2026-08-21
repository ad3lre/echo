import { isEchoPublicId } from '@shared/snowflakeIds';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** UUID v4-shaped ids (legacy Echo graph rows and legacy `auth_users`). */
export function isEchoUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * Backend `auth_users.id`: legacy UUID v4 or ADR 002 decimal snowflake (new signups).
 */
export function isEchoAuthUserId(id: string): boolean {
  const t = id.trim();
  return isEchoUuid(t) || isEchoPublicId(t);
}

/**
 * Persisted Echo graph id: historical UUID v4 or ADR 002 decimal snowflake string.
 * Use for servers, channels, roles, messages, and the same string shapes as `auth_users.id`.
 */
export function isEchoGraphId(id: string): boolean {
  const t = id.trim();
  return isEchoUuid(t) || isEchoPublicId(t);
}

export { isEchoPublicId };
