import { describe, expect, it } from 'vitest';
import { shouldSkipGuildPathReapply } from './shouldSkipGuildPathReapply';

describe('shouldSkipGuildPathReapply', () => {
  it('skips when a DM peer is selected', () => {
    expect(
      shouldSkipGuildPathReapply({
        selectedDMUserId: 'user-1',
        activeChannelId: 'general',
        selectedServerId: 'server-1',
        echoDmThreadIds: new Set(),
      }),
    ).toBe(true);
  });

  it('skips when selected server is the echo DM host', () => {
    expect(
      shouldSkipGuildPathReapply({
        selectedDMUserId: null,
        activeChannelId: 'general',
        selectedServerId: 'echo',
        echoDmThreadIds: new Set(),
      }),
    ).toBe(true);
  });

  it('skips for legacy dm-* shell ids', () => {
    expect(
      shouldSkipGuildPathReapply({
        selectedDMUserId: null,
        activeChannelId: 'dm-user-1',
        selectedServerId: 'server-1',
        echoDmThreadIds: new Set(),
      }),
    ).toBe(true);
  });

  it('skips for persisted echo DM thread ids', () => {
    expect(
      shouldSkipGuildPathReapply({
        selectedDMUserId: null,
        activeChannelId: '1492135186257805312',
        selectedServerId: 'server-1',
        echoDmThreadIds: new Set(['1492135186257805312']),
      }),
    ).toBe(true);
  });

  it('does not skip for normal guild channels', () => {
    expect(
      shouldSkipGuildPathReapply({
        selectedDMUserId: null,
        activeChannelId: 'general',
        selectedServerId: 'server-1',
        echoDmThreadIds: new Set(),
      }),
    ).toBe(false);
  });
});
