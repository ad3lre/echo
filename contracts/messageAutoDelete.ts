/** Allowed auto-delete retention periods (seconds). `null` = off. */
export const ECHO_MESSAGE_AUTO_DELETE_ALLOWED_SECONDS = [
  86_400, 604_800, 2_592_000,
] as const;

export type EchoMessageAutoDeleteSeconds =
  (typeof ECHO_MESSAGE_AUTO_DELETE_ALLOWED_SECONDS)[number];

/** Compliance: soft-deleted rows stay in DB before physical purge. */
export const ECHO_MESSAGE_DELETED_COMPLIANCE_RETENTION_DAYS = 14;

const ALLOWED_SET = new Set<number>(ECHO_MESSAGE_AUTO_DELETE_ALLOWED_SECONDS);

export function parseEchoMessageAutoDeleteSeconds(
  raw: unknown,
): number | null | undefined {
  if (raw === null) return null;
  if (raw === undefined) return undefined;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const n = Math.floor(raw);
  if (n === 0) return null;
  return ALLOWED_SET.has(n) ? n : undefined;
}

export function isEchoMessageAutoDeleteSeconds(
  n: number,
): n is EchoMessageAutoDeleteSeconds {
  return ALLOWED_SET.has(n);
}

export const MESSAGE_AUTO_DELETE_OPTIONS: {
  label: string;
  value: string;
}[] = [
  { label: 'Off', value: '' },
  { label: '1 day', value: '86400' },
  { label: '7 days', value: '604800' },
  { label: '30 days', value: '2592000' },
];

export function messageAutoDeleteSecondsToOptionValue(
  seconds: number | null | undefined,
): string {
  if (seconds == null || seconds <= 0) return '';
  return String(seconds);
}

export function messageAutoDeleteOptionValueToSeconds(
  value: string,
): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return isEchoMessageAutoDeleteSeconds(n) ? n : null;
}
