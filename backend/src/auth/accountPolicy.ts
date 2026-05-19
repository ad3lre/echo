import { isValidEmailFormat, normalizeEmail } from './email';

export {
  normalizeUsername,
  validateRegistrationUsername,
  MIN_REGISTER_USERNAME_LENGTH,
  MAX_REGISTER_USERNAME_LENGTH,
} from '../../../shared/usernamePolicy';

const RESERVED_DISPLAY_NAMES = new Set<string>(['@everyone', '@here']);
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
/** Minimum password length for registration, password change, and guest upgrade. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_REGISTER_DISPLAY_NAME_LENGTH = 64;
export const ECHO_SERVER_ROLE_LIMIT = 512;

export function validateRegistrationEmail(
  email: string,
):
  | { ok: true; normalizedEmail: string }
  | { ok: false; code: 'INVALID_EMAIL' } {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !isValidEmailFormat(email)) {
    return { ok: false, code: 'INVALID_EMAIL' };
  }
  return { ok: true, normalizedEmail };
}

export function validateDisplayName(
  raw: string | undefined,
  fallback: string,
): { ok: true; displayName: string } | { ok: false } {
  const trimmed = raw?.trim() || fallback.trim();
  if (!trimmed) return { ok: false };
  if (trimmed.length > MAX_REGISTER_DISPLAY_NAME_LENGTH) return { ok: false };
  if (CONTROL_CHARS_RE.test(trimmed)) return { ok: false };
  if (RESERVED_DISPLAY_NAMES.has(trimmed.toLowerCase())) return { ok: false };
  return { ok: true, displayName: trimmed };
}
