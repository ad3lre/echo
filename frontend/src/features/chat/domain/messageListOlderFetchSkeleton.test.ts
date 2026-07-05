import { describe, expect, it } from 'vitest';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import {
  buildOlderFetchSkeletonRows,
  resolveOlderFetchSkeletonSourceMessages,
} from './messageListOlderFetchSkeleton';
import {
  OLDER_FETCH_SKELETON_ROW_COUNT,
  OLDER_FETCH_SKELETON_ROWS,
} from '../components/messageListHistorySkeleton';

function msg(id: string, authorId = 'u1', content = 'hello'): RawMessage {
  return {
    id,
    authorId,
    authorDisplayName: 'Ada',
    timestamp: '2026-01-01T12:00:00.000Z',
    content,
  };
}

describe('resolveOlderFetchSkeletonSourceMessages', () => {
  it('returns cached messages strictly older than the window head', () => {
    const cached = [msg('m-2'), msg('m-1'), msg('m0'), msg('m1'), msg('m2')];
    const source = resolveOlderFetchSkeletonSourceMessages(
      ['m0', 'm1', 'm2'],
      new Map(),
      cached,
    );
    expect(source.map((m) => m.id)).toEqual(['m-2', 'm-1']);
  });

  it('returns empty when cache has no older slice', () => {
    const cached = [msg('m0'), msg('m1')];
    expect(
      resolveOlderFetchSkeletonSourceMessages(['m0', 'm1'], new Map(), cached),
    ).toEqual([]);
  });
});

describe('buildOlderFetchSkeletonRows', () => {
  it('falls back to generic rows when no cache slice exists', () => {
    const rows = buildOlderFetchSkeletonRows(
      ['m1', 'm2'],
      new Map([
        ['m1', msg('m1')],
        ['m2', msg('m2')],
      ]),
      new Map(),
      'user-1',
      'channel-1',
    );
    expect(rows).toEqual(OLDER_FETCH_SKELETON_ROWS);
    expect(rows.length).toBe(OLDER_FETCH_SKELETON_ROW_COUNT);
  });
});
