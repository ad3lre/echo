import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computed, ref } from 'vue';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  assembleAppLayoutControllerContext,
  type AssembleAppLayoutContextDeps,
} from './assembleAppLayoutControllerContext';
import { emptyWatchTogetherUiFields } from '@/features/voice/vcActivityTypes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WIRE_SRC = readFileSync(
  join(__dirname, 'buildAppLayoutAssemblyDeps.ts'),
  'utf8',
);

const SLICE_FILES = {
  profile: 'useAppLayoutContextProfileSlice.ts',
  voice: 'useAppLayoutContextVoiceSlice.ts',
  messaging: 'useAppLayoutContextMessagingSlice.ts',
  serverRail: 'useAppLayoutContextServerRailSlice.ts',
  shellLayout: 'useAppLayoutContextShellLayoutSlice.ts',
  dm: 'useAppLayoutContextDmSlice.ts',
  moderation: 'useAppLayoutContextModerationSlice.ts',
  shellChrome: 'useAppLayoutContextShellChromeSlice.ts',
} as const;

function parseProfileInputKeys(): Set<string> {
  const src = readFileSync(
    join(__dirname, 'useAppLayoutContextProfileSlice.ts'),
    'utf8',
  );
  const match = src.match(
    /export function useAppLayoutContextProfileSlice\(deps: \{([\s\S]*?)\n\}\)/,
  );
  if (!match) {
    throw new Error('Could not parse profile slice input keys');
  }
  const keys = [...match[1].matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:/gm)].map(
    (m) => m[1],
  );
  return new Set(keys);
}

function expectedWireKeysForSection(
  section: keyof typeof SLICE_FILES,
): Set<string> {
  if (section === 'profile') {
    return parseProfileInputKeys();
  }
  const expected = parseSliceKeysFromFile(SLICE_FILES[section]);
  if (section === 'voice') {
    for (const key of VOICE_HANDLER_KEYS) expected.delete(key);
  }
  if (section === 'serverRail') {
    for (const key of SERVER_CHROME_CALLBACK_KEYS) expected.delete(key);
  }
  if (section === 'dm') {
    expected.delete('dmGroupFriends');
  }
  return expected;
}

function wireKeysForSection(section: keyof typeof SLICE_FILES): Set<string> {
  const { keys } = parseObjectLiteralKeys(extractWireDepsSection(section));
  return keys;
}

function parseSliceKeysFromFile(fileName: string): Set<string> {
  const src = readFileSync(join(__dirname, fileName), 'utf8');
  const match = src.match(/type \w+SliceKeys\s*=\s*([\s\S]*?);/);
  if (!match) {
    throw new Error(`Could not parse SliceKeys from ${fileName}`);
  }
  const keys = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return new Set(keys);
}

function extractWireDepsSection(sectionName: string): string {
  const marker = `${sectionName}: {`;
  const start = WIRE_SRC.indexOf(marker);
  expect(
    start,
    `missing wire deps section: ${sectionName}`,
  ).toBeGreaterThanOrEqual(0);
  let depth = 0;
  const open = WIRE_SRC.indexOf('{', start);
  for (let i = open; i < WIRE_SRC.length; i++) {
    const ch = WIRE_SRC[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return WIRE_SRC.slice(open + 1, i);
      }
    }
  }
  throw new Error(`Unbalanced braces in wire section: ${sectionName}`);
}

function parseObjectLiteralKeys(block: string): {
  keys: Set<string>;
  spreads: Set<string>;
} {
  const keys = new Set<string>();
  const spreads = new Set<string>();
  for (const line of block.split('\n')) {
    const spread = line.match(/^\s+\.\.\.([A-Za-z_$][\w$]*)/);
    if (spread) {
      spreads.add(spread[1]);
      continue;
    }
    const explicit = line.match(/^\s+([A-Za-z_$][\w$]*)\s*:/);
    if (explicit) {
      keys.add(explicit[1]);
      continue;
    }
    const shorthand = line.match(/^\s+([A-Za-z_$][\w$]*)\s*,?\s*$/);
    if (shorthand) {
      keys.add(shorthand[1]);
    }
  }
  return { keys, spreads };
}

const VOICE_HANDLER_KEYS = [
  'updateVcVideoIfAllowed',
  'handleScreenSharePickerConfirm',
  'openDesktopStreamingControl',
  'closeDesktopStreamingControl',
  'handleDesktopStreamingControlConfirm',
  'handleToggleScreenshare',
  'handleStopScreenShare',
] as const;

const SERVER_CHROME_CALLBACK_KEYS = [
  'openServerSettings',
  'openServerSettingsIfAllowed',
  'openInviteModal',
  'onServerSettingsModalUpdate',
  'onServerSettingsModalActiveSectionUpdate',
] as const;

vi.mock('./useAppLayoutVoiceScreenShareHandlers', () => ({
  useAppLayoutVoiceScreenShareHandlers: vi.fn(() => ({
    updateVcVideoIfAllowed: vi.fn(),
    handleScreenSharePickerConfirm: vi.fn(),
    openDesktopStreamingControl: vi.fn(),
    closeDesktopStreamingControl: vi.fn(),
    handleDesktopStreamingControlConfirm: vi.fn(),
    handleToggleScreenshare: vi.fn(),
    handleStopScreenShare: vi.fn(),
  })),
}));

