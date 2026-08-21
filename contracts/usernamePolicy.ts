const RESERVED_USERNAMES = new Set<string>([
  'admin',
  'administrator',
  'billing',
  'echo',
  'everyone',
  'guest',
  'here',
  'moderator',
  'mod',
  'null',
  'owner',
  'root',
  'security',
  'staff',
  'support',
  'system',
  'undefined',
]);

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/;
const REPEATED_SEPARATOR_RE = /[._-]{2,}/;

export const MIN_REGISTER_USERNAME_LENGTH = 4;
export const MAX_REGISTER_USERNAME_LENGTH = 32;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** True when the edited handle matches the account's stored username (case-insensitive). */
export function isUsernameUnchanged(
  raw: string,
  baselineUsername: string | null | undefined,
): boolean {
  if (baselineUsername == null || baselineUsername === '') return false;
  return normalizeUsername(raw) === normalizeUsername(baselineUsername);
}

export function validateRegistrationUsername(
  raw: string,
): { ok: true; normalizedUsername: string } | { ok: false } {
  const normalizedUsername = normalizeUsername(raw);
  if (
    normalizedUsername.length < MIN_REGISTER_USERNAME_LENGTH ||
    normalizedUsername.length > MAX_REGISTER_USERNAME_LENGTH
  ) {
    return { ok: false };
  }
  if (!USERNAME_RE.test(normalizedUsername)) return { ok: false };
  if (REPEATED_SEPARATOR_RE.test(normalizedUsername)) return { ok: false };
  if (RESERVED_USERNAMES.has(normalizedUsername)) return { ok: false };
  return { ok: true, normalizedUsername };
}

export type EchoUsernameFieldIssueOptions = {
  /** When set, an unchanged value is accepted even if shorter than the register minimum. */
  baselineUsername?: string | null;
};

/**
 * Short hint for profile / signup fields. Returns null when the field is
 * effectively empty so we do not nag while the user has not entered a handle.
 */
export function describeEchoUsernameFieldIssue(
  raw: string,
  options?: EchoUsernameFieldIssueOptions,
): string | null {
  if (raw.trim().length === 0) return null;
  if (
    options?.baselineUsername != null &&
    isUsernameUnchanged(raw, options.baselineUsername)
  ) {
    return null;
  }
  if (/\s/.test(raw)) {
    return 'Usernames cannot contain spaces.';
  }

  const normalizedUsername = normalizeUsername(raw);
  if (normalizedUsername.length < MIN_REGISTER_USERNAME_LENGTH) {
    return `Usernames must be at least ${MIN_REGISTER_USERNAME_LENGTH} characters.`;
  }
  if (normalizedUsername.length > MAX_REGISTER_USERNAME_LENGTH) {
    return `Usernames must be at most ${MAX_REGISTER_USERNAME_LENGTH} characters.`;
  }
  if (REPEATED_SEPARATOR_RE.test(normalizedUsername)) {
    return 'Usernames cannot include repeated dots, underscores, or hyphens.';
  }
  if (RESERVED_USERNAMES.has(normalizedUsername)) {
    return 'That username is reserved. Try another.';
  }
  if (!USERNAME_RE.test(normalizedUsername)) {
    return 'Usernames may only use lowercase letters, numbers, dots, underscores, and hyphens; they must start and end with a letter or number.';
  }
  return null;
}

/** Profile PATCH: enforce register rules only when the user is changing their handle. */
export function validateUsernameForProfilePatch(
  raw: string,
  baselineUsername: string | null | undefined,
): { ok: true; normalizedUsername: string } | { ok: false } {
  if (isUsernameUnchanged(raw, baselineUsername)) {
    return { ok: true, normalizedUsername: normalizeUsername(raw) };
  }
  return validateRegistrationUsername(raw);
}
