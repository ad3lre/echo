import { isDisposableEmailHost } from './disposableEmailDomains';
import { isValidEmailFormat, normalizeEmail } from './email';

export {
  normalizeUsername,
  validateRegistrationUsername,
  MIN_REGISTER_USERNAME_LENGTH,
  MAX_REGISTER_USERNAME_LENGTH,
} from '../../../shared/usernamePolicy';

const RESERVED_DISPLAY_NAMES = new Set<string>([
  '@members',
  '@everyone',
  '@here',
]);
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

/** Minimum password length for registration, password change, and guest upgrade. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_REGISTER_DISPLAY_NAME_LENGTH = 64;
export const MAX_PROFILE_CUSTOM_STATUS_LENGTH = 140;
export const MAX_PROFILE_BIO_LENGTH = 280;
export const ECHO_SERVER_ROLE_LIMIT = 512;

function replaceUntilStable(
  input: string,
  pattern: RegExp,
  replacement: string,
): string {
  let current = input;
  for (;;) {
    const next = current.replace(pattern, replacement);
    if (next === current) return next;
    current = next;
  }
}

/** Strip angle-bracket markup so profile text cannot become HTML when rendered elsewhere. */
export function stripProfileHtmlMarkup(raw: string): string {
  let out = replaceUntilStable(raw, /<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = replaceUntilStable(out, /<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  return replaceUntilStable(out, /<[^>]+>/g, '');
}

export function sanitizeProfilePlainText(raw: string, maxLen: number): string {
  return stripProfileHtmlMarkup(raw)
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeProfileCustomStatus(raw: string): string {
  return sanitizeProfilePlainText(raw, MAX_PROFILE_CUSTOM_STATUS_LENGTH);
}

export function sanitizeProfileBio(raw: string): string {
  return sanitizeProfilePlainText(raw, MAX_PROFILE_BIO_LENGTH);
}

function registrationEmailHost(normalizedEmail: string): string | null {
  const at = normalizedEmail.lastIndexOf('@');
  if (at <= 0 || at === normalizedEmail.length - 1) return null;
  return normalizedEmail.slice(at + 1);
}

export function validateRegistrationEmail(
  email: string,
):
  | { ok: true; normalizedEmail: string }
  | { ok: false; code: 'INVALID_EMAIL' | 'INVALID_EMAIL_PROVIDER' } {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !isValidEmailFormat(email)) {
    return { ok: false, code: 'INVALID_EMAIL' };
  }
  const host = registrationEmailHost(normalizedEmail);
  if (host && isDisposableEmailHost(host)) {
    return { ok: false, code: 'INVALID_EMAIL_PROVIDER' };
  }
  return { ok: true, normalizedEmail };
}

export function validateDisplayName(
  raw: string | undefined,
  fallback: string,
): { ok: true; displayName: string } | { ok: false } {
  const trimmed = stripProfileHtmlMarkup(raw?.trim() || fallback.trim())
    .replace(CONTROL_CHARS_RE, '')
    .trim();
  if (!trimmed) return { ok: false };
  if (trimmed.length > MAX_REGISTER_DISPLAY_NAME_LENGTH) return { ok: false };
  if (RESERVED_DISPLAY_NAMES.has(trimmed.toLowerCase())) return { ok: false };
  return { ok: true, displayName: trimmed };
}
