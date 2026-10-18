/** Mask an email for challenge UI (e.g. j***@example.com). */
export function maskEmailAddress(email: string): string {
  const raw = String(email ?? '')
    .trim()
    .toLowerCase();
  const at = raw.indexOf('@');
  if (at <= 0 || at === raw.length - 1) return '***';
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}
