import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
import { useRailNavigation } from '@/features/layout/composables/useRailNavigation';
import type { DmSubView } from '@/features/layout/mainSurface';

describe('useRailNavigation clearPhoneHomeDmThread', () => {
  it('clears DM thread on phone Home without switching to servers rail', () => {
    const activeRailTab = ref<'servers' | 'explore' | 'dm'>('dm');
    const isDMPanelOpen = ref(true);
    const isMoreServersPanelOpen = ref(false);
    const pfpBarExpanded = ref(false);
    const activeChannelId = ref('dm-thread-1');
    const selectedDMUserId = ref<string | null>('user-1');
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const mobileBottomTab = ref<'home' | 'servers' | 'explore'>('home');
    const mobileHomeStack = ref<'hub' | 'thread'>('thread');
    const isCompactPhoneShell = ref(true);

    const { clearPhoneHomeDmThread, closeDMPanel } = useRailNavigation({
      activeRailTab,
      isDMPanelOpen,
      isMoreServersPanelOpen,
      pfpBarExpanded,
      activeChannelId,
      selectedDMUserId,
      dmActiveTab,
      selectedMessageRequestId,
      selectedServerId: ref(null),
      selectDM: () => {},
      getLatestDMUserId: () => null,
      isCompactPhoneShell,
      mobileBottomTab,
      mobileHomeStack,
      isDmThreadActive: computed(() => true),
    });

    clearPhoneHomeDmThread();

    expect(activeRailTab.value).toBe('dm');
    expect(mobileBottomTab.value).toBe('home');
    expect(mobileHomeStack.value).toBe('hub');
    expect(selectedDMUserId.value).toBeNull();
    expect(isDMPanelOpen.value).toBe(true);
    expect(activeChannelId.value).toBe('general');

    selectedDMUserId.value = 'user-2';
    mobileHomeStack.value = 'thread';
    activeChannelId.value = 'dm-thread-2';
    closeDMPanel();

    expect(activeRailTab.value).toBe('dm');
    expect(mobileBottomTab.value).toBe('home');
    expect(mobileHomeStack.value).toBe('hub');
    expect(selectedDMUserId.value).toBeNull();
  });

  it('closeDMPanel still switches to servers rail off phone Home', () => {
    const activeRailTab = ref<'servers' | 'explore' | 'dm'>('dm');
    const isDMPanelOpen = ref(true);
    const isMoreServersPanelOpen = ref(false);
    const pfpBarExpanded = ref(false);
    const activeChannelId = ref('general');
    const selectedDMUserId = ref<string | null>('user-1');
    const dmActiveTab = ref<DmSubView>('messages');
    const selectedMessageRequestId = ref<string | null>(null);
    const isCompactPhoneShell = ref(false);

    const { closeDMPanel } = useRailNavigation({
      activeRailTab,
      isDMPanelOpen,
      isMoreServersPanelOpen,
      pfpBarExpanded,
      activeChannelId,
      selectedDMUserId,
      dmActiveTab,
      selectedMessageRequestId,
      selectedServerId: ref(null),
      selectDM: () => {},
      getLatestDMUserId: () => null,
      isCompactPhoneShell,
    });

    closeDMPanel();

    expect(activeRailTab.value).toBe('servers');
    expect(isDMPanelOpen.value).toBe(false);
  });
});
