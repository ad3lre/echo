/**
 * Minimum password length for reset / change / register (server-enforced).
 * Keep in sync with `MIN_PASSWORD_LENGTH` in `server/backend/src/auth/accountPolicy.ts`.
 */
export const MIN_ACCOUNT_PASSWORD_LENGTH = 8;

/** Trim + lowercase; matches backend normalization. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  const n = normalizeEmail(email);
  if (n.length < 5 || n.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n);
}

export type PasswordStrength = {
  score: number;
  /** 0–100 for progress bar width */
  fillPct: number;
  label: string;
};

/** Client-side hint only; backend still enforces its own rules. */
export function computePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, fillPct: 0, label: '' };
  }
  let raw = 0;
  if (password.length >= 8) raw += 22;
  else if (password.length >= 6) raw += 8;
  if (password.length >= 12) raw += 12;
  if (password.length >= 16) raw += 8;
  if (/[a-z]/.test(password)) raw += 14;
  if (/[A-Z]/.test(password)) raw += 14;
  if (/\d/.test(password)) raw += 14;
  if (/[^a-zA-Z\d]/.test(password)) raw += 16;
  const fillPct = Math.min(100, raw);
  let label: string;
  if (fillPct >= 82) label = 'Strong';
  else if (fillPct >= 58) label = 'Good';
  else if (fillPct >= 36) label = 'Fair';
  else label = 'Weak';
  return { score: fillPct, fillPct, label };
}

/** Minimum bar fill (0–100) before we allow account creation. */
export const MIN_REGISTER_PASSWORD_STRENGTH_PCT = 36;
