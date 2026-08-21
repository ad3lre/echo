import { describe, expect, it } from 'vitest';
import {
  applyNavStateToRefs,
  navStateFromRefs,
  reduceNavigation,
} from './navigationReducer';

const baseState = {
  rail: 'servers' as const,
  dmSubView: 'messages' as const,
  activeChannelId: 'general',
  selectedServerId: 'srv1' as string | null,
};

describe('reduceNavigation', () => {
  it('clears legacy dm thread prefix when selecting servers tab', () => {
    const prev = { ...baseState, activeChannelId: 'dm-abc' };
    const next = reduceNavigation(prev, { type: 'SELECT_SERVERS_TAB' });
    expect(next.rail).toBe('servers');
    expect(next.activeChannelId).toBe('general');
  });

  it('clears persisted Echo DM thread when predicate matches', () => {
    const prev = { ...baseState, activeChannelId: 'snowflake-dm' };
    const next = reduceNavigation(
      prev,
      { type: 'SELECT_EXPLORE_TAB' },
      {
        isPersistedEchoDmThread: (id) => id === 'snowflake-dm',
      },
    );
    expect(next.rail).toBe('explore');
    expect(next.activeChannelId).toBe('general');
  });

  it('keeps guild channel id when switching to servers tab', () => {
    const prev = { ...baseState, activeChannelId: 'ch-text' };
    const next = reduceNavigation(prev, { type: 'SELECT_SERVERS_TAB' });
    expect(next.activeChannelId).toBe('ch-text');
  });

  it('SELECT_DM_RAIL only changes rail', () => {
    const prev = { ...baseState, activeChannelId: 'ch1' };
    const next = reduceNavigation(prev, { type: 'SELECT_DM_RAIL' });
    expect(next.rail).toBe('dm');
    expect(next.activeChannelId).toBe('ch1');
  });

  it('SELECT_CHANNEL sets active channel only', () => {
    const next = reduceNavigation(baseState, {
      type: 'SELECT_CHANNEL',
      channelId: 'c99',
    });
    expect(next.activeChannelId).toBe('c99');
    expect(next.rail).toBe('servers');
  });
});

describe('navStateFromRefs + applyNavStateToRefs', () => {
  it('round-trips through refs', () => {
    const state = navStateFromRefs({
      rail: 'dm',
      dmSubView: 'friends',
      activeChannelId: 'x',
      selectedServerId: null,
    });
    expect(state.selectedServerId).toBeNull();

    const activeRailTab = { value: 'servers' as const };
    const dmActiveTab = { value: 'messages' as const };
    const activeChannelId = { value: 'old' };
    applyNavStateToRefs(state, {
      activeRailTab,
      dmActiveTab,
      activeChannelId,
    });
    expect(activeRailTab.value).toBe('dm');
    expect(dmActiveTab.value).toBe('friends');
    expect(activeChannelId.value).toBe('x');
  });
});
