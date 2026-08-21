import type { Ref } from 'vue';
import type { LiveKitVoiceRoomApi } from '@/features/voice/livekitVoiceRoom.types';
import type { MainSurface, RailTab } from '@/features/layout/mainSurface';
import type { WireAppLayoutDmAndShellResult } from '../controller/wireAppLayoutDmAndShell';
import { useAppLayoutMainSurfaceDmFlags } from '../dm/useAppLayoutMainSurfaceDmFlags';
import { useAppLayoutVoiceContextExpose } from './useAppLayoutVoiceContextExpose';

type CallVoiceBag = WireAppLayoutDmAndShellResult['callVoice'];

const DEFAULT_REMOTE_VOLUME_PERCENT = 100;

type FindChannelContext = (channelId: string | null | undefined) => {
  channel?: { name?: string };
} | null;

export type UseAppLayoutCallVoiceLayoutBindingsExtras = {
  findChannelContextById: FindChannelContext;
  mainSurface: Ref<MainSurface>;
  activeRailTab: Ref<RailTab>;
};

/** Layout fallback when LiveKit is not bound yet. */
export function createLiveKitRemoteVolumeControls(
  getApi: () => LiveKitVoiceRoomApi | null | undefined,
) {
  function getRemoteParticipantVolume(userId: string): number {
    return (
      getApi()?.getRemoteParticipantVolume(userId) ??
      DEFAULT_REMOTE_VOLUME_PERCENT
    );
  }
  function setRemoteParticipantVolume(
    userId: string,
    volumePercent: number,
  ): void {
    getApi()?.setRemoteParticipantVolume(userId, volumePercent);
  }
  return { getRemoteParticipantVolume, setRemoteParticipantVolume };
}

function pickCallVoiceDmCallFields(v: CallVoiceBag) {
  return {
    _dmCallInviteSentChannelId: v.dmCallInviteSentChannelId,
    _dmCallMutedBeforeDeafen: v.dmCallMutedBeforeDeafen,
    _dmCallSignal: v.dmCallSignal,
    _dmLiveKitJoinChannelId: v.dmLiveKitJoinChannelId,
    _dmVoiceJoinTargetId: v.dmVoiceJoinTargetId,
    _isDmVoiceCallUi: v.isDmVoiceCallUi,
    activeDmThreadCallUi: v.activeDmThreadCallUi,
    activeGroupCallMembersVisible: v.activeGroupCallMembersVisible,
    activeGroupDM: v.activeGroupDM,
    activeGroupId: v.activeGroupId,
    answerDmCall: v.answerDmCall,
    applyDmCallDeafened: v.applyDmCallDeafened,
    applyDmCallMuted: v.applyDmCallMuted,
    assignHydrateEchoFromApi: v.assignHydrateEchoFromApi,
    callOverlay: v.callOverlay,
    declineDmCall: v.declineDmCall,
    dmCallAwaitingAccept: v.dmCallAwaitingAccept,
    dmCallCallViewParticipants: v.dmCallCallViewParticipants,
    dmCallDeafened: v.dmCallDeafened,
    dmCallFullscreen: v.dmCallFullscreen,
    dmCallGlassPeer: v.dmCallGlassPeer,
    dmCallIncoming: v.dmCallIncoming,
    dmCallLobbyAfterSelfLeave: v.dmCallLobbyAfterSelfLeave,
    dmCallMatchesActiveChannel: v.dmCallMatchesActiveChannel,
    dmCallMuted: v.dmCallMuted,
    dmCallQuarterView: v.dmCallQuarterView,
    dmCallRingRemoteVanishing: v.dmCallRingRemoteVanishing,
    dmCallRingUi: v.dmCallRingUi,
    dmCallRinging: v.dmCallRinging,
    dmCallScreenshare: v.dmCallScreenshare,
    dmCallVideo: v.dmCallVideo,
    dmCallWithUserId: v.dmCallWithUserId,
    dmPartnerUser: v.dmPartnerUser,
    dmPartnerUserIdForGroupDm: v.dmPartnerUserIdForGroupDm,
    endDmCall: v.endDmCall,
    handleEchoDmCall: v.handleEchoDmCall,
    leaveDmCallVoice: v.leaveDmCallVoice,
    rejoinDmCallVoice: v.rejoinDmCallVoice,
    startDmCall: v.startDmCall,
    startDmCallWithUserId: v.startDmCallWithUserId,
    startGroupCall: v.startGroupCall,
    startGroupCallWithId: v.startGroupCallWithId,
    toggleDmCallMuted: v.toggleDmCallMuted,
    wireDmCallSocketSubmitters: v.wireDmCallSocketSubmitters,
  };
}

