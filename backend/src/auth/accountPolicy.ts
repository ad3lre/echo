import { isValidEmailFormat, normalizeEmail } from './email';

export {
  normalizeUsername,
  validateRegistrationUsername,
  MIN_REGISTER_USERNAME_LENGTH,
  MAX_REGISTER_USERNAME_LENGTH,
} from '../../../shared/usernamePolicy';

const POPULAR_EMAIL_PROVIDER_DOMAINS = new Set<string>([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'aol.com',
  'gmx.com',
  'mail.com',
  'fastmail.com',
  'hey.com',
  'zoho.com',
  'tuta.com',
  'tutamail.com',
  'tutanota.com',
]);

const RESERVED_DISPLAY_NAMES = new Set<string>(['@everyone', '@here']);
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
/** Minimum password length for registration, password change, and guest upgrade. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_REGISTER_DISPLAY_NAME_LENGTH = 64;
export const ECHO_SERVER_ROLE_LIMIT = 512;

function extractEmailDomain(email: string): string {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf('@');
  return atIndex === -1 ? '' : normalized.slice(atIndex + 1);
}

function isAllowedEmailDomain(domain: string): boolean {
  if (!domain) return false;
  if (POPULAR_EMAIL_PROVIDER_DOMAINS.has(domain)) return true;
  return (
    domain.endsWith('.echo.test') ||
    domain.endsWith('.test') ||
    domain.endsWith('.localhost') ||
    domain.endsWith('.local')
  );
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
  const domain = extractEmailDomain(normalizedEmail);
  if (!isAllowedEmailDomain(domain)) {
    return { ok: false, code: 'INVALID_EMAIL_PROVIDER' };
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
