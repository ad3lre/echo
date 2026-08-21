/**
 * Option A within-layer merge: sort rows, fold left, last write wins per boolean key.
 * Used for category / channel override rows when multiple rows exist.
 */

import { isWriteValue, sortRolesForFold } from './echoPermissionPrimitives';

export type OverrideRow = { id: string; position: number; body: unknown };

export function mergeOverrideRows(
  rows: readonly OverrideRow[],
  opts?: { presorted?: boolean },
): Record<string, boolean> {
  const sorted = opts?.presorted ? rows : sortRolesForFold(rows);
  const last = new Map<string, boolean>();
  for (const row of sorted) {
    const obj =
      row.body && typeof row.body === 'object' && !Array.isArray(row.body)
        ? (row.body as Record<string, unknown>)
        : {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (!isWriteValue(v)) continue;
      last.set(k, v);
    }
  }
  return Object.fromEntries(last);
}

export function mergeCategoryOverrideRows(
  rows: readonly OverrideRow[],
): Record<string, boolean> {
  return mergeOverrideRows(rows);
}

export function mergeChannelOverrideRows(
  rows: readonly OverrideRow[],
): Record<string, boolean> {
  return mergeOverrideRows(rows);
}