function pickCallVoiceActivityFields(v: CallVoiceBag) {
  return {
    advanceSkrigglesRound: v.advanceSkrigglesRound,
    codenamesRosterUserIds: v.codenamesRosterUserIds,
    commitSkrigglesWordChoice: v.commitSkrigglesWordChoice,
    commitVcCodenamesDeal: v.commitVcCodenamesDeal,
    commitVcHangmanWord: v.commitVcHangmanWord,
    dismissVcTicTacToeInvite: v.dismissVcTicTacToeInvite,
    hangmanGameRoomConnected: v.hangmanGameRoomConnected,
    hangmanGameRoomLastError: v.hangmanGameRoomLastError,
    hangmanRosterUserIds: v.hangmanRosterUserIds,
    publishSkrigglesCanvasCmd: v.publishSkrigglesCanvasCmd,
    publishSkrigglesCanvasSnapshot: v.publishSkrigglesCanvasSnapshot,
    publishSkrigglesStrokeBatch: v.publishSkrigglesStrokeBatch,
    requestVcCodenamesClue: v.requestVcCodenamesClue,
    requestVcCodenamesEndTurn: v.requestVcCodenamesEndTurn,
    requestVcCodenamesNewGame: v.requestVcCodenamesNewGame,
    requestVcCodenamesPushKeyToOrchestrator:
      v.requestVcCodenamesPushKeyToOrchestrator,
    requestVcCodenamesReveal: v.requestVcCodenamesReveal,
    requestVcCodenamesSetup: v.requestVcCodenamesSetup,
    requestVcHangmanGuessLetter: v.requestVcHangmanGuessLetter,
    requestVcHangmanNextRound: v.requestVcHangmanNextRound,
    requestVcTicTacToeMove: v.requestVcTicTacToeMove,
    requestVcTicTacToeRematch: v.requestVcTicTacToeRematch,
    respondVcTicTacToeInvite: v.respondVcTicTacToeInvite,
    sendVcTicTacToeChallenge: v.sendVcTicTacToeChallenge,
    setWordlineMode: v.setWordlineMode,
    skrigglesCanvasEvents: v.skrigglesCanvasEvents,
    skrigglesRosterUserIds: v.skrigglesRosterUserIds,
    startSkrigglesGame: v.startSkrigglesGame,
    submitSkrigglesGuess: v.submitSkrigglesGuess,
    submitWordlineGuess: v.submitWordlineGuess,
    tickSkrigglesTimers: v.tickSkrigglesTimers,
    updateSkrigglesSettings: v.updateSkrigglesSettings,
    vcCodenamesActivity: v.vcCodenamesActivity,
    vcCodenamesSpymasterKey: v.vcCodenamesSpymasterKey,
    vcHangmanActivity: v.vcHangmanActivity,
    vcSkrigglesActivity: v.vcSkrigglesActivity,
    vcTicTacToeActivity: v.vcTicTacToeActivity,
    vcTicTacToePendingInvite: v.vcTicTacToePendingInvite,
    wordlineView: v.wordlineView,
  };
}

function pickCallVoiceLiveKitFields(v: CallVoiceBag) {
  return {
    _joinVoiceSession: v.joinVoiceSession,
    _liveKitVoiceApi: v.liveKitVoiceApi,
    _setLkInputVolume: v.setLkInputVolume,
    _syncLiveKitAudioFromUiStores: v.syncLiveKitAudioFromUiStores,
    activeVoiceChannelParticipants: v.activeVoiceChannelParticipants,
    desktopStreamingPreferences: v.desktopStreamingPreferences,
    effectiveVcActivityKingUserId: v.effectiveVcActivityKingUserId,
    getVcActivityPresenceForUser: v.getVcActivityPresenceForUser,
    getVcChannelActivityPresenceForChannel:
      v.getVcChannelActivityPresenceForChannel,
    getVcLocalCameraTrack: v.getVcLocalCameraTrack,
    getVcLocalScreenTrack: v.getVcLocalScreenTrack,
    leaveVoiceSession: v.leaveVoiceSession,
    liveKitNetworkStats: v.liveKitNetworkStats,
    liveKitRoom: v.liveKitRoom,
    liveKitState: v.liveKitState,
    localAudioLevel: v.localAudioLevel,
    localSpeaking: v.localSpeaking,
    onDesktopCameraStarted: v.onDesktopCameraStarted,
    publishVcWatchTogetherPlaybackSync: v.publishVcWatchTogetherPlaybackSync,
    publishVcYoutubePlaybackSync: v.publishVcYoutubePlaybackSync,
    reapplyVoiceProcessing: v.reapplyVoiceProcessing,
    reconnectGuildVoiceAfterE2eeRotation:
      v.reconnectGuildVoiceAfterE2eeRotation,
    setDesktopStreamingPreferences: v.setDesktopStreamingPreferences,
    setLkOutputVolume: v.setLkOutputVolume,
    setVcVideoQuality: v.setVcVideoQuality,
    speakingMap: v.speakingMap,
    startDesktopCameraStream: v.startDesktopCameraStream,
    startDesktopScreenShare: v.startDesktopScreenShare,
    startVcScreenShare: v.startVcScreenShare,
    stopVcScreenShare: v.stopVcScreenShare,
    switchMicDevice: v.switchMicDevice,
    switchSpeakerDevice: v.switchSpeakerDevice,
    switchVcCamera: v.switchVcCamera,
    vcMirrorCamera: v.vcMirrorCamera,
    vcRemoteParticipants: v.vcRemoteParticipants,
    vcWatchTogetherPlaybackShouldPublish:
      v.vcWatchTogetherPlaybackShouldPublish,
    vcWatchTogetherRemotePlayback: v.vcWatchTogetherRemotePlayback,
    vcYoutubePlaybackShouldPublish: v.vcYoutubePlaybackShouldPublish,
    vcYoutubeRemotePlayback: v.vcYoutubeRemotePlayback,
  };
}

