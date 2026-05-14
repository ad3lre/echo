import { describe, expect, it } from 'vitest';
import {
  collectExploreQuickFilters,
  exploreTagDisplayLabel,
  filterExploreDirectoryRowsByTags,
  normalizeExploreDirectoryTags,
} from '../exploreDirectoryRows';

describe('exploreDirectoryRows', () => {
  it('normalizes tags for filtering', () => {
    expect(
      normalizeExploreDirectoryTags([' Gaming ', '', 'gaming', 'Art']),
    ).toEqual(['gaming', 'art']);
  });

  it('formats explore tag labels with leading capital', () => {
    expect(exploreTagDisplayLabel('gaming')).toBe('Gaming');
    expect(exploreTagDisplayLabel('sci-fi')).toBe('Sci-fi');
    expect(exploreTagDisplayLabel('')).toBe('');
    expect(exploreTagDisplayLabel('  art  ')).toBe('Art');
  });

  it('collects quick filters by popularity', () => {
    expect(
      collectExploreQuickFilters([
        { name: 'A', pfp: '', tags: ['gaming', 'art'] },
        { name: 'B', pfp: '', tags: ['gaming'] },
        { name: 'C', pfp: '', tags: ['music'] },
      ]),
    ).toEqual([
      { tag: 'gaming', count: 2 },
      { tag: 'art', count: 1 },
      { tag: 'music', count: 1 },
    ]);
  });

  it('filters rows by selected quick filters', () => {
    const rows = [
      { name: 'A', pfp: '', tags: ['gaming', 'art'] },
      { name: 'B', pfp: '', tags: ['music'] },
      { name: 'C', pfp: '', tags: ['coding'] },
    ];
    expect(filterExploreDirectoryRowsByTags(rows, [' music ', 'art'])).toEqual([
      rows[0],
      rows[1],
    ]);
  });
});
