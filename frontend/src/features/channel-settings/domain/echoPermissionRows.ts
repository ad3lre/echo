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

export function echoPermissionOverwriteStateChanged(
  initial: {
    syncWithCategory: boolean;
    rows: PermissionOverwriteRowDraft[];
  },
  current: {
    syncWithCategory: boolean;
    rows: PermissionOverwriteRowDraft[];
  },
): boolean {
  if (initial.syncWithCategory !== current.syncWithCategory) return true;
  const initialRows = initial.syncWithCategory
    ? []
    : canonicalizeEchoPermissionRowsForSave(initial.rows);
  const currentRows = current.syncWithCategory
    ? []
    : canonicalizeEchoPermissionRowsForSave(current.rows);
  return JSON.stringify(initialRows) !== JSON.stringify(currentRows);
}
