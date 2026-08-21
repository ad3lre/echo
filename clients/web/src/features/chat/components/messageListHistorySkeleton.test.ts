import { describe, expect, it } from 'vitest';
import {
  HISTORY_SKELETON_ROWS,
  estimateHistorySkeletonRowSizePx,
} from './messageListHistorySkeleton';

describe('estimateHistorySkeletonRowSizePx', () => {
  it('sizes header rows taller than grouped continuations', () => {
    const header = estimateHistorySkeletonRowSizePx(HISTORY_SKELETON_ROWS[0]!);
    const grouped = estimateHistorySkeletonRowSizePx(HISTORY_SKELETON_ROWS[1]!);
    expect(header).toBeGreaterThan(grouped);
    expect(header).toBeGreaterThan(70);
  });

  it('adds height for image blocks', () => {
    const withMedia = HISTORY_SKELETON_ROWS.find(
      (row) => (row.imageBlocks?.length ?? 0) > 0,
    );
    const withoutMedia = HISTORY_SKELETON_ROWS.find(
      (row) => (row.imageBlocks?.length ?? 0) === 0,
    );
    expect(withMedia).toBeDefined();
    expect(withoutMedia).toBeDefined();
    expect(estimateHistorySkeletonRowSizePx(withMedia!)).toBeGreaterThan(
      estimateHistorySkeletonRowSizePx(withoutMedia!),
    );
  });
});
