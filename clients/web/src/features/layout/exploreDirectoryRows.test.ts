import { describe, expect, it } from 'vitest';
import {
  collectExploreQuickFilters,
  compareExploreRecommendedServers,
  compareExploreServersWithVoicePriority,
  exploreDirectoryProfileCompletenessScore,
  exploreTagDisplayLabel,
  filterExploreDirectoryRowsByTags,
  isExploreDirectoryJoinLockedForGuest,
  normalizeExploreDirectoryTags,
  sortExploreRecommendedServers,
  sortExploreServersWithVoicePriority,
} from '@/features/layout/exploreDirectoryRows';

describe('exploreDirectoryRows', () => {
  it('locks guest Explore join only when allowGlobalGuests is false', () => {
    expect(isExploreDirectoryJoinLockedForGuest(true, false)).toBe(true);
    expect(isExploreDirectoryJoinLockedForGuest(true, true)).toBe(false);
    expect(isExploreDirectoryJoinLockedForGuest(true, undefined)).toBe(false);
    expect(isExploreDirectoryJoinLockedForGuest(false, false)).toBe(false);
  });

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

  it('sorts VC-active servers before others while preserving inner order', () => {
    const rows = [
      { name: 'Quiet', pfp: '', order: 0, voiceParticipantCount: 0 },
      { name: 'Live A', pfp: '', order: 1, voiceParticipantCount: 2 },
      { name: 'Live B', pfp: '', order: 2, voiceParticipantCount: 1 },
    ];
    expect(
      sortExploreServersWithVoicePriority(
        rows,
        (a, b) => a.order - b.order,
      ).map((r) => r.name),
    ).toEqual(['Live A', 'Live B', 'Quiet']);
    expect(
      compareExploreServersWithVoicePriority(
        { name: 'A', pfp: '', voiceParticipantCount: 0 },
        { name: 'B', pfp: '', voiceParticipantCount: 3 },
        () => 0,
      ),
    ).toBeGreaterThan(0);
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

  it('sorts recommended rows by voice activity, then chat, then profile', () => {
    const rows = [
      {
        name: 'Quiet complete',
        pfp: '',
        order: 0,
        lastVoiceActivityAt: '2026-01-01T00:00:00.000Z',
        lastChatActivityAt: '2026-05-01T00:00:00.000Z',
        hasRealBanner: true,
        hasDescription: true,
      },
      {
        name: 'Live VC',
        pfp: '',
        order: 1,
        lastVoiceActivityAt: '2026-05-20T00:00:00.000Z',
        lastChatActivityAt: '2026-01-01T00:00:00.000Z',
      },
      {
        name: 'Chatty bare',
        pfp: '',
        order: 2,
        lastChatActivityAt: '2026-05-22T00:00:00.000Z',
      },
      {
        name: 'Same chat fuller',
        pfp: '',
        order: 3,
        lastChatActivityAt: '2026-05-22T00:00:00.000Z',
        hasRealBanner: true,
        hasDescription: true,
      },
    ];
    expect(sortExploreRecommendedServers(rows).map((r) => r.name)).toEqual([
      'Live VC',
      'Quiet complete',
      'Same chat fuller',
      'Chatty bare',
    ]);
    expect(exploreDirectoryProfileCompletenessScore(rows[3]!)).toBe(2);
    expect(
      compareExploreRecommendedServers(rows[2]!, rows[3]!),
    ).toBeGreaterThan(0);
  });
});
