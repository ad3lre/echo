import type { AuditTimeFilter } from '@/features/server-settings/composables/useServerSettingsAudit';

export function getAuditFilterMinTimestamp(
  time: AuditTimeFilter,
  now: number,
): number {
  const h = 60 * 60 * 1000;
  const d = 24 * h;

  let minTs = -Infinity;
  if (time === '1h') minTs = now - h;
  else if (time === '6h') minTs = now - 6 * h;
  else if (time === '12h') minTs = now - 12 * h;
  else if (time === '24h') minTs = now - d;
  else if (time === '3d') minTs = now - 3 * d;
  else if (time === '7d') minTs = now - 7 * d;
  else if (time === '30d') minTs = now - 30 * d;
  else if (time === '90d') minTs = now - 90 * d;

  return minTs;
}
