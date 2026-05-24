import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { ExpandedProfile } from '@/utils/memberProfiles';
import { useAppLayoutProfiles } from './useAppLayoutProfiles';

describe('useAppLayoutProfiles DM overview', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens side overview then expands to full modal on repeat avatar open', () => {
    const users = ref([
      { id: 'self', name: 'Self', pfp: 'self.png' },
      { id: 'peer', name: 'Peer', pfp: 'peer.png' },
    ]);
    const isInDMChat = ref(true);
    const isMemberPopoutOpen = ref(false);
    const isSelfProfilePopoutOpen = ref(false);
    const isExpandedProfileModalOpen = ref(false);
    const isExpandedProfileSidePanel = ref(false);
    const canShowDmProfileSidePanel = ref(true);
    const isGroupOverviewOpen = ref(false);
    const activeMemberProfile = ref(null);
    const expandedProfile = ref<ExpandedProfile | null>(null);
    const expandedProfileTargetUserId = ref<string | null>(null);
    const profileNotes = ref<Record<string, string>>({});
    const memberPopoutAnchor = ref(null);
    const selfProfileAnchor = ref(null);
    const selfProfile = ref(null);

    const api = useAppLayoutProfiles({
      users,
      servers: ref([]),
      serverMemberIds: ref({}),
      friendIdsByUserId: ref({}),
      friendIds: ref([]),
      currentUser: ref(users.value[0]),
      selectedServer: ref(null),
      workspaceMembersByServer: ref({}),
      isInDMChat,
      isMemberPopoutOpen,
      isSelfProfilePopoutOpen,
      isExpandedProfileModalOpen,
      isExpandedProfileSidePanel,
      canShowDmProfileSidePanel,
      isGroupOverviewOpen,
      activeMemberProfile,
      expandedProfile,
      expandedProfileTargetUserId,
      profileNotes,
      memberPopoutAnchor,
      selfProfileAnchor,
      selfProfile,
    });

    api.openExpandedProfilePanelForUserId('peer');
    expect(isExpandedProfileModalOpen.value).toBe(true);
    expect(isExpandedProfileSidePanel.value).toBe(true);
    expect(expandedProfile.value?.id).toBe('peer');

    api.openExpandedProfilePanelForUserId('peer');
    expect(isExpandedProfileModalOpen.value).toBe(true);
    expect(isExpandedProfileSidePanel.value).toBe(false);

    vi.advanceTimersByTime(500);
    api.openExpandedProfilePanelForUserId('peer');
    expect(isExpandedProfileModalOpen.value).toBe(false);
  });

  it('opens full modal directly for avatar/name clicks in DMs', () => {
    const users = ref([
      { id: 'self', name: 'Self', pfp: 'self.png' },
      { id: 'peer', name: 'Peer', pfp: 'peer.png' },
    ]);
    const isInDMChat = ref(true);
    const isMemberPopoutOpen = ref(false);
    const isSelfProfilePopoutOpen = ref(false);
    const isExpandedProfileModalOpen = ref(false);
    const isExpandedProfileSidePanel = ref(true);
    const canShowDmProfileSidePanel = ref(true);
    const isGroupOverviewOpen = ref(false);
    const activeMemberProfile = ref(null);
    const expandedProfile = ref<ExpandedProfile | null>(null);
    const expandedProfileTargetUserId = ref<string | null>(null);
    const profileNotes = ref<Record<string, string>>({});
    const memberPopoutAnchor = ref(null);
    const selfProfileAnchor = ref(null);
    const selfProfile = ref(null);

    const api = useAppLayoutProfiles({
      users,
      servers: ref([]),
      serverMemberIds: ref({}),
      friendIdsByUserId: ref({}),
      friendIds: ref([]),
      currentUser: ref(users.value[0]),
      selectedServer: ref(null),
      workspaceMembersByServer: ref({}),
      isInDMChat,
      isMemberPopoutOpen,
      isSelfProfilePopoutOpen,
      isExpandedProfileModalOpen,
      isExpandedProfileSidePanel,
      canShowDmProfileSidePanel,
      isGroupOverviewOpen,
      activeMemberProfile,
      expandedProfile,
      expandedProfileTargetUserId,
      profileNotes,
      memberPopoutAnchor,
      selfProfileAnchor,
      selfProfile,
    });

    vi.advanceTimersByTime(500);

    api.openExtendedProfileModalForUserId('peer');
    expect(isExpandedProfileModalOpen.value).toBe(true);
    expect(isExpandedProfileSidePanel.value).toBe(false);
    expect(expandedProfile.value?.id).toBe('peer');

    isExpandedProfileSidePanel.value = true;
    api.openExtendedProfileModalForUserId('peer');
    expect(isExpandedProfileModalOpen.value).toBe(true);
    expect(isExpandedProfileSidePanel.value).toBe(false);
  });
});
