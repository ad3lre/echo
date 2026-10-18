import { describe, expect, it } from 'vitest';
import {
  compareExploreRecommendedServers,
  exploreTrendyScore,
  sortExploreRecommendedServers,
  sortExploreServersWithVoicePriority,
} from './exploreDirectorySort';

describe('exploreDirectorySort', () => {
  it('recommended prefers newer voice activity over API order', () => {
    const rows = [
      {
        order: 0,
        lastVoiceActivityAt: '2024-01-01T00:00:00.000Z',
        lastChatActivityAt: '',
        hasRealBanner: true,
        hasDescription: true,
      },
      {
        order: 1,
        lastVoiceActivityAt: '2024-06-01T00:00:00.000Z',
        lastChatActivityAt: '',
        hasRealBanner: false,
        hasDescription: false,
      },
    ];
    const sorted = sortExploreRecommendedServers(rows);
    expect(sorted[0]?.order).toBe(1);
  });

  it('voice priority floats live VC above empty for non-recommended modes', () => {
    const rows = [
      { order: 0, voiceParticipantCount: 0, memberCount: 999 },
      { order: 1, voiceParticipantCount: 3, memberCount: 1 },
    ];
    const sorted = sortExploreServersWithVoicePriority(
      rows,
      (a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0),
    );
    expect(sorted[0]?.order).toBe(1);
  });

  it('trendy score decays with age', () => {
    const now = Date.parse('2024-06-01T00:00:00.000Z');
    const young = exploreTrendyScore(
      { memberCount: 100, createdAtMs: now - 86_400_000, order: 0 },
      { nowMs: now, listLen: 10 },
    );
    const old = exploreTrendyScore(
      { memberCount: 100, createdAtMs: now - 86_400_000 * 30, order: 1 },
      { nowMs: now, listLen: 10 },
    );
    expect(young).toBeGreaterThan(old);
  });

  it('recommended compare is antisymmetric on equal rows', () => {
    const a = { order: 2, lastVoiceActivityAt: '', lastChatActivityAt: '' };
    expect(compareExploreRecommendedServers(a, a)).toBe(0);
  });
});
