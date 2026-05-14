import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { createIsKnownDmChannelId } from './createIsKnownDmChannelId';

describe('createIsKnownDmChannelId', () => {
  it('returns false for guild channel id', () => {
    const isKnown = createIsKnownDmChannelId({
      echoDmPeerByChannelId: () => new Map(),
      hasGroupDmChannel: () => false,
      echoDmThreadIds: () => new Set(),
      findChannelContextById: () => ({
        channel: { id: 'c1', name: 'x', type: 'text' },
      }),
    });
    expect(isKnown('c1')).toBe(false);
  });

  it('returns true for dm- thread prefix', () => {
    const isKnown = createIsKnownDmChannelId({
      echoDmPeerByChannelId: () => new Map(),
      hasGroupDmChannel: () => false,
      echoDmThreadIds: () => new Set(),
      findChannelContextById: () => null,
    });
    expect(isKnown('dm-u1')).toBe(true);
  });

  it('uses echo peer map', () => {
    const m = new Map([['ch1', 'u1']]);
    const isKnown = createIsKnownDmChannelId({
      echoDmPeerByChannelId: () => m,
      hasGroupDmChannel: () => false,
      echoDmThreadIds: () => new Set(),
      findChannelContextById: () => null,
    });
    expect(isKnown('ch1')).toBe(true);
  });

  it('reads group map via callback', () => {
    const groups = ref<Record<string, { id: string }>>({ g1: { id: 'g1' } });
    const isKnown = createIsKnownDmChannelId({
      echoDmPeerByChannelId: () => new Map(),
      hasGroupDmChannel: (cid) => Boolean(groups.value[cid]),
      echoDmThreadIds: () => new Set(),
      findChannelContextById: () => null,
    });
    expect(isKnown('g1')).toBe(true);
  });
});
