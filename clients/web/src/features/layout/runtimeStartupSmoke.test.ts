// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyWatchTogetherUiFields } from '@/features/voice/vcActivityTypes';
import { computed, createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { channelIcons } from '@/assets/icons';

/* `__esModule: true` lets Vue's defineAsyncComponent unwrap `.default`
 * from the vitest mock namespace (its proxy throws on unknown probes). */
function stubChild(name: string, testId?: string) {
  return {
    __esModule: true,
    default: {
      name,
      inheritAttrs: false,
      setup() {
        return () => (testId ? h('div', { 'data-testid': testId }) : null);
      },
    },
  };
}

vi.mock('@/features/layout/components/AppLayoutChatHeader.vue', () =>
  stubChild('AppLayoutChatHeader'),
);
vi.mock('@/features/layout/components/AppLayoutPinsDropdown.vue', () =>
  stubChild('AppLayoutPinsDropdown'),
);
vi.mock('@/features/layout/components/AppLayoutVoiceSection.vue', () =>
  stubChild('AppLayoutVoiceSection', 'voice-section'),
);
vi.mock('@/features/layout/components/GuildVoiceFloatingSpeakerPill.vue', () =>
  stubChild('GuildVoiceFloatingSpeakerPill'),
);
vi.mock('@/features/layout/components/GuildVoiceStreamPip.vue', () =>
  stubChild('GuildVoiceStreamPip'),
);
vi.mock('@/features/layout/components/AppLayoutDmSection.vue', () =>
  stubChild('AppLayoutDmSection', 'dm-section'),
);
vi.mock('@/features/layout/components/AppLayoutPaperSection.vue', () =>
  stubChild('AppLayoutPaperSection'),
);
vi.mock('@/features/layout/components/AppLayoutForumSection.vue', () =>
  stubChild('AppLayoutForumSection'),
);
vi.mock('@/features/layout/components/AppLayoutDmSidePanel.vue', () =>
  stubChild('AppLayoutDmSidePanel'),
);
vi.mock('@/components/EchoDropdown.vue', () => stubChild('EchoDropdown'));
vi.mock('@/features/channel-settings/ChannelIconPickerPopover.vue', () =>
  stubChild('ChannelIconPickerPopover'),
);
vi.mock(
  '@/features/channel-settings/components/PermissionOverwriteEditor.vue',
  () => stubChild('PermissionOverwriteEditor'),
);

import AppLayoutChatSurface from '@/features/layout/components/AppLayoutChatSurface.vue';
import AppLayoutInfoBanners from '@/features/layout/components/AppLayoutInfoBanners.vue';
import ChannelSettingsModal from '@/features/channel-settings/components/ChannelSettingsModal.vue';

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

async function waitForAsyncSurfaceComponents(): Promise<void> {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 250));
  await flushPromises();
}

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
    await waitForAsyncSurfaceComponents();
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
      openExtendedProfileModalForUserId: () => {},
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
        ...emptyWatchTogetherUiFields(),
      },
      openVcActivityPicker: () => {},
      openVcActivityYoutubeBrowse: () => {},
      openVcActivityWatchTogether: () => {},
      openVcActivityWordle: () => {},
      openVcActivityHangman: () => {},
      openVcActivitySkriggles: () => {},
      openVcActivityTicTacToe: () => {},
      vcHangmanActivity: computed(() => null),
      hangmanRosterUserIds: computed(() => []),
      hangmanGameRoomConnected: computed(() => false),
      hangmanGameRoomLastError: computed(() => null),
      commitVcHangmanWord: () => null,
      requestVcHangmanGuessLetter: () => {},
      requestVcHangmanNextRound: () => {},
      wordlineView: computed(() => null),
      submitWordlineGuess: () => {},
      setWordlineMode: () => {},
      vcSkrigglesActivity: computed(() => null),
      skrigglesRosterUserIds: computed(() => []),
      skrigglesCanvasEvents: ref([]),
      commitSkrigglesWordChoice: () => {},
      submitSkrigglesGuess: () => {},
      updateSkrigglesSettings: () => {},
      startSkrigglesGame: () => {},
      advanceSkrigglesRound: () => {},
      publishSkrigglesStrokeBatch: () => {},
      publishSkrigglesCanvasCmd: () => {},
      publishSkrigglesCanvasSnapshot: () => {},
      tickSkrigglesTimers: () => {},
      vcTicTacToeActivity: computed(() => null),
      vcTicTacToePendingInvite: computed(() => null),
      sendVcTicTacToeChallenge: () => {},
      respondVcTicTacToeInvite: () => {},
      dismissVcTicTacToeInvite: () => {},
      requestVcTicTacToeMove: () => {},
      requestVcTicTacToeRematch: () => {},
      vcCodenamesActivity: computed(() => null),
      codenamesRosterUserIds: computed(() => []),
      vcCodenamesSpymasterKey: computed(() => null),
      commitVcCodenamesDeal: () => null,
      requestVcCodenamesSetup: () => {},
      requestVcCodenamesClue: () => {},
      requestVcCodenamesReveal: () => {},
      requestVcCodenamesEndTurn: () => {},
      requestVcCodenamesNewGame: () => {},
      requestVcCodenamesPushKeyToOrchestrator: () => {},
      openVcActivityOpenGuessr: () => {},
      openVcActivitySkribblIo: () => {},
      openVcActivityGarticPhone: () => {},
      openVcActivityKrunker: () => {},
      openVcActivityCodenames: () => {},
      openVcActivityRichup: () => {},
      openVcActivityGooberDash: () => {},
      openVcActivitySmashKarts: () => {},
      openVcActivityClusterRush: () => {},
      setVcActivityYoutubeVideo: () => {},
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
        },
        openVcActivityPicker: () => {},
        openVcActivityYoutubeBrowse: () => {},
        openVcActivityWordle: () => {},
        openVcActivityHangman: () => {},
        openVcActivitySkriggles: () => {},
        openVcActivityTicTacToe: () => {},
        vcHangmanActivity: computed(() => null),
        hangmanRosterUserIds: computed(() => []),
        hangmanGameRoomConnected: computed(() => false),
        hangmanGameRoomLastError: computed(() => null),
        commitVcHangmanWord: () => null,
        requestVcHangmanGuessLetter: () => {},
        requestVcHangmanNextRound: () => {},
        wordlineView: computed(() => null),
        submitWordlineGuess: () => {},
        setWordlineMode: () => {},
        vcSkrigglesActivity: computed(() => null),
        skrigglesRosterUserIds: computed(() => []),
        skrigglesCanvasEvents: ref([]),
        commitSkrigglesWordChoice: () => {},
        submitSkrigglesGuess: () => {},
        updateSkrigglesSettings: () => {},
        startSkrigglesGame: () => {},
        advanceSkrigglesRound: () => {},
        publishSkrigglesStrokeBatch: () => {},
        publishSkrigglesCanvasCmd: () => {},
        publishSkrigglesCanvasSnapshot: () => {},
        tickSkrigglesTimers: () => {},
        vcTicTacToeActivity: computed(() => null),
        vcTicTacToePendingInvite: computed(() => null),
        sendVcTicTacToeChallenge: () => {},
        respondVcTicTacToeInvite: () => {},
        dismissVcTicTacToeInvite: () => {},
        requestVcTicTacToeMove: () => {},
        requestVcTicTacToeRematch: () => {},
        vcCodenamesActivity: computed(() => null),
        codenamesRosterUserIds: computed(() => []),
        vcCodenamesSpymasterKey: computed(() => null),
        commitVcCodenamesDeal: () => null,
        requestVcCodenamesSetup: () => {},
        requestVcCodenamesClue: () => {},
        requestVcCodenamesReveal: () => {},
        requestVcCodenamesEndTurn: () => {},
        requestVcCodenamesNewGame: () => {},
        requestVcCodenamesPushKeyToOrchestrator: () => {},
        openVcActivityOpenGuessr: () => {},
        openVcActivitySkribblIo: () => {},
        openVcActivityGarticPhone: () => {},
        openVcActivityKrunker: () => {},
        openVcActivityCodenames: () => {},
        openVcActivityRichup: () => {},
        openVcActivityGooberDash: () => {},
        openVcActivitySmashKarts: () => {},
        openVcActivityClusterRush: () => {},
        setVcActivityYoutubeVideo: () => {},
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
