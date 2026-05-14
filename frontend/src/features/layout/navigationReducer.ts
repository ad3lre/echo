/**
 * Central navigation transitions. Layout-only actions (open DM sidebar width) live outside this module.
 */

import type { DmSubView, NavState, RailTab } from './mainSurface';

export type NavAction =
  | { type: 'SELECT_SERVERS_TAB' }
  | { type: 'SELECT_EXPLORE_TAB' }
  | { type: 'SELECT_DM_RAIL' }
  | { type: 'SET_DM_SUBVIEW'; subView: DmSubView }
  | { type: 'SELECT_CHANNEL'; channelId: string };

/** When switching away from the DM rail, drop any DM thread id (legacy or Echo snowflake). */
export type ReduceNavigationOptions = {
  isPersistedEchoDmThread?: (channelId: string) => boolean;
};

function clearDmThreadIfNeeded(
  channelId: string,
  isPersistedEchoDmThread?: (channelId: string) => boolean,
): string {
  if (channelId.startsWith('dm-') || channelId.startsWith('dm-group-'))
    return 'general';
  if (isPersistedEchoDmThread?.(channelId)) return 'general';
  return channelId;
}

export function reduceNavigation(
  prev: NavState,
  action: NavAction,
  opts?: ReduceNavigationOptions,
): NavState {
  const clear = (id: string) =>
    clearDmThreadIfNeeded(id, opts?.isPersistedEchoDmThread);

  switch (action.type) {
    case 'SELECT_SERVERS_TAB':
      return {
        ...prev,
        rail: 'servers',
        dmSubView: 'messages',
        activeChannelId: clear(prev.activeChannelId),
      };
    case 'SELECT_EXPLORE_TAB':
      return {
        ...prev,
        rail: 'explore',
        dmSubView: 'messages',
        activeChannelId: clear(prev.activeChannelId),
      };
    case 'SELECT_DM_RAIL':
      return {
        ...prev,
        rail: 'dm',
      };
    case 'SET_DM_SUBVIEW':
      return {
        ...prev,
        rail: 'dm',
        dmSubView: action.subView,
      };
    case 'SELECT_CHANNEL':
      return {
        ...prev,
        activeChannelId: action.channelId,
      };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/** Apply snapshot to external refs (Vue / Pinia). */
export function navStateFromRefs(input: {
  rail: RailTab;
  dmSubView: DmSubView;
  activeChannelId: string;
  selectedServerId: string | null;
}): NavState {
  return {
    rail: input.rail,
    dmSubView: input.dmSubView,
    activeChannelId: input.activeChannelId,
    selectedServerId: input.selectedServerId,
  };
}

export function applyNavStateToRefs(
  state: NavState,
  refs: {
    activeRailTab: { value: RailTab };
    dmActiveTab: { value: DmSubView };
    activeChannelId: { value: string };
  },
): void {
  refs.activeRailTab.value = state.rail;
  refs.dmActiveTab.value = state.dmSubView;
  refs.activeChannelId.value = state.activeChannelId;
}