function pickCallVoiceChannelPanelFields(v: CallVoiceBag) {
  return {
    _channelPanelVoiceTransportUsesDmCall:
      v.channelPanelVoiceTransportUsesDmCall,
    canJoinPreviewVoiceChannel: v.canJoinPreviewVoiceChannel,
    channelPanelVcDeafenedEffective: v.channelPanelVcDeafenedEffective,
    channelPanelVcMutedEffective: v.channelPanelVcMutedEffective,
    channelPanelVcScreenshareEffective: v.channelPanelVcScreenshareEffective,
    channelPanelVcVideoEffective: v.channelPanelVcVideoEffective,
    channelPanelVoiceChannelId: v.channelPanelVoiceChannelId,
    channelPanelVoiceChannelName: v.channelPanelVoiceChannelName,
    dmCallVoiceStripThreadId: v.dmCallVoiceStripThreadId,
    dmCallVoiceStripTitle: v.dmCallVoiceStripTitle,
    handleChannelVoicePanelLeave: v.handleChannelVoicePanelLeave,
    handleJoinVoiceNavigation: v.handleJoinVoiceNavigation,
    handleLeaveVoiceNavigation: v.handleLeaveVoiceNavigation,
    handleMinimizeVoiceViewNavigation: v.handleMinimizeVoiceViewNavigation,
    onChannelPanelVcDeafened: v.onChannelPanelVcDeafened,
    onChannelPanelVcMuted: v.onChannelPanelVcMuted,
    onChannelPanelVcScreenshare: v.onChannelPanelVcScreenshare,
    onChannelPanelVcVideo: v.onChannelPanelVcVideo,
    onDmCallVcDeafened: v.onDmCallVcDeafened,
    onDmCallVcMuted: v.onDmCallVcMuted,
    onDmCallVcScreenshare: v.onDmCallVcScreenshare,
    onDmCallVcVideo: v.onDmCallVcVideo,
    onGuildChannelVcDeafened: v.onGuildChannelVcDeafened,
    onGuildChannelVcMuted: v.onGuildChannelVcMuted,
    onGuildChannelVcScreenshare: v.onGuildChannelVcScreenshare,
    onGuildChannelVcVideo: v.onGuildChannelVcVideo,
    onVcChatButtonClickNavigation: v.onVcChatButtonClickNavigation,
  };
}

/**
 * Call-voice leftover glue: alias private fields, remote volume, VC expose,
 * DM surface flags. Call once after `useAppLayoutCallVoiceBridge`.
 */
export function useAppLayoutCallVoiceLayoutBindings(
  callVoice: CallVoiceBag,
  extras: UseAppLayoutCallVoiceLayoutBindingsExtras,
) {
  const volume = createLiveKitRemoteVolumeControls(
    () => callVoice.liveKitVoiceApi,
  );
  const voiceExpose = useAppLayoutVoiceContextExpose({
    liveKitState: callVoice.liveKitState,
    findChannelContextById: extras.findChannelContextById,
    handleJoinVoiceNavigation: callVoice.handleJoinVoiceNavigation,
    handleLeaveVoiceNavigation: callVoice.handleLeaveVoiceNavigation,
  });
  const dmFlags = useAppLayoutMainSurfaceDmFlags({
    mainSurface: extras.mainSurface,
    activeRailTab: extras.activeRailTab,
    activeGroupDM: callVoice.activeGroupDM,
  });
  return {
    ...pickCallVoiceDmCallFields(callVoice),
    ...pickCallVoiceActivityFields(callVoice),
    ...pickCallVoiceLiveKitFields(callVoice),
    ...pickCallVoiceChannelPanelFields(callVoice),
    ...volume,
    ...voiceExpose,
    isInDmThreadOrIdleMainSurface: dmFlags.isInDmThreadOrIdleMainSurface,
    isInDMModeComputed: dmFlags.isInDMMode,
    isGroupDMComputed: dmFlags.isGroupDM,
  };
}
