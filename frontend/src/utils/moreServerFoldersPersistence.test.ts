import { describe, expect, it } from 'vitest';
import { normalizeMoreServerFolders } from '@/utils/moreServerFoldersPersistence';

describe('normalizeMoreServerFolders', () => {
  it('drops unknown ids and duplicates', () => {
    const valid = new Set(['a', 'b']);
    const out = normalizeMoreServerFolders(
      {
        folders: [
          {
            id: 'f1',
            name: 'Games',
            serverIds: ['b', 'x', 'b', 'a'],
          },
        ],
      },
      valid,
    );
    expect(out).toEqual([{ id: 'f1', name: 'Games', serverIds: ['b', 'a'] }]);
  });

  it('returns empty for malformed input', () => {
    expect(normalizeMoreServerFolders(null, new Set(['a']))).toEqual([]);
    expect(normalizeMoreServerFolders({ folders: 'nope' }, new Set())).toEqual(
      [],
    );
  });
});
