import { describe, expect, it } from 'vitest';
import {
  normalizeMoreServerFolders,
  normalizeMoreServerFoldersFile,
  visibleFolderServerIds,
} from '@/utils/moreServerFoldersPersistence';

describe('normalizeMoreServerFolders', () => {
  it('keeps unknown server ids for later hydration', () => {
    const out = normalizeMoreServerFolders({
      folders: [
        {
          id: 'f1',
          name: 'Games',
          serverIds: ['b', 'x', 'b', 'a'],
        },
      ],
    });
    expect(out).toEqual([
      { id: 'f1', name: 'Games', serverIds: ['b', 'x', 'a'] },
    ]);
  });

  it('returns empty for malformed input', () => {
    expect(normalizeMoreServerFolders(null)).toEqual([]);
    expect(normalizeMoreServerFolders({ folders: 'nope' })).toEqual([]);
  });
});

describe('normalizeMoreServerFoldersFile', () => {
  it('reads v2 ui state', () => {
    const file = normalizeMoreServerFoldersFile({
      version: 2,
      folders: [{ id: 'f1', name: 'Work', serverIds: [] }],
      ui: { expandedInCompact: ['f1'], collapsedInCard: [] },
    });
    expect(file.version).toBe(2);
    expect(file.ui.expandedInCompact).toEqual(['f1']);
  });

  it('migrates legacy v1 shape', () => {
    const file = normalizeMoreServerFoldersFile({
      folders: [{ id: 'f1', name: 'Old', serverIds: ['a'] }],
    });
    expect(file.folders[0]?.name).toBe('Old');
    expect(file.ui.expandedInCompact).toEqual([]);
  });
});

describe('visibleFolderServerIds', () => {
  it('only returns ids present in the guild list', () => {
    const visible = visibleFolderServerIds(
      { id: 'f1', name: 'X', serverIds: ['a', 'gone'] },
      new Set(['a']),
    );
    expect(visible).toEqual(['a']);
  });
});
