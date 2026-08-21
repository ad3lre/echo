import { describe, expect, it } from 'vitest';
import { computePaperAuthorSegments } from '@/features/paper/composables/computePaperAuthorSegments';
import type { PaperGutterRow } from '@/features/paper/composables/usePaperAuthorGutter';

function row(
  paperBlockId: string,
  authorId: string,
  top: number,
  height = 24,
  coAuthorIds?: string[],
): PaperGutterRow {
  return { paperBlockId, authorId, top, height, coAuthorIds };
}

describe('computePaperAuthorSegments', () => {
  it('collapses consecutive same-author blocks into one segment', () => {
    const segments = computePaperAuthorSegments([
      row('b1', 'user-a', 0),
      row('b2', 'user-a', 30),
      row('b3', 'user-a', 60),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.paperBlockIds).toEqual(['b1', 'b2', 'b3']);
    expect(segments[0]!.authorIds).toEqual(['user-a']);
    expect(segments[0]!.height).toBe(84);
  });

  it('keeps one segment per block when authors zigzag', () => {
    const segments = computePaperAuthorSegments([
      row('b1', 'user-a', 0),
      row('b2', 'user-b', 30),
      row('b3', 'user-a', 60),
    ]);
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.paperBlockIds)).toEqual([
      ['b1'],
      ['b2'],
      ['b3'],
    ]);
  });

  it('produces three segments for A run, B, A run', () => {
    const segments = computePaperAuthorSegments([
      row('b1', 'user-a', 0),
      row('b2', 'user-a', 30),
      row('b3', 'user-b', 60),
      row('b4', 'user-a', 90),
      row('b5', 'user-a', 120),
    ]);
    expect(segments).toHaveLength(3);
    expect(segments[0]!.paperBlockIds).toEqual(['b1', 'b2']);
    expect(segments[1]!.paperBlockIds).toEqual(['b3']);
    expect(segments[2]!.paperBlockIds).toEqual(['b4', 'b5']);
  });

  it('isolates shared-credit blocks from single-author runs', () => {
    const segments = computePaperAuthorSegments([
      row('b1', 'user-a', 0),
      row('b2', 'user-b', 30, 24, ['user-a', 'user-b']),
      row('b3', 'user-a', 60),
    ]);
    expect(segments).toHaveLength(3);
    expect(segments[1]!.sharedCredit).toBe(true);
    expect(segments[1]!.authorIds.sort()).toEqual(['user-a', 'user-b']);
    expect(segments[1]!.paperBlockIds).toEqual(['b2']);
  });
});