vi.mock('./useAppLayoutServerChromeCallbacks', () => ({
  useAppLayoutServerChromeCallbacks: vi.fn(() => ({
    openServerSettings: vi.fn(),
    openServerSettingsIfAllowed: vi.fn(),
    openInviteModal: vi.fn(),
    onServerSettingsModalUpdate: vi.fn(),
    onServerSettingsModalActiveSectionUpdate: vi.fn(),
  })),
}));

vi.mock('./useAppLayoutDmGroupFriendsComputed', () => ({
  useAppLayoutDmGroupFriendsComputed: vi.fn(() => computed(() => [])),
}));

vi.mock('./usePreviewCanModerateMembersComputed', () => ({
  usePreviewCanModerateMembersComputed: vi.fn(() => computed(() => false)),
}));

function minimalAssembleDeps(): AssembleAppLayoutContextDeps {
  const noop = vi.fn();
  const r = <T>(v: T) => ref(v);
  const c = <T>(v: T) => computed(() => v);

  return {
    profile: {
      openMemberProfile: noop,
      activeMemberNote: c(''),
      expandedProfileNote: c(''),
      updateProfileNote: noop,
      openSelfProfile: noop,
      openExpandedProfileFromMemberPopout: noop,
      openExpandedProfileFromSelfPopout: noop,
      openExpandedProfilePanelForUserId: noop,
      openExtendedProfileModalForUserId: noop,
      expandDmProfileToFullModal: noop,
      handleExpandedProfileOpenProfile: noop,
      handleExpandedProfileOpenDM: noop,
      handleMemberPopoutQuickDm: noop,
      handleExpandedProfileRemoveFriend: noop,
      handleExpandedProfileCancelOutgoingFriendRequest: noop,
      handleProfileBlockUser: noop,
      handleProfileUnblockUser: noop,
      handleProfileReportUser: noop,
      isExpandedProfileTargetBlocked: c(false),
      isExpandedProfileOutgoingRequest: c(false),
      isMemberPopoutTargetBlocked: c(false),
      isExpandedProfileFriend: c(false),
      isMemberPopoutFriend: c(false),
      isMemberPopoutCanSendFriendRequest: c(false),
      memberListUsers: c([]),
      serverSettingsMemberUsers: c([]),
      usersForChannelPanel: c([]),
      usersForMentionAutocomplete: c([]),
      rolesForMentionAutocomplete: c([]),
      onExpandedProfileModalUpdate: noop,
      expandedProfile: r(null),
      selectDmUser: noop,
      selectDMTab: noop,
      sendFriendRequest: noop,
      memberPopoutOpenRolesPanel: r(false),
      isSystemSettingsOpen: r(false),
      isUserSettingsOpen: r(false),
      memberListCollapsed: r(false),
      memberListWidth: r(240),
      activeMemberProfile: r(null),
      membersForMemberList: c([]),
      toggleMemberList: noop,
    },
    voiceScreenShare: {
      vcVideo: r(false),
      vcScreenshare: r(false),
      isScreenSharePickerOpen: r(false),
      isDesktopStreamingControlOpen: r(false),
      desktopStreamingControlMode: r('screen' as const),
      desktopStreamingPreferences: r({
        screenQuality: '720p30',
        screenContentHint: 'detail',
        screenIncludeAudio: true,
        cameraQuality: '720p',
      }),
      setDesktopStreamingPreferences: noop,
      startVcScreenShare: noop,
      startDesktopScreenShare: noop,
      startDesktopCameraStream: noop,
      onDesktopCameraStarted: noop,
      stopVcScreenShare: noop,
    },
    voice: {
      getVcActivityPresenceForUser: () => [],
      getVcChannelActivityPresenceForChannel: () => [],
      effectiveVcActivityKingUserId: c(''),
      vcHangmanActivity: c(null),
      hangmanRosterUserIds: c([]),
      vcSkrigglesActivity: c(null),
      skrigglesRosterUserIds: c([]),
      skrigglesCanvasEvents: r([]),
      vcCodenamesActivity: c(null),
      codenamesRosterUserIds: c([]),
      vcCodenamesSpymasterKey: c(null),
      commitVcHangmanWord: () => null,
      requestVcHangmanGuessLetter: noop,
      requestVcHangmanNextRound: noop,
      wordlineView: c(null),
      submitWordlineGuess: noop,
      setWordlineMode: noop,
      commitSkrigglesWordChoice: noop,
      submitSkrigglesGuess: noop,
      updateSkrigglesSettings: noop,
      startSkrigglesGame: noop,
      advanceSkrigglesRound: noop,
      publishSkrigglesStrokeBatch: noop,
      publishSkrigglesCanvasCmd: noop,
      publishSkrigglesCanvasSnapshot: noop,
      tickSkrigglesTimers: noop,
      vcTicTacToeActivity: c(null),
      vcTicTacToePendingInvite: c(null),
      sendVcTicTacToeChallenge: noop,
      respondVcTicTacToeInvite: noop,
      dismissVcTicTacToeInvite: noop,
      requestVcTicTacToeMove: noop,
      requestVcTicTacToeRematch: noop,
      commitVcCodenamesDeal: noop,
      requestVcCodenamesSetup: noop,
      requestVcCodenamesClue: noop,
      requestVcCodenamesReveal: noop,
      requestVcCodenamesEndTurn: noop,
      requestVcCodenamesNewGame: noop,
      requestVcCodenamesPushKeyToOrchestrator: noop,
      activeVoiceChannelParticipants: r([]),
      liveKitState: c('idle'),
      liveKitNetworkStats: c(null),
      liveKitRoom: null,
      vcRemoteParticipants: r([]),
      vcMirrorCamera: r(false),
      switchVcCamera: noop,
      setVcVideoQuality: noop,
      speakingMap: c({}),
      localSpeaking: c(false),
      localAudioLevel: c(0),
      switchMicDevice: noop,
      switchSpeakerDevice: noop,
      setLkOutputVolume: noop,
      reapplyVoiceProcessing: noop,
      setMicTestListenDeafen: noop,
      currentVoiceChannelId: r(''),
      currentVoiceChannelName: r(''),
      dmCallDeafened: r(false),
      dmCallFullscreen: r(false),
      dmCallMuted: r(false),
      dmCallQuarterView: r(false),
      dmCallMatchesActiveChannel: r(true),
      activeDmThreadCallUi: c(null),
      dmCallVideo: r(false),
      dmCallScreenshare: r(false),
      dmCallCallViewParticipants: c([]),
      dmCallWithUserId: r(null),
      dmCallRinging: r(false),
      dmCallAwaitingAccept: r(false),
      dmCallIncoming: r(null),
      dmCallRingRemoteVanishing: r(false),
      dmCallGlassPeer: c(null),
      dmCallVoiceStripThreadId: c(null),
      dmCallVoiceStripTitle: c(''),
      channelPanelVoiceChannelId: c(''),
      channelPanelVoiceChannelName: c(''),
      channelPanelVcMutedEffective: c(false),
      channelPanelVcDeafenedEffective: c(false),
      channelPanelVcVideoEffective: c(false),
      channelPanelVcScreenshareEffective: c(false),
      onChannelPanelVcMuted: noop,
      onChannelPanelVcDeafened: noop,
      onChannelPanelVcVideo: noop,
      onChannelPanelVcScreenshare: noop,
      onGuildChannelVcMuted: noop,
      onGuildChannelVcDeafened: noop,
      onGuildChannelVcVideo: noop,
      onGuildChannelVcScreenshare: noop,
      onDmCallVcMuted: noop,
      onDmCallVcDeafened: noop,
      onDmCallVcVideo: noop,
      onDmCallVcScreenshare: noop,
      applyDmCallDeafened: noop,
      toggleDmCallMuted: noop,
      handleJoinVoice: noop,
      handleJoinVoiceIfAllowed: noop,
      handleLeaveVoice: noop,
      handleChannelVoicePanelLeave: noop,
      onJoinVoice: noop,
      onJoinVoiceUi: noop,
      onLeaveVoice: noop,
      onLeaveVoiceUi: noop,
      onVcChatButtonClick: noop,
      isViewingVoiceChannel: c(false),
      isScreenSharePickerOpen: r(false),
      isDesktopStreamingControlOpen: r(false),
      desktopStreamingControlMode: r('screen' as const),
      desktopStreamingPreferences: r({
        screenQuality: '720p30',
        screenContentHint: 'detail',
        screenIncludeAudio: true,
        cameraQuality: '720p',
      }),
      fullscreenStreamParticipantId: r(null),
      vcActivityUi: r({
        phase: 'closed' as const,
        youtubeVideoId: null,
        youtubeBrowseOpen: true,
        playlist: [],
        currentIndex: 0,
        ...emptyWatchTogetherUiFields(),
      }),
      openVcActivityPicker: noop,
      openVcActivityYoutubeBrowse: noop,
      openVcActivityWatchTogether: noop,
      openVcActivityWordle: noop,
      openVcActivityHangman: noop,
      openVcActivitySkriggles: noop,
      openVcActivityTicTacToe: noop,
      openVcActivityOpenGuessr: noop,
      openVcActivitySkribblIo: noop,
      openVcActivityGarticPhone: noop,
      openVcActivityKrunker: noop,
      openVcActivityCodenames: noop,
      openVcActivityRichup: noop,
      openVcActivityGooberDash: noop,
      openVcActivitySmashKarts: noop,
      openVcActivityClusterRush: noop,
      setVcActivityYoutubeVideo: noop,
      setVcYoutubeBrowseOpen: noop,
      addVcYoutubeToQueue: noop,
      removeVcYoutubeFromQueue: noop,
      moveVcYoutubeInQueue: noop,
      playVcYoutubeAtIndex: noop,
      playVcYoutubeNext: noop,
      playVcYoutubePrevious: noop,
      setWatchTogetherLobbyRole: noop,
      ensureWatchTogetherSessionId: () => 'sess-test',
      patchWatchTogetherUi: noop,
      setWatchTogetherBrowseOpen: noop,
      startWatchTogetherSession: noop,
      playWatchTogetherAtIndex: noop,
      closeVcActivity: noop,
      vcYoutubeRemotePlayback: r(null),
      publishVcYoutubePlaybackSync: noop,
      vcYoutubePlaybackShouldPublish: c(true),
      vcWatchTogetherRemotePlayback: r(null),
      publishVcWatchTogetherPlaybackSync: noop,
      vcWatchTogetherPlaybackShouldPublish: c(true),
      getLocalScreenTrack: noop,
      getLocalCameraTrack: noop,
      getRemoteParticipantVolume: () => 100,
      setRemoteParticipantVolume: noop,
      vcDeafened: r(false),
      applyVcDeafened: noop,
      vcMuted: r(false),
      vcScreenshare: r(false),
      vcVideo: r(false),
      isVcActive: c(false),
      isVcConnected: c(false),
      isVcConnecting: c(false),
      isVcDisconnecting: c(false),
      joinVoiceChannel: noop,
      leaveVoiceChannel: noop,
    },
    messaging: {
      handleGoToChannel: noop,
      handleGoToMessage: noop,
      handlePollVote: noop,
      handleReact: noop,
      pinMessage: noop,
      toggleReaction: noop,
      votePoll: noop,
      recordReaction: noop,
      removeReactionFavorite: noop,
      topReactions: c([]),
      goToPinnedMessage: noop,
      goToSearchPage: noop,
      searchError: r(''),
      searchLoading: r(false),
      searchResultMessages: c([]),
      searchResultPage: r(1),
      searchScopeHint: c(''),
      searchText: r(''),
      paginatedSearchResults: c([]),
      totalPages: c(1),
      onSearchInput: noop,
      clearSearch: noop,
      forwardModalOpen: r(false),
      forwardPickerDestinations: c([]),
      forwardModalSourceSummary: c(null),
      openForwardMessagePicker: noop,
      closeForwardMessagePicker: noop,
      submitForwardedMessage: noop,
      socketSendMessage: noop,
      sendMessage: noop,
      searchActiveTab: r('all'),
      searchFilter: r({}),
      searchIsLoading: r(false),
      searchResults: r([]),
      searchStatus: r('idle'),
    },
    serverChromeCallbacks: {
      isServerSettingsModalOpen: r(false),
      serverSettingsModalInitialSection: r(null),
      serverSettingsModalActiveSection: r(null),
      isInviteModalOpen: r(false),
      clearInviteVoiceContext: noop,
      canOpenInviteForServer: () => true,
    },
    serverRail: {
      handleServerRailInvite: noop,
      handleServerRailMarkRead: noop,
      handleServerRailMarkAllRead: noop,
      handleDmRailMarkAllRead: noop,
      handleChannelMarkRead: noop,
      handleServerRailLeave: noop,
      handleServerRailNotificationSettings: noop,
      handleServerRailSettings: noop,
      openServerFromMore: noop,
      openServerSettingsFromUrl: noop,
      selectedServerId: c('s1'),
      servers: c([]),
      onLeaveServerModalUpdate: noop,
      confirmLeaveServerFromModal: noop,
      isLeaveServerModalOpen: r(false),
      leaveServerModalServerName: r(''),
      leaveServerModalVariant: r('confirm'),
      openServerNotificationSettings: noop,
      handleServerNotificationSave: noop,
      serverNotificationLevelsMap: c({}),
      serverPingKindByServerId: c({}),
      serverPingBubbleByServerId: c({}),
      serverPingChannelDotsByServerId: c({}),
      serverUnreadActivityDotByServerId: c({}),
      channelMissedActivityByChannelId: c({}),
      currentServerNotificationLevel: c(null),
      isServerNotificationSettingsOpen: r(false),
      canDeleteCurrentServer: c(false),
      canOpenServerSettings: c(false),
      canOpenServerSettingsForServer: () => false,
      canOpenInviteForServer: () => true,
      reorderVisibleServers: noop,
      syncVanityAcrossServerLists: noop,
      isServerUnread: () => false,
      onOpenCreateChannel: noop,
      hasGuildChannelChrome: c(true),
    },
    shellLayout: {
      toggleChannelPanel: noop,
      openDMPanel: noop,
    },
    dmGroupFriendsInput: {
      currentUserId: 'u1',
      users: r({}),
      friendIds: r([]),
    },
    dm: {
      echoDmPeerByChannelId: r(new Map()),
      echoDmThreadIds: r(new Set()),
      echoBlockedUserIds: r(new Set()),
      dmIncomingRailCluster: c({
        avatars: [],
        overflowCount: 0,
        totalUnreadCount: 0,
      }),
      selectMessageRequest: noop,
      ignoreMessageRequest: noop,
      returnFromMessageRequests: noop,
      acceptFriendRequest: noop,
      declineFriendRequest: noop,
      cancelFriendRequest: noop,
      sendFriendRequest: noop,
      handleDmMarkRead: noop,
      hideDmFromInboxUser: noop,
      hideDmFromInboxGroup: noop,
      isDmInboxUserFavorite: () => false,
      isDmInboxGroupFavorite: () => false,
      toggleFavoriteDmInbox: noop,
      handleAcceptMessageRequest: noop,
      dmInboxEntriesForPanel: c([]),
      dmUsersForDmPanel: c([]),
      groupDMListForPanel: c([]),
      isEchoUserFriend: () => false,
      isEchoUserIncomingFriendRequest: () => false,
      isEchoUserOutgoingFriendRequest: () => false,
      selectIncomingDmFromRail: noop,
      selectIncomingGroupDmFromRail: noop,
      openDmInboxFromRailOverflow: noop,
      groupDMs: r({}),
      groupDMPreselectedIds: r([]),
      groupDMLockedIds: r([]),
      groupDmMaxMembers: c(10),
      dmActiveTab: r('inbox'),
      dmPanelWidth: r(240),
      startDmPanelResize: noop,
      dmPartnerUser: c(null),
      guestFriendsLocked: c(false),
      handleCreateGroupDM: noop,
      handleKickGroupDmMember: noop,
      handleLeaveGroupDm: noop,
      onRemoveGroupDmMember: noop,
      onLeaveGroupDm: noop,
      onOpenAddMembersToGroupDm: noop,
      handleSelectGroupDM: noop,
      handleUpdateGroupFromSettings: noop,
      openGroupDMModal: noop,
      openGroupOverviewPanel: noop,
      openGroupSettingsFromHeader: noop,
      groupSettingsMembers: c([]),
      groupSettingsId: r(null),
      isGroupDM: c(false),
      isGroupDMModalOpen: r(false),
      isGroupDMSettingsOpen: r(false),
      groupDmSettingsInitialFocus: r(null),
      activeGroupSettingsId: r(null),
      isGroupOverviewOpen: r(false),
    },
    moderation: {
      canModerateMemberInServer: () => false,
      canVcModerateMember: () => false,
      canModerateMemberActionInServer: () => false,
      canChangeMemberNicknameInServer: () => false,
      canModerateMessageAuthor: () => false,
      moderationModalOpen: r(false),
      moderationAction: r(null),
      moderationTargetUserId: r(null),
      moderationTargetUser: c(null),
      handleModerateUser: noop,
      onModerationModalConfirm: noop,
      handleVcModerate: noop,
    },
    shellChrome: {
      ExploreView: null,
      MORE_SERVERS_PANEL_WIDTH: 300,
      MORE_SERVERS_COMPACT_WIDTH: 72,
      DM_PANEL_WIDTH: 240,
      appGridTemplateColumns: c(''),
      expandChannels: noop,
      exploreDiscoverableServers: r([]),
      isExploreView: c(false),
      welcomeBackExploreGate: c(false),
      welcomeBackExploreMemberEmptyDirectory: c(false),
      showWelcomeBackSlimBanner: c(false),
      inviteLandingActive: c(false),
      inviteLandingPreview: c(null),
      inviteLandingLoading: c(false),
      inviteLandingError: c(null),
      inviteLandingPersistBeforeOAuth: noop,
      showNsfwChatGate: c(false),
      acknowledgeNsfwChannel: noop,
      declineNsfwGate: noop,
      mainContentColumns: c(''),
      mainContentColumnsEffective: c(''),
      addServerInitialView: r('initial'),
      addServerJoinError: r(''),
      addServerCreateBusy: r(false),
      addServerJoinBusy: r(false),
      addServerJoinInvitePrefill: r(''),
      exploreDirectoryJoinBusy: r(false),
      joinEchoServerWithInviteRaw: noop,
      handleJoinWithInviteLink: noop,
      handleCreateServer: noop,
      handleJoinDiscoverableServer: noop,
      isServerEmptyOnboarding: c(false),
      isJoinServerConfirmModalOpen: r(false),
      joinServerConfirmPreview: r(null),
      joinServerConfirmBusy: r(false),
      confirmJoinServerFromModal: noop,
      onJoinServerConfirmModalUpdate: noop,
      isServerApplicationModalOpen: r(false),
      serverApplicationPayload: r(null),
      serverApplicationBusy: r(false),
      onServerApplicationModalUpdate: noop,
      confirmServerApplicationSubmittedFromModal: noop,
    },
    previewCanModerateMembers: {
      previewCanModerateMembers: () => false,
    },
    core: {
      authSession: { isAuthenticated: false } as any,
      activeChannelId: r('ch-1'),
      submitReactionToggle: noop,
      customStatus: r(''),
      isGuest: c(false),
      hydrateEchoFromApi: noop,
      refreshEchoSocialFromApi: noop,
      workspaceReady: c(true),
      currentUser: c(null),
      expandedProfile: r(null),
      effectiveActiveChannel: c(null),
      activeChannel: c(null),
      activeChannelContext: c(null),
      activeChannelMessages: c([]),
      activeChannelMessagesMap: c(new Map()),
      activeGroupDM: c(null),
      activeMemberProfile: r(null),
      activeRailTab: r('servers'),
      addFilter: noop,
      allChannels: c([]),
      applyEchoPresenceFromSocket: noop,
      authModalInitialLoginEntry: r(null),
      authModalPasskeyOnOpen: noop,
      authModalInitialTab: r('login'),
      authModalInitialSubView: r(null),
      callOverlay: c(null),
      canCreateChannels: c(false),
      canManageThisChannel: c(false),
      canInviteToCurrentServer: c(false),
      canJoinPreviewVoiceChannel: c(false),
      categoriesForServer: c([]),
      categorySettingsTarget: r(null),
      categorySettingsEchoPermissionEditor: r(null),
      channelPanelCollapsed: r(false),
      channelPanelBubbleMode: r(false),
      channelPanelWidth: r(240),
      channelSettingsCategoryPermissionDefaults: r(null),
      channelSettingsCategoryAutoDeleteAfterSeconds: r(null),
      channelSettingsEchoPermissionEditor: r(null),
      channelSettingsTarget: r(null),
      clearRolePreview: noop,
      closeDMPanel: noop,
      closePinsDropdown: noop,
      createChannelCategoryNames: c([]),
      createChannelCategoryOptions: c([]),
      createChannelInitialCategoryId: r(null),
      deleteMessage: noop,
      deleteMessageCore: noop,
      echoChannelHistory: null,
      echoWorkspaceError: r(null),
      editMessage: noop,
      fillImageSlot: noop,
      endDmCall: noop,
      leaveDmCallVoice: noop,
      rejoinDmCallVoice: noop,
      answerDmCall: noop,
      declineDmCall: noop,
      dmCallRingUi: c(null),
      dmCallLobbyAfterSelfLeave: r(false),
      compactPagerPane: r('channels'),
      compactGuildTriPaneChannelPanelOpen: r(true),
      guildMobileVcLobby: c(null),
      openGuildMobileVcLobby: noop,
      closeGuildMobileVcLobby: noop,
      collapseMembers: noop,
      expandMembers: noop,
      expandVoiceSideChat: noop,
      filterChips: c([]),
      findChannelContextById: () => null,
      getChannelDisplayName: () => '',
      getChannelIcon: () => null,
      getFirstTextChannelId: () => null,
      getLatestDMUserId: () => null,
      getServerChannelInfoForMainSurface: () => null,
      handleActiveChannelChange: noop,
      handleChangeMemberNicknameFromMemberList: noop,
      handleCategoryDelete: noop,
      handleCategoryReorder: noop,
      handleCategorySettingsSave: noop,
      handleChannelDelete: noop,
      handleChannelReorder: noop,
      handleChannelSettingsSave: noop,
      deleteChannelById: noop,
      deleteCategoryById: noop,
      handleCreateCategorySubmit: noop,
      handleCreateChannelModalSubmit: noop,
      handleCreateChannelSubmit: noop,
      handleExpandedProfileOpenServer: noop,
      handleExpandedProfileAcceptIncomingFriendRequest: noop,
      handleExpandedProfileDeclineIncomingFriendRequest: noop,
      appActionRegistry: {} as any,
      appLayoutActions: {} as any,
      chatMessageNavBridge: {} as any,
      handleInviteFriend: noop,
      handlePinMessage: noop,
      handleServerDeleted: noop,
      handleStartRolePreview: noop,
      handleUnpinMessage: noop,
      handleUpdateCustomStatus: noop,
      icons: {} as any,
      inviteLinkForServer: () => null,
      inviteLinkFromApi: r(null),
      inviteLinkLookupPending: r(false),
      inviteLinkFromSelectedServer: r(null),
      inviteApplicationsEnabled: c(false),
      inviteJoinLinksEnabled: c(false),
      inviteCanCreateDirectHexInvite: c(false),
      directHexInviteLink: r(null),
      directHexInviteBusy: r(false),
      createDirectHexInvite: noop,
      inviteableFriends: c([]),
      isAddServerModalOpen: r(false),
      isInviteModalOpen: r(false),
      inviteModalVoiceChannelId: r(null),
      inviteModalVoiceChannelName: r(null),
      isAuthModalOpen: r(false),
      isAuthenticated: c(false),
      isChannelActive: () => false,
      isCompactShell: c(false),
      isCompactGuildSplitShell: c(false),
      isCreateCategoryModalOpen: r(false),
      isCreateChannelModalOpen: r(false),
      isDmUiContext: c(false),
      isDMPanelOpen: r(false),
      isEchoGraphId: () => false,
      isEchoUserBlocked: () => false,
      isExpandedProfileModalOpen: r(false),
      isExpandedProfileSidePanel: r(false),
      isGuestCaptchaModalOpen: r(false),
      isGuestDisplayNameModalOpen: r(false),
      isGuestWelcomePrefsModalOpen: r(false),
      isGuestUpgradeModalOpen: r(false),
      isInDMChat: c(false),
      isInDMMode: c(false),
      isMemberPopoutOpen: r(false),
      isMemberProfileOpen: c(false),
      isMoreServersCompact: r(false),
      isMoreServersPanelOpen: r(false),
      isMoreServersPinned: r(false),
      isChannelPanelSwitchLoading: c(false),
      isGuildShellSettling: c(false),
      isMessageSurfaceSwitchLoading: c(false),
      isMemberSurfaceSwitchLoading: c(false),
      isEchoRoleBootstrapLoading: c(false),
      isPinsDropdownOpen: r(false),
      isRolePreviewActiveForServer: () => false,
      isSearchActive: c(false),
      isSelfProfilePopoutOpen: r(false),
      isServerSettingsModalOpen: r(false),
      isSettingsModalOpen: r(false),
      settingsModalInitialSection: r(null),
      settingsModalActiveSection: r(null),
      serverSettingsModalInitialSection: r(null),
      serverSettingsModalActiveSection: r(null),
      mainSurface: r('server'),
      markActiveChannelAsRead: noop,
      memberListResolveHighestRole: () => null,
      memberListRoleManagement: {} as any,
      memberPopoutOpenRolesPanel: r(false),
      memberPanelCollapsed: r(false),
      memberListShowGuests: r(false),
      memberPanelAutoCollapseUserOverride: r(false),
      markMemberPanelExpandedByUser: noop,
      markMemberPanelCollapsedByUser: noop,
      memberPanelCollapsedEffective: c(false),
      memberPanelWidth: r(240),
      memberPopoutAnchor: r(null),
      workspace: {} as any,
      presenceByUserId: r({}),
      presenceMobileByUserId: r({}),
      newlyCreatedServerId: r(null),
      onCategorySettingsModalOpenUpdate: noop,
      onChannelSettingsModalOpenUpdate: noop,
      continueAsGuest: noop,
      onMemberPopoutOpenUpdate: noop,
      onGuestAccountUpgraded: noop,
      onGuestCaptchaVerified: noop,
      onUserSettingsModalUpdate: noop,
      onSettingsModalActiveSectionUpdate: noop,
      openCategorySettings: noop,
      openChannelSettings: noop,
      openCreateCategoryModal: noop,
      openCreateChannelModal: noop,
      openGuestUpgradeModal: noop,
      openServerSurface: noop,
      openUserSettingsModal: noop,
      openAddServerModal: noop,
      openAuthModal: noop,
      openUserSettingsToDiscordFromAddServer: noop,
      pfpBarExpanded: r(false),
      pinPreview: r(null),
      pinnedMessageIdsForCurrentChannel: c([]),
      pinnedMessagesForDropdown: c([]),
      pinsButtonRefDm: r(null),
      pinsButtonRefServer: r(null),
      pinsDropdownRect: r(null),
      previewHasUiPermission: () => false,
      profileNotes: r({}),
      rawCategoriesForServer: c([]),
      refreshEchoRoleData: noop,
      removeFilter: noop,
      resetChannelWidth: noop,
      resetDmPanelWidth: noop,
      resetMemberWidth: noop,
      resetVoiceSideChatWidth: noop,
      resolvePreviewChannelPermission: () => false,
      rolePreview: r(null),
      selectDM: noop,
      selectDMTab: noop,
      selectExploreTab: noop,
      selectServersTab: noop,
      selectServersRailOnly: noop,
      selectedDMUserId: r(null),
      selectedMessageRequestId: r(null),
      dmMentionNotifications: c([]),
      mentionNotificationHydrationLoading: c(false),
      resolveDmMentionNotificationChannelLabel: () => '',
      resolveDmMentionNotificationAuthorName: () => '',
      resolveDmMentionNotificationRowPreview: () => '',
      dmNotificationReadStateByChannelId: c({}),
      mentionNotificationCategoriesByServer: c({}),
      mentionNotificationServers: c([]),
      dmNotificationsReadPreset: r('all'),
      dmNotificationsSourceKey: r(''),
      onOpenMentionNotification: noop,
      onMarkMentionNotificationRead: noop,
      selectedServer: c(null),
      selfProfile: r(null),
      selfProfileAnchor: r(null),
      serverSettingsCanManageRoles: c(false),
      serverSettingsCanManageServer: c(false),
      serverStore: {} as any,
      sessionEndedMessage: r(null),
      discordBotExportReadyBanner: c(null),
      dismissDiscordBotExportReadyBanner: noop,
      shellNavState: r({}),
      startChannelResize: noop,
      startDmCall: noop,
      startDmCallWithUserId: noop,
      startGroupCall: noop,
      startGroupCallWithId: noop,
      startRolePreview: noop,
      startVoiceSideChatResize: noop,
      toggleMoreServersPanel: noop,
      togglePinsDropdown: noop,
      toggleVoiceSideChat: noop,
      toggleChannelPanelBubbleMode: noop,
      voiceMobileSheetLevel: r(0),
      bumpVoiceMobileChatFromCallScrollUp: noop,
      bumpVoiceMobileChatFromCallScrollDown: noop,
      narrowChannelPanelForActivityOverflowStep: noop,
      unpinMessage: noop,
      updateCurrentUserStatus: noop,
      voiceSideChatCollapsed: r(false),
      voiceSideChatWidth: r(240),
      watchActiveChannelWithServerChange: noop,
      isPersistedEchoDmThread: () => false,
      onEchoMessageFailedGuest: noop,
      dispatchNav: noop,
      echoCapabilitiesForServerId: () => null,
      liveChannelCapabilities: c(null),
      guestCaptchaSiteKey: r(''),
      submitPollVote: noop,
      submitPin: noop,
      submitUnpin: noop,
      submitMessageEdit: noop,
      submitMessageDelete: noop,
      showApiFetchErrorBanner: noop,
      linkedDiscordUserId: r(null),
      linkedDiscordState: r(null),
      activeGroupCallMembers: c([]),
      echoRoleCatalog: c([]),
    } as unknown as AssembleAppLayoutContextDeps['core'],
  } as unknown as AssembleAppLayoutContextDeps;
}

