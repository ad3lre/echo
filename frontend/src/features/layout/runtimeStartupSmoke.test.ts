// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { channelIcons } from '@/assets/icons';

vi.mock('@/features/layout/components/AppLayoutChatHeader.vue', () => ({
  default: { name: 'AppLayoutChatHeader', render: () => null },
}));
vi.mock('@/features/layout/components/AppLayoutPinsDropdown.vue', () => ({
  default: { name: 'AppLayoutPinsDropdown', render: () => null },
}));
vi.mock('@/features/layout/components/AppLayoutVoiceSection.vue', () => ({
  default: {
    name: 'AppLayoutVoiceSection',
    render: () => h('div', { 'data-testid': 'voice-section' }),
  },
}));
vi.mock(
  '@/features/layout/components/GuildVoiceFloatingSpeakerPill.vue',
  () => ({
    default: { name: 'GuildVoiceFloatingSpeakerPill', render: () => null },
  }),
);
vi.mock('@/features/layout/components/GuildVoiceStreamPip.vue', () => ({
  default: { name: 'GuildVoiceStreamPip', render: () => null },
}));
vi.mock('@/features/layout/components/AppLayoutDmSection.vue', () => ({
  default: {
    name: 'AppLayoutDmSection',
    render: () => h('div', { 'data-testid': 'dm-section' }),
  },
}));
vi.mock('@/features/layout/components/AppLayoutDmSidePanel.vue', () => ({
  default: { name: 'AppLayoutDmSidePanel', render: () => null },
}));
vi.mock('@/components/EchoDropdown.vue', () => ({
  default: { name: 'EchoDropdown', render: () => null },
}));
vi.mock('@/components/ChannelIconPickerPopover.vue', () => ({
  default: { name: 'ChannelIconPickerPopover', render: () => null },
}));
vi.mock(
  '@/features/channel-settings/components/PermissionOverwriteEditor.vue',
  () => ({
    default: { name: 'PermissionOverwriteEditor', render: () => null },
  }),
);

import AppLayoutChatSurface from '@/features/layout/components/AppLayoutChatSurface.vue';
import AppLayoutInfoBanners from '@/features/layout/components/AppLayoutInfoBanners.vue';
import ChannelSettingsModal from '@/components/ChannelSettingsModal.vue';

