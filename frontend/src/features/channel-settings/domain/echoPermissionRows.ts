import type { PermissionOverwriteRowDraft } from '@/features/channel-settings/types';

export function canonicalizeEchoPermissionRowsForSave(
  rows: PermissionOverwriteRowDraft[],
): PermissionOverwriteRowDraft[] {
  return rows
    .map((row) => ({
      targetType: row.targetType,
      ...(row.targetType === 'everyone'
        ? {}
        : { targetId: row.targetId ?? null }),
      partial: { ...(row.partial ?? {}) },
    }))
    .filter((row) => Object.keys(row.partial ?? {}).length > 0);
}
