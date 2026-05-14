import type { ComputedRef, Ref } from 'vue';
import { unref } from 'vue';
import type { DmSubView } from '@/features/layout/mainSurface';
import { isDmThreadId } from '@/features/layout/mainSurface';
import { logShellNav } from '@/features/layout/shellNavDebugLog';
import {
  applyNavStateToRefs,
  navStateFromRefs,
  reduceNavigation,
  type NavAction,
} from '@/features/layout/navigationReducer';

interface UseRailNavigationOptions {
  activeRailTab: Ref<'servers' | 'explore' | 'dm'>;
  isDMPanelOpen: Ref<boolean>;
  isMoreServersPanelOpen: Ref<boolean>;
  pfpBarExpanded: Ref<boolean>;
  activeChannelId: Ref<string>;
  selectedDMUserId: Ref<string | null>;
  dmActiveTab: Ref<DmSubView>;
  selectedMessageRequestId: Ref<string | null>;
  selectedServerId: Ref<string | null> | ComputedRef<string | null>;
  selectDM: (userId: string) => void | Promise<unknown>;
  getLatestDMUserId: () => string | null;
  /** Inbox-aware latest (includes group DMs); preferred over {@link getLatestDMUserId} when set. */
  getLatestDmInboxTarget?: () =>
    | { kind: 'user'; userId: string }
    | { kind: 'group'; channelId: string }
    | null;
  /** Open a group DM thread (Echo rail “restore latest”). */
  selectGroupDM?: (channelId: string) => void;
  /** Echo snowflake DM thread ids — must clear when leaving DM rail for servers/explore. */
  isPersistedEchoDmThread?: (channelId: string) => boolean;
  /** When set, used instead of `isDmThreadId(activeChannelId)` for rail close / DM tab behavior. */
  isDmThreadActive?: ComputedRef<boolean>;
  /** When true, DM rail opens are blocked and {@link onGuestDmBlocked} runs instead. */
  isGuestUser?: () => boolean;
  onGuestDmBlocked?: () => void;
  /**
   * Compact / phone shell: DM rail opens the inbox list only — do not auto-select the latest thread.
   */
  isCompactShell?: Ref<boolean>;
}

export function useRailNavigation(options: UseRailNavigationOptions) {
  const {
    activeRailTab,
    isDMPanelOpen,
    isMoreServersPanelOpen,
    pfpBarExpanded,
    activeChannelId,
    selectedDMUserId,
    dmActiveTab,
    selectedMessageRequestId,
    selectDM,
    getLatestDMUserId,
    getLatestDmInboxTarget,
    selectGroupDM,
    selectedServerId,
    isPersistedEchoDmThread,
    isDmThreadActive,
    isGuestUser,
    onGuestDmBlocked,
    isCompactShell,
  } = options;

  function dmThreadActiveNow(): boolean {
    const v = isDmThreadActive ? unref(isDmThreadActive) : undefined;
    if (typeof v === 'boolean') return v;
    return isDmThreadId(activeChannelId.value);
  }

  function dispatchNav(action: NavAction) {
    const next = reduceNavigation(
      navStateFromRefs({
        rail: activeRailTab.value,
        dmSubView: dmActiveTab.value,
        activeChannelId: activeChannelId.value,
        selectedServerId: selectedServerId.value,
      }),
      action,
      isPersistedEchoDmThread ? { isPersistedEchoDmThread } : undefined,
    );
    applyNavStateToRefs(next, {
      activeRailTab,
      dmActiveTab,
      activeChannelId,
    });
  }

  function closeDMPanel() {
    isDMPanelOpen.value = false;
    selectedDMUserId.value = null;
    selectedMessageRequestId.value = null;
    if (activeRailTab.value === 'dm') {
      dispatchNav({ type: 'SELECT_SERVERS_TAB' });
    } else {
      dmActiveTab.value = 'messages';
      if (dmThreadActiveNow()) {
        logShellNav('useRailNavigation', 'closeDMPanel_dm_thread_to_general', {
          from: activeChannelId.value,
        });
        activeChannelId.value = 'general';
      }
    }
  }

  function selectServersTab() {
    logShellNav('useRailNavigation', 'selectServersTab', {
      hadDmPanelOpen: isDMPanelOpen.value,
      activeChannelBefore: activeChannelId.value,
    });
    dispatchNav({ type: 'SELECT_SERVERS_TAB' });
    isDMPanelOpen.value = false;
    selectedDMUserId.value = null;
    selectedMessageRequestId.value = null;
    pfpBarExpanded.value = false;
  }

  function selectExploreTab() {
    dispatchNav({ type: 'SELECT_EXPLORE_TAB' });
    isDMPanelOpen.value = false;
    selectedDMUserId.value = null;
    selectedMessageRequestId.value = null;
    isMoreServersPanelOpen.value = false;
    pfpBarExpanded.value = false;
  }

  function selectDMTab() {
    if (isGuestUser?.()) {
      onGuestDmBlocked?.();
      return;
    }
    dispatchNav({ type: 'SELECT_DM_RAIL' });
    dmActiveTab.value = 'messages';
    selectedMessageRequestId.value = null;
    // Always show the DM list surface when the DM rail is selected (avoids a blank
    // strip after Explore or other flows left `isDMPanelOpen` out of sync).
    isDMPanelOpen.value = true;
    const skipAutoOpenThread = isCompactShell?.value === true;
    if (!skipAutoOpenThread && !dmThreadActiveNow()) {
      const inbox = getLatestDmInboxTarget?.() ?? null;
      if (inbox?.kind === 'group' && typeof selectGroupDM === 'function') {
        selectGroupDM(inbox.channelId);
      } else if (inbox?.kind === 'user') {
        void Promise.resolve(selectDM(inbox.userId));
      } else {
        const latest = getLatestDMUserId();
        if (latest) void Promise.resolve(selectDM(latest));
      }
    }
    pfpBarExpanded.value = false;
  }

  return {
    selectServersTab,
    selectExploreTab,
    selectDMTab,
    closeDMPanel,
    dispatchNav,
  };
}
