import { describe, expect, it } from 'vitest';
import { createPersistedEchoDmChannelPredicate } from './createPersistedEchoDmChannelPredicate';

describe('createPersistedEchoDmChannelPredicate', () => {
  it('matches dm- prefix', () => {
    const pred = createPersistedEchoDmChannelPredicate({
      echoDmThreadIds: () => new Set(),
    });
    expect(pred('dm-u1')).toBe(true);
  });

  it('matches persisted echo thread set', () => {
    const pred = createPersistedEchoDmChannelPredicate({
      echoDmThreadIds: () => new Set(['snowflake-id']),
    });
    expect(pred('snowflake-id')).toBe(true);
    expect(pred('other')).toBe(false);
  });
});
