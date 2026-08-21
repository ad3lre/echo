import { describe, expect, it } from 'vitest';
import { patchFriendIdsByUserIdMap } from '@/features/layout/echoWorkspace/workspaceFriendIdsByUserId';

describe('patchFriendIdsByUserIdMap', () => {
  it('clears the map when me id is missing', () => {
    expect(patchFriendIdsByUserIdMap({ a: ['1'] }, '', ['x'])).toEqual({});
    expect(patchFriendIdsByUserIdMap({ a: ['1'] }, null, ['x'])).toEqual({});
    expect(patchFriendIdsByUserIdMap({ a: ['1'] }, '   ', ['x'])).toEqual({});
  });

  it('merges friend list for trimmed me id', () => {
    const prev = { other: ['9'], me: ['old'] };
    const out = patchFriendIdsByUserIdMap(prev, '  me  ', ['1', '2']);
    expect(out).toEqual({
      other: ['9'],
      me: ['1', '2'],
    });
    expect(out.me).not.toBe(prev.me);
  });
});
