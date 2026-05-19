import type { Ref } from 'vue';
import type { DmSubView } from '@/features/layout/mainSurface';
import type { NavAction } from '@/features/layout/navigationReducer';

/**
 * Explicit DM rail intents (incoming cluster + overflow) so controller handlers stay thin
 * and idempotency rules live in one place.
 */
export interface DmRailIntentDeps {
  activeRailTab: Ref<'servers' | 'explore' | 'dm'>;
  isDMPanelOpen: Ref<boolean>;
  selectedDMUserId: Ref<string | null>;
  activeChannelId: Ref<string>;
  dmActiveTab: Ref<DmSubView>;
  selectedMessageRequestId: Ref<string | null>;
  pfpBarExpanded: Ref<boolean>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  dispatchNav: (action: NavAction) => void;
  selectDmUser: (userId: string) => void | Promise<unknown>;
  /** Set after group DM actions init; opens a group thread from the rail stack. */
  selectGroupDm?: Ref<((channelId: string) => void) | undefined>;
  isGuestUser?: () => boolean;
  onGuestDmBlocked?: () => void;
}

export function createDmRailIntents(deps: DmRailIntentDeps) {
  const {
    activeRailTab,
    isDMPanelOpen,
    selectedDMUserId,
    activeChannelId,
    dmActiveTab,
    selectedMessageRequestId,
    pfpBarExpanded,
    echoDmPeerByChannelId,
    dispatchNav,
    selectDmUser,
    selectGroupDm,
    isGuestUser,
    onGuestDmBlocked,
  } = deps;

  function isActiveDmThreadForUser(userId: string): boolean {
    const cid = activeChannelId.value;
    if (cid === `dm-${userId}`) return true;
    return echoDmPeerByChannelId.value.get(cid) === userId;
  }

  /** Open/focus DM rail and open a group DM thread (no-op if already showing that channel). */
  function selectIncomingGroupDmFromRail(channelId: string) {
    if (isGuestUser?.()) {
      onGuestDmBlocked?.();
      return;
    }
    const openGroup = selectGroupDm?.value;
    if (!openGroup) return;
    const cid = channelId.trim();
    if (!cid) return;
    if (
      activeRailTab.value === 'dm' &&
      isDMPanelOpen.value &&
      activeChannelId.value === cid
    ) {
      return;
    }
    dispatchNav({ type: 'SELECT_DM_RAIL' });
    isDMPanelOpen.value = true;
    pfpBarExpanded.value = false;
    openGroup(cid);
  }

  /** Open/focus DM rail and start a 1:1 thread with `userId` (no-op if already showing that thread). */
  function selectIncomingDmFromRail(userId: string) {
    if (isGuestUser?.()) {
      onGuestDmBlocked?.();
      return;
    }
    if (
      activeRailTab.value === 'dm' &&
      isDMPanelOpen.value &&
      selectedDMUserId.value === userId &&
      isActiveDmThreadForUser(userId)
    ) {
      return;
    }
    dispatchNav({ type: 'SELECT_DM_RAIL' });
    isDMPanelOpen.value = true;
    pfpBarExpanded.value = false;
    void selectDmUser(userId);
  }

  /** Focus DM inbox messages tab without picking a peer (no-op if already in that chrome state). */
  function openDmInboxFromRailOverflow() {
    if (isGuestUser?.()) {
      onGuestDmBlocked?.();
      return;
    }
    if (
      activeRailTab.value === 'dm' &&
      isDMPanelOpen.value &&
      dmActiveTab.value === 'messages' &&
      selectedMessageRequestId.value === null &&
      !pfpBarExpanded.value
    ) {
      return;
    }
    dispatchNav({ type: 'SELECT_DM_RAIL' });
    isDMPanelOpen.value = true;
    dmActiveTab.value = 'messages';
    selectedMessageRequestId.value = null;
    pfpBarExpanded.value = false;
  }

  return {
    selectIncomingDmFromRail,
    selectIncomingGroupDmFromRail,
    openDmInboxFromRailOverflow,
  };
}
