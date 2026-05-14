import { describe, expect, it } from 'vitest';
import {
  addSingleMemberToServerMemberIds,
  appendCreatedServerRow,
  bootstrapCategoriesForNewServer,
  collectChannelIdsForServer,
  filterServersExcept,
  omitRecordKey,
  removeMessageKeys,
  setCategoriesForServerId,
} from './workspaceLocalServerGraphApply';

describe('workspaceLocalServerGraphApply', () => {
  it('bootstraps default category + general channel', () => {
    const cats = bootstrapCategoriesForNewServer('srv1', 'ch1');
    expect(cats).toHaveLength(1);
    expect(cats[0].channels[0]).toEqual({
      id: 'ch1',
      name: 'general',
      type: 'text',
    });
  });

  it('collects channel ids for a server', () => {
    const byServer = {
      s: [
        {
          id: 'c1',
          name: 'Cat',
          channels: [
            { id: 'a', name: 'a', type: 'text' as const },
            { id: 'b', name: 'b', type: 'voice' as const },
          ],
          channelPermissionDefaults: {},
        },
      ],
    };
    expect(collectChannelIdsForServer(byServer, 's')).toEqual(['a', 'b']);
    expect(collectChannelIdsForServer(byServer, 'missing')).toEqual([]);
  });

  it('omits keys and strips message entries', () => {
    expect(omitRecordKey({ a: 1, b: 2 }, 'a')).toEqual({ b: 2 });
    expect(removeMessageKeys({ x: [], y: [] }, ['x'])).toEqual({ y: [] });
  });

  it('appends server row and merges member ids', () => {
    expect(
      appendCreatedServerRow([], {
        id: '1',
        name: 'n',
        imageUrl: 'i',
        ownerId: 'o',
      }),
    ).toEqual([{ id: '1', name: 'n', imageUrl: 'i', ownerId: 'o' }]);
    expect(addSingleMemberToServerMemberIds({}, 's', 'u')).toEqual({
      s: ['u'],
    });
  });

  it('sets categories map entry immutably', () => {
    const prev = { other: [] as never[] };
    const cats = bootstrapCategoriesForNewServer('s', 'd');
    const next = setCategoriesForServerId(prev, 's', cats);
    expect(next.other).toBe(prev.other);
    expect(next.s).toBe(cats);
  });

  it('filters servers by id', () => {
    expect(
      filterServersExcept(
        [
          { id: 'a', name: '', imageUrl: '' },
          { id: 'b', name: '', imageUrl: '' },
        ],
        'a',
      ),
    ).toEqual([{ id: 'b', name: '', imageUrl: '' }]);
  });
});
