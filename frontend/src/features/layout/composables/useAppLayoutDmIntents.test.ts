import { describe, expect, it, vi } from 'vitest';
import { ref, shallowRef } from 'vue';
import type { DmSubView } from '@/features/layout/mainSurface';
import { createDmRailIntents } from './useAppLayoutDmIntents';

describe('createDmRailIntents', () => {
  it('selectIncomingDmFromRail is idempotent when that DM thread is already active', () => {
    const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const activeRailTab = ref<'servers' | 'explore' | 'dm'>('dm');
    const isDMPanelOpen = ref(true);
    const selectedDMUserId = ref<string | null>(userId);
    const activeChannelId = ref(`dm-${userId}`);
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const pfpBarExpanded = ref(false);
    const echoDmPeerByChannelId = ref(new Map<string, string>());
    const dispatchNav = vi.fn();
    const selectDmUser = vi.fn();

    const { selectIncomingDmFromRail } = createDmRailIntents({
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
    });

    selectIncomingDmFromRail(userId);
    expect(dispatchNav).not.toHaveBeenCalled();
    expect(selectDmUser).not.toHaveBeenCalled();
  });

  it('selectIncomingGroupDmFromRail is idempotent when that group channel is already active', () => {
    const channelId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const activeRailTab = ref<'servers' | 'explore' | 'dm'>('dm');
    const isDMPanelOpen = ref(true);
    const selectedDMUserId = ref<string | null>(null);
    const activeChannelId = ref(channelId);
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const pfpBarExpanded = ref(false);
    const echoDmPeerByChannelId = ref(new Map<string, string>());
    const dispatchNav = vi.fn();
    const selectDmUser = vi.fn();
    const selectGroupDm = shallowRef((id: string) => {
      void id;
    });

    const { selectIncomingGroupDmFromRail } = createDmRailIntents({
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
    });

    selectIncomingGroupDmFromRail(channelId);
    expect(dispatchNav).not.toHaveBeenCalled();
    expect(selectGroupDm.value).toBeDefined();
  });

  it('openDmInboxFromRailOverflow is idempotent when inbox chrome already matches', () => {
    const activeRailTab = ref<'servers' | 'explore' | 'dm'>('dm');
    const isDMPanelOpen = ref(true);
    const selectedDMUserId = ref<string | null>(null);
    const activeChannelId = ref('general');
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const pfpBarExpanded = ref(false);
    const echoDmPeerByChannelId = ref(new Map<string, string>());
    const dispatchNav = vi.fn();
    const selectDmUser = vi.fn();

    const { openDmInboxFromRailOverflow } = createDmRailIntents({
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
    });

    openDmInboxFromRailOverflow();
    expect(dispatchNav).not.toHaveBeenCalled();
  });

  it('blocks incoming DM rail intents for guests with onGuestDmBlocked', () => {
    const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const activeRailTab = ref<'servers' | 'explore' | 'dm'>('servers');
    const isDMPanelOpen = ref(false);
    const selectedDMUserId = ref<string | null>(null);
    const activeChannelId = ref('general');
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const pfpBarExpanded = ref(false);
    const echoDmPeerByChannelId = ref(new Map<string, string>());
    const dispatchNav = vi.fn();
    const selectDmUser = vi.fn();
    const onGuestDmBlocked = vi.fn();
    const isGuestUser = () => true;

    const {
      selectIncomingDmFromRail,
      selectIncomingGroupDmFromRail,
      openDmInboxFromRailOverflow,
    } = createDmRailIntents({
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
      selectGroupDm: shallowRef(vi.fn() as (channelId: string) => void),
      isGuestUser,
      onGuestDmBlocked,
    });

    selectIncomingDmFromRail(userId);
    selectIncomingGroupDmFromRail(userId);
    openDmInboxFromRailOverflow();
    expect(onGuestDmBlocked).toHaveBeenCalledTimes(3);
    expect(dispatchNav).not.toHaveBeenCalled();
    expect(selectDmUser).not.toHaveBeenCalled();
  });
});
