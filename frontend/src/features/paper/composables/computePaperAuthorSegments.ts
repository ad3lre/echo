import type { PaperGutterRow } from '@/features/paper/composables/usePaperAuthorGutter';

export type PaperAuthorSegment = {
  segmentId: string;
  authorIds: string[];
  paperBlockIds: string[];
  top: number;
  height: number;
  sharedCredit: boolean;
};

export function authorKeyForGutterRow(row: PaperGutterRow): string {
  const co = row.coAuthorIds;
  if (co && co.length >= 2) {
    const ids = [...new Set([...co, row.authorId].filter(Boolean))].sort();
    return `shared:${ids.join(',')}`;
  }
  return `author:${row.authorId}`;
}

export function authorIdsForGutterRow(row: PaperGutterRow): string[] {
  const co = row.coAuthorIds;
  if (co && co.length >= 2) {
    return [...new Set([...co, row.authorId].filter(Boolean))].slice(0, 2);
  }
  return row.authorId ? [row.authorId] : [];
}

/** Collapse consecutive blocks with the same authorship into one gutter segment. */
export function computePaperAuthorSegments(
  rows: readonly PaperGutterRow[],
): PaperAuthorSegment[] {
  if (rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => a.top - b.top);
  const segments: PaperAuthorSegment[] = [];

  let runKey = authorKeyForGutterRow(sorted[0]!);
  let runRows: PaperGutterRow[] = [sorted[0]!];

  const flush = () => {
    if (runRows.length === 0) return;
    const first = runRows[0]!;
    const last = runRows[runRows.length - 1]!;
    const authorIds = authorIdsForGutterRow(first);
    segments.push({
      segmentId: `${runKey}:${first.paperBlockId}`,
      authorIds,
      paperBlockIds: runRows.map((r) => r.paperBlockId),
      top: first.top,
      height: last.top + last.height - first.top,
      sharedCredit: authorIds.length >= 2,
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const row = sorted[i]!;
    const key = authorKeyForGutterRow(row);
    if (key === runKey) {
      runRows.push(row);
    } else {
      flush();
      runKey = key;
      runRows = [row];
    }
  }
  flush();

  return segments;
}
