/** Normalized form used for uniqueness checks and storage. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Lightweight format check (full validation happens server-side). */
export function isValidEmailFormat(email: string): boolean {
  const n = normalizeEmail(email);
  if (n.length < 5 || n.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n);
}