describe('assembleAppLayoutControllerContext parity', () => {
  for (const [section, fileName] of Object.entries(SLICE_FILES)) {
    it(`wire ${section} deps include every ${section} slice key`, () => {
      const expected = expectedWireKeysForSection(
        section as keyof typeof SLICE_FILES,
      );
      const keys = wireKeysForSection(section as keyof typeof SLICE_FILES);
      const missing = [...expected].filter((k) => !keys.has(k));
      expect(missing, `missing ${section} keys in wire deps`).toEqual([]);
    });
  }

  it('wire voice deps omit handler fields injected in assemble', () => {
    const { keys } = parseObjectLiteralKeys(extractWireDepsSection('voice'));
    for (const key of VOICE_HANDLER_KEYS) {
      expect(keys.has(key), `voice bag should not include ${key}`).toBe(false);
    }
    expect(keys.has('activeDmThreadCallUi')).toBe(true);
  });

  it('wire dm deps omit dmGroupFriends injected in assemble', () => {
    const { keys } = parseObjectLiteralKeys(extractWireDepsSection('dm'));
    expect(keys.has('dmGroupFriends')).toBe(false);
  });

  it('wire serverRail deps omit server chrome callback fields', () => {
    const { keys } = parseObjectLiteralKeys(
      extractWireDepsSection('serverRail'),
    );
    for (const key of SERVER_CHROME_CALLBACK_KEYS) {
      expect(keys.has(key), `serverRail bag should not include ${key}`).toBe(
        false,
      );
    }
  });

  it('wire core deps omit previewCanModerateMembers injected in assemble', () => {
    const { keys } = parseObjectLiteralKeys(extractWireDepsSection('core'));
    expect(keys.has('previewCanModerateMembers')).toBe(false);
    expect(keys.has('authSession')).toBe(true);
    expect(keys.has('activeChannelId')).toBe(true);
    expect(keys.has('submitReactionToggle')).toBe(true);
  });

  it('binds static shell helpers from module imports, not optional wire passthrough', () => {
    expect(WIRE_SRC).toContain(
      "import { isEchoGraphId } from '@/utils/echoIds'",
    );
    expect(WIRE_SRC).toContain(
      "import { icons, getChannelDisplayName } from '@/assets/icons'",
    );
    expect(WIRE_SRC).not.toContain('isEchoGraphId: $.isEchoGraphId');
    expect(WIRE_SRC).not.toContain('icons: $.icons');
    expect(WIRE_SRC).not.toContain(
      'getChannelDisplayName: $.getChannelDisplayName',
    );
  });

  it('wire shellChrome deps include add-server and invite landing fields', () => {
    const { keys } = parseObjectLiteralKeys(
      extractWireDepsSection('shellChrome'),
    );
    expect(keys.has('addServerCreateBusy')).toBe(true);
    expect(keys.has('addServerJoinBusy')).toBe(true);
    expect(keys.has('inviteLandingActive')).toBe(true);
    expect(keys.has('inviteLandingPreview')).toBe(true);
  });

  describe('handler re-injection', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('merges voice screen-share handlers into voice slice', async () => {
      const { useAppLayoutVoiceScreenShareHandlers } =
        await import('./useAppLayoutVoiceScreenShareHandlers');
      const handlers = {
        updateVcVideoIfAllowed: vi.fn(),
        handleScreenSharePickerConfirm: vi.fn(),
        openDesktopStreamingControl: vi.fn(),
        closeDesktopStreamingControl: vi.fn(),
        handleDesktopStreamingControlConfirm: vi.fn(),
        handleToggleScreenshare: vi.fn(),
        handleStopScreenShare: vi.fn(),
      };
      vi.mocked(useAppLayoutVoiceScreenShareHandlers).mockReturnValue(
        handlers as any,
      );

      const ctx = assembleAppLayoutControllerContext(minimalAssembleDeps());
      expect(ctx.updateVcVideoIfAllowed).toBe(handlers.updateVcVideoIfAllowed);
      expect(ctx.handleToggleScreenshare).toBe(
        handlers.handleToggleScreenshare,
      );
      expect(useAppLayoutVoiceScreenShareHandlers).toHaveBeenCalledOnce();
    });

    it('injects previewCanModerateMembers computed into core', async () => {
      const { usePreviewCanModerateMembersComputed } =
        await import('./usePreviewCanModerateMembersComputed');
      const preview = computed(() => true);
      vi.mocked(usePreviewCanModerateMembersComputed).mockReturnValue(
        preview as any,
      );

      const ctx = assembleAppLayoutControllerContext(minimalAssembleDeps());
      expect(ctx.previewCanModerateMembers).toBe(preview);
    });

    it('injects dmGroupFriends from computed helper', async () => {
      const { useAppLayoutDmGroupFriendsComputed } =
        await import('./useAppLayoutDmGroupFriendsComputed');
      const friends = computed(() => [{ id: 'f1' }]);
      vi.mocked(useAppLayoutDmGroupFriendsComputed).mockReturnValue(
        friends as any,
      );

      const ctx = assembleAppLayoutControllerContext(minimalAssembleDeps());
      expect(ctx.dmGroupFriends).toBe(friends);
    });

    it('spreads server chrome callbacks into server rail slice', async () => {
      const { useAppLayoutServerChromeCallbacks } =
        await import('./useAppLayoutServerChromeCallbacks');
      const callbacks = {
        openServerSettings: vi.fn(),
        openServerSettingsIfAllowed: vi.fn(),
        openInviteModal: vi.fn(),
        onServerSettingsModalUpdate: vi.fn(),
        onServerSettingsModalActiveSectionUpdate: vi.fn(),
      };
      vi.mocked(useAppLayoutServerChromeCallbacks).mockReturnValue(callbacks);

      const ctx = assembleAppLayoutControllerContext(minimalAssembleDeps());
      expect(ctx.openServerSettings).toBe(callbacks.openServerSettings);
      expect(ctx.openInviteModal).toBe(callbacks.openInviteModal);
    });
  });

  it('merge output includes representative keys from each slice region and core', () => {
    const ctx = assembleAppLayoutControllerContext(minimalAssembleDeps());
    expect(ctx.toggleMemberList).toBeTypeOf('function');
    expect(ctx.handleJoinVoice).toBeTypeOf('function');
    expect(ctx.sendMessage).toBeTypeOf('function');
    expect(ctx.handleServerRailInvite).toBeTypeOf('function');
    expect(ctx.toggleChannelPanel).toBeTypeOf('function');
    expect(ctx.sendFriendRequest).toBeTypeOf('function');
    expect(ctx.handleModerateUser).toBeTypeOf('function');
    expect(ctx.expandChannels).toBeTypeOf('function');
    expect(ctx.authSession).toBeTruthy();
    expect(ctx.activeChannelId).toBeTruthy();
    expect(ctx.submitReactionToggle).toBeTypeOf('function');
  });
});