async function mountWithoutConsoleNoise(
  component: unknown,
  props: Record<string, unknown>,
  whileMounted?: (container: HTMLDivElement) => void | Promise<void>,
) {
  const warnings: string[] = [];
  const errors: string[] = [];
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const container = document.createElement('div');
  document.body.appendChild(container);

  const app = createApp(component as never, props);
  app.use(createPinia());
  app.config.warnHandler = (msg) => {
    warnings.push(String(msg));
  };
  app.config.errorHandler = (err) => {
    errors.push(err instanceof Error ? err.message : String(err));
  };

  try {
    app.mount(container);
    await nextTick();
    await Promise.resolve();
    await nextTick();
    if (whileMounted) await whileMounted(container);
  } finally {
    app.unmount();
    container.remove();
  }

  expect(warnings).toEqual([]);
  expect(errors).toEqual([]);
  expect(consoleWarn).not.toHaveBeenCalled();
  expect(consoleError).not.toHaveBeenCalled();
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('runtime startup smoke', () => {
  it('renders AppLayoutChatSurface unknown startup state without console noise', async () => {
    await mountWithoutConsoleNoise(AppLayoutChatSurface, {
      mainSurface: {
        type: 'unknown',
        reason: 'unresolved_server_channel',
        channelId: '',
      },
      callOverlay: { type: 'none' },
      isServerEmptyOnboarding: false,
      memberPanelCollapsed: false,
      memberPanelCollapsedRaw: false,
      isDmUiContext: false,
      isInDMMode: false,
      isViewingVoiceChannel: false,
      startMemberResize: () => {},
      resetMemberWidth: () => {},
      effectiveActiveChannel: null,
      isInDMChat: false,
      dmCallQuarterView: false,
      dmCallMatchesActiveChannel: true,
      isExpandedProfileSidePanel: false,
      isExpandedProfileModalOpen: false,
      isGroupOverviewOpen: false,
      dmPartnerUser: null,
      presenceByUserId: {},
      openExpandedProfilePanelForUserId: () => {},
      isGroupDM: false,
      activeGroupDM: null,
      icons: {},
      dmActiveTab: 'messages',
      getChannelIcon: () => channelIcons.text,
      getChannelDisplayName: (name: string) => name ?? '',
      togglePinsDropdown: () => {},
      memberPanelWidth: 320,
      searchText: '',
      filterChips: [],
      allChannels: [],
      users: [],
      paginatedSearchResults: [],
      searchResultMessagesCount: 0,
      searchResultPage: 1,
      totalPages: 1,
      selectedServerName: '',
      onSearchInput: () => {},
      addFilter: () => {},
      removeFilter: () => {},
      clearSearch: () => {},
      goToSearchPage: () => {},
      handleGoToMessage: () => {},
      searchLoading: false,
      searchError: null,
      searchScopeHint: '',
      isRolePreviewActiveForServer: false,
      rolePreview: null,
      clearRolePreview: () => {},
      dmCallWithUserId: null,
      dmCallRinging: false,
      dmCallAwaitingAccept: false,
      dmCallRingUi: false,
      dmCallLobbyAfterSelfLeave: false,
      dmCallRingRemoteVanishing: false,
      dmCallGlassPeer: null,
      endDmCall: () => {},
      leaveDmCallVoice: () => {},
      rejoinDmCallVoice: () => {},
      startDmCall: () => {},
      isPinsDropdownOpen: false,
      pinsButtonRefDm: null,
      pinsButtonRefServer: null,
      openGroupDMModal: () => {},
      startGroupCall: () => {},
      openGroupOverviewPanel: () => {},
      activeGroupCallMembers: [],
      currentUser: null,
      dmCallVideo: false,
      dmCallScreenshare: false,
      dmCallMuted: false,
      dmCallDeafened: false,
      onToggleDmCallVideo: () => {},
      onToggleDmCallScreenshare: () => {},
      onToggleDmCallMuted: () => {},
      onToggleDmCallDeafened: () => {},
      onSetDmCallFullscreen: () => {},
      dmCallCallViewParticipants: [],
      pinsDropdownRect: null,
      pinnedMessagesForDropdown: [],
      pinPreview: () => '',
      closePinsDropdown: () => {},
      goToPinnedMessage: () => {},
      activeVoiceChannelParticipants: [],
      selectedServerId: 'echo',
      activeChannelMessagesMap: new Map(),
      sendMessage: () => {},
      voiceSideChatCollapsed: true,
      voiceSideChatWidth: 360,
      startVoiceSideChatResize: () => {},
      resetVoiceSideChatWidth: () => {},
      expandVoiceSideChat: () => {},
      toggleVoiceSideChat: () => {},
      voiceMobileSheetLevel: 0,
      bumpVoiceMobileChatFromCallScrollUp: () => {},
      bumpVoiceMobileChatFromCallScrollDown: () => {},
      currentVoiceChannelId: null,
      handleCallViewOpenProfile: () => {},
      canModerateVcParticipant: () => false,
      canVcModerateParticipantAction: () => false,
      handleVcModerate: () => {},
      handlePollVote: () => {},
      editMessage: () => {},
      deleteMessage: () => {},
      handleReact: () => {},
      handleGoToChannel: () => {},
      showNsfwChatGate: false,
      acknowledgeNsfwChannel: () => {},
      declineNsfwGate: () => {},
      openMemberProfile: () => {},
      canModerateAuthor: () => false,
      handleModerateUser: () => {},
      isDMPanelOpen: false,
      friendIds: [],
      friendRequestsIncoming: [],
      friendRequestsOutgoing: [],
      selectedDMUserId: null,
      messageRequests: [],
      selectedMessageRequestId: null,
      messages: {},
      selectDM: () => {},
      acceptFriendRequest: () => {},
      declineFriendRequest: () => {},
      cancelFriendRequest: () => {},
      sendFriendRequest: () => {},
      ignoreMessageRequest: () => {},
      handleAcceptMessageRequest: () => {},
      returnFromMessageRequests: () => {},
      dmCallFullscreen: false,
      pinnedMessageIdsForCurrentChannel: [],
      handlePinMessage: () => {},
      handleUnpinMessage: () => {},
      expandedProfile: null,
      isExpandedProfileFriend: false,
      expandedProfileNote: '',
      onUpdateExpandedProfileNote: () => {},
      onExpandedProfileModalUpdate: () => {},
      handleExpandedProfileOpenServer: () => {},
      handleExpandedProfileOpenProfile: () => {},
      expandDmProfileToFullModal: () => {},
      handleExpandedProfileOpenDM: () => {},
      handleMemberPopoutQuickDm: async () => {},
      handleExpandedProfileSendFriendRequest: () => {},
      handleExpandedProfileRemoveFriend: () => {},
      isExpandedProfileTargetBlocked: false,
      handleProfileBlockUser: () => {},
      handleProfileUnblockUser: () => {},
      handleProfileReportUser: () => {},
      onCloseGroupOverview: () => {},
      handleKickGroupDmMember: () => {},
      handleLeaveGroupDm: () => {},
      openGroupSettingsFromHeader: () => {},
      resolveAuthorRole: () => null,
      onOpenExplore: () => {},
      remoteParticipants: new Map(),
      lkRoom: null,
      mirrorLocalCamera: false,
      getLocalScreenTrack: () => null,
      getLocalCameraTrack: () => null,
      onRequestFullscreenStream: () => {},
      fullscreenStreamParticipantId: null,
      vcActivityUi: {
        phase: 'closed',
        youtubeVideoId: null,
        youtubeBrowseOpen: true,
        playlist: [],
        currentIndex: 0,
        codenamesRoomUrl: null,
      },
      openVcActivityPicker: () => {},
      openVcActivityYoutubeBrowse: () => {},
      openVcActivityWordle: () => {},
      openVcActivityHangman: () => {},
      vcHangmanActivity: computed(() => null),
      hangmanRosterUserIds: computed(() => []),
      commitVcHangmanWord: () => null,
      requestVcHangmanGuessLetter: () => {},
      requestVcHangmanNextRound: () => {},
      openVcActivityOpenGuessr: () => {},
      openVcActivitySkribblIo: () => {},
      openVcActivityGarticPhone: () => {},
      openVcActivityKrunker: () => {},
      openVcActivityCodenames: () => {},
      openVcActivityRichup: () => {},
      openVcActivityGooberDash: () => {},
      openVcActivitySmashKarts: () => {},
      openVcActivityBasketballStars2026: () => {},
      openVcActivityClusterRush: () => {},
      setVcActivityYoutubeVideo: () => {},
      setVcActivityCodenamesRoomUrl: () => {},
      setVcYoutubeBrowseOpen: () => {},
      addVcYoutubeToQueue: () => {},
      removeVcYoutubeFromQueue: () => {},
      moveVcYoutubeInQueue: () => {},
      playVcYoutubeAtIndex: () => {},
      playVcYoutubeNext: () => {},
      playVcYoutubePrevious: () => {},
      closeVcActivity: () => {},
      onRequestForward: () => {},
      canShowDiscordChannelImport: false,
      isCompactShell: false,
      narrowChannelPanelForActivityOverflowStep: () => false,
    });
  });

  it('routes serverVoice surface to voice section even with DM call overlay', async () => {
    await mountWithoutConsoleNoise(
      AppLayoutChatSurface,
      {
        mainSurface: { type: 'serverVoice', channelId: 'voice-1' },
        callOverlay: { type: 'dmCall', fullscreen: false },
        memberPanelCollapsed: true,
        memberPanelCollapsedRaw: true,
        isViewingVoiceChannel: true,
        vcActivityUi: {
          phase: 'closed',
          youtubeVideoId: null,
          youtubeBrowseOpen: true,
          playlist: [],
          currentIndex: 0,
          codenamesRoomUrl: null,
        },
        openVcActivityPicker: () => {},
        openVcActivityYoutubeBrowse: () => {},
        openVcActivityWordle: () => {},
        openVcActivityHangman: () => {},
        vcHangmanActivity: computed(() => null),
        hangmanRosterUserIds: computed(() => []),
        commitVcHangmanWord: () => null,
        requestVcHangmanGuessLetter: () => {},
        requestVcHangmanNextRound: () => {},
        openVcActivityOpenGuessr: () => {},
        openVcActivitySkribblIo: () => {},
        openVcActivityGarticPhone: () => {},
        openVcActivityKrunker: () => {},
        openVcActivityCodenames: () => {},
        openVcActivityRichup: () => {},
        openVcActivityGooberDash: () => {},
        openVcActivitySmashKarts: () => {},
        openVcActivityBasketballStars2026: () => {},
        openVcActivityClusterRush: () => {},
        setVcActivityYoutubeVideo: () => {},
        setVcActivityCodenamesRoomUrl: () => {},
        setVcYoutubeBrowseOpen: () => {},
        addVcYoutubeToQueue: () => {},
        removeVcYoutubeFromQueue: () => {},
        moveVcYoutubeInQueue: () => {},
        playVcYoutubeAtIndex: () => {},
        playVcYoutubeNext: () => {},
        playVcYoutubePrevious: () => {},
        closeVcActivity: () => {},
        isCompactShell: false,
        narrowChannelPanelForActivityOverflowStep: () => false,
      },
      (container) => {
        expect(
          container.querySelector('[data-testid="voice-section"]'),
        ).not.toBe(null);
        expect(container.querySelector('[data-testid="dm-section"]')).toBe(
          null,
        );
      },
    );
  });

  it('renders AppLayoutInfoBanners with explicit boolean props and no console noise', async () => {
    await mountWithoutConsoleNoise(AppLayoutInfoBanners, {
      showApiFetchErrorBanner: false,
      apiErrorText: null,
      sessionEndedMessage: null,
      sessionReturningUserHint: false,
      isMockDataMode: false,
      echoWorkspaceError: null,
      showWelcomeBackHint: false,
      emailVerificationFlash: null,
      showGuestUpgradeBanner: false,
      showUnverifiedEmailBanner: false,
      emailBannerResendBusy: false,
      emailBannerResendMessage: null,
      emailBannerResendError: null,
    });
  });

  it('loads ChannelSettingsModal without import/runtime errors', async () => {
    await mountWithoutConsoleNoise(ChannelSettingsModal, {
      modelValue: false,
      serverName: '',
      categoryOptions: [],
      channelSettings: null,
      categoryPermissionDefaults: null,
      echoPermissionEditor: null,
    });
  });
});
