export const ECHO_REPORT_CATEGORIES = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'impersonation',
  'other',
] as const;

export type EchoReportCategory = (typeof ECHO_REPORT_CATEGORIES)[number];

export function isEchoReportCategory(
  value: string,
): value is EchoReportCategory {
  return (ECHO_REPORT_CATEGORIES as readonly string[]).includes(value);
}

export function normalizeEchoReportCategory(
  raw: string | undefined | null,
): EchoReportCategory {
  const t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return isEchoReportCategory(t) ? t : 'other';
}
