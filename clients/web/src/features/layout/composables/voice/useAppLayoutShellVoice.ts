/**
 * Guild LiveKit voice session, device store sync, channel-panel transport bridge,
 * and voice-related navigation helpers for the app layout shell.
 */
import { computed, ref, watch, type ComputedRef, type Ref, unref } from 'vue';
import { storeToRefs } from 'pinia';
import type {
  AppLayoutVoiceShellDepsSlice,
  AuthSessionStore,
} from '@/features/layout/composables/voice/appLayoutVoiceNavDeps';
import { useUiAudioDevicesStore } from '@/features/settings/uiAudioDevices';
import { useVoiceLevelsStore } from '@/features/voice/voiceLevels';
import { useCameraPreferencesStore } from '@/features/voice/cameraPreferences';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import type {
  ChannelPermissionKey,
  ChannelSummary,
  EchoDmCallEndedReason,
} from '@shared/types';
import type { PreviewChannelPermission } from '@/features/chat/domain/chatRolePreviewPermissions';
import type { Server } from '@shared/types/server';
import {
  ECHO_SCREEN_SHARE_USE_CONFIG_MODAL,
  SCREEN_SHARE_BROWSER_DEFAULTS,
} from '@/config/screenShareUi';
import { useServerVoiceSession } from './useServerVoiceSession';
import { logShellNav } from '@/features/layout/shellNavDebugLog';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';
import type { AppLayoutDmCallsVoiceBinding } from '../dm/useAppLayoutDmCalls';
import { runVoiceJoinMediaPreflightInteractive } from '@/features/voice/voiceJoinMediaPreflightFlow';
import { dispatchVoiceJoinPrepareMicTest } from '@/audio/echoVoiceMicTestBridge';
import { EchoApiError } from '@/api/echo/transport';
import {
  requestGuildVoiceDiscordMirrorModal,
  requestGuildVoiceJoinApiDeniedModal,
  requestGuildVoiceJoinNoPermissionModal,
} from '@/features/layout/failures/guildVoiceJoinBlockedDialog';
import { UIErrorBus } from '@/features/layout/failures/uiErrorBus';
import { isDesktop } from '@/platform/desktopBridge';
import type {
  VcActivityUiPhase,
  VcActivityUiState,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';

export type UseAppLayoutShellVoiceDeps = {
  authSession: AuthSessionStore;
  workspace: WorkspaceStateApi;
  hydrateEchoFromApi: () => Promise<void>;
  isDmVoiceCallUi: Ref<boolean>;
  dmCallIncoming: ComputedRef<boolean>;
  dmCallRinging: ComputedRef<boolean>;
  dmCallMuted: Ref<boolean>;
  dmCallDeafened: Ref<boolean>;
  dmCallVideo: Ref<boolean>;
  dmCallScreenshare: Ref<boolean>;
  dmCallWithUserId: Ref<string | null>;
  dmVoiceJoinTargetId: ComputedRef<string>;
  groupDMs: Ref<
    Record<
      string,
      { id: string; name: string; memberIds: string[]; pfp?: string }
    >
  >;
  applyDmCallDeafened: (next: boolean) => void;
  applyDmCallMuted: (next: boolean) => void;
  endDmCall: (options?: {
    emitSignal?: boolean;
    reason?: EchoDmCallEndedReason;
  }) => Promise<void>;
  leaveDmCallVoice: () => Promise<void>;
  dmCallLobbyAfterSelfLeave: Ref<boolean>;
  activeChannelId: Ref<string>;
  /** Sub-800px guild tri-pane: after joining VC, start on full CallView with chat sheet minimized. */
  isCompactGuildTriPane: ComputedRef<boolean>;
} & AppLayoutVoiceShellDepsSlice;

export function useAppLayoutShellVoice(deps: UseAppLayoutShellVoiceDeps) {
  const {
    authSession,
    workspace,
    selectedServerEcho,
    voiceChannelForParticipants,
    currentVoiceChannelId,
    currentVoiceChannelName,
    vcMuted,
    vcDeafened,
    micTestListenDeafenActive,
    setMicTestListenDeafen,
    applyVcDeafened,
    applyVcMuted,
    vcVideo,
    vcScreenshare,
    isScreenSharePickerOpen,
    isDesktopStreamingControlOpen,
    desktopStreamingControlMode,
    onJoinVoice,
    onLeaveVoice,
    hydrateEchoFromApi,
    isDmVoiceCallUi,
    dmCallIncoming,
    dmCallRinging,
    dmCallMuted,
    dmCallDeafened,
    dmCallVideo,
    dmCallScreenshare,
    dmCallWithUserId,
    dmVoiceJoinTargetId,
    groupDMs,
    applyDmCallDeafened,
    applyDmCallMuted,
    endDmCall,
    leaveDmCallVoice,
    dmCallLobbyAfterSelfLeave,
    isDmUiContext,
    activeChannelId,
    voiceSideChatCollapsed,
    toggleVoiceSideChat,
    categoriesForServer,
    getFirstTextChannelId,
    findChannelContextById,
    roleUi,
    resolvePreviewChannelPermission,
    isCompactGuildTriPane,
    vcActivityUi,
    applyVcYoutubeWatchTogetherRemote,
    applyVcWatchTogetherRemote,
    closeVcActivity,
  } = deps;

  const {
    onJoinVoice: joinVoiceSession,
    onLeaveVoice: leaveVoiceSession,
    reconnectGuildVoiceAfterE2eeRotation,
    getVcActivityPresenceForUser,
    getVcChannelActivityPresenceForChannel,
    vcHangmanActivity,
    hangmanRosterUserIds,
    hangmanGameRoomConnected,
    hangmanGameRoomLastError,
    vcSkrigglesActivity,
    skrigglesRosterUserIds,
    skrigglesCanvasEvents,
    vcCodenamesActivity,
    codenamesRosterUserIds,
    vcCodenamesSpymasterKey,
    commitVcHangmanWord,
    requestVcHangmanGuessLetter,
    requestVcHangmanNextRound,
    wordlineView,
    submitWordlineGuess,
    setWordlineMode,
    commitSkrigglesWordChoice,
    submitSkrigglesGuess,
    updateSkrigglesSettings,
    startSkrigglesGame,
    advanceSkrigglesRound,
    publishSkrigglesStrokeBatch,
    publishSkrigglesCanvasCmd,
    publishSkrigglesCanvasSnapshot,
    tickSkrigglesTimers,
    vcTicTacToeActivity,
    vcTicTacToePendingInvite,
    sendVcTicTacToeChallenge,
    respondVcTicTacToeInvite,
    dismissVcTicTacToeInvite,
    requestVcTicTacToeMove,
    requestVcTicTacToeRematch,
    commitVcCodenamesDeal,
    requestVcCodenamesSetup,
    requestVcCodenamesClue,
    requestVcCodenamesReveal,
    requestVcCodenamesEndTurn,
    requestVcCodenamesNewGame,
    requestVcCodenamesPushKeyToOrchestrator,
    activeVoiceChannelParticipants,
    liveKitState,
    liveKitNetworkStats,
    lkRoom: liveKitRoom,
    liveKitVoiceApi,
    remoteParticipants: vcRemoteParticipants,
    speakingMap,
    localSpeaking,
    localAudioLevel,
    switchMicDevice,
    switchSpeakerDevice,
    setLkOutputVolume,
    setLkInputVolume,
    desktopStreamingPreferences,
    setDesktopStreamingPreferences,
    reapplyVoiceProcessing,
    switchCamera: switchVcCamera,
    setVideoQuality: setVcVideoQuality,
    startScreenShare: startVcScreenShare,
    startDesktopScreenShare,
    startDesktopCameraStream,
    stopScreenShare: stopVcScreenShare,
    getLocalScreenTrack: getVcLocalScreenTrack,
    getLocalCameraTrack: getVcLocalCameraTrack,
    vcYoutubeRemotePlayback,
    publishVcYoutubePlaybackSync,
    vcYoutubePlaybackShouldPublish,
    vcWatchTogetherRemotePlayback,
    publishVcWatchTogetherPlaybackSync,
    vcWatchTogetherPlaybackShouldPublish,
    effectiveVcActivityKingUserId,
    applyVoiceMediaModerationFromSocket,
  } = useServerVoiceSession({
    authSession,
    workspace,
    selectedServer: selectedServerEcho,
    activeChannel: voiceChannelForParticipants,
    currentVoiceChannelId,
    currentVoiceChannelName,
    findChannelContextById,
    vcMuted,
    vcDeafened,
    micTestListenDeafenActive,
    vcVideo,
    vcScreenshare,
    currentUser: computed(() => {
      const u = authSession.backendUser;
      return u ? { id: u.id } : undefined;
    }),
    onJoinVoiceUi: (payload) => {
      onJoinVoice(payload);
    },
    onLeaveVoiceUi: () => {
      onLeaveVoice();
    },
    hydrateWorkspace: hydrateEchoFromApi,
    isDmVoiceCallUi,
    dmCallMuted,
    dmCallDeafened,
    dmCallVideo,
    vcActivityUi,
    applyVcYoutubeWatchTogetherRemote,
    applyVcWatchTogetherRemote,
    closeVcActivity,
  });

  const uiAudioDevices = useUiAudioDevicesStore();
  const voiceLevels = useVoiceLevelsStore();
  const { outputEffectivePercent, inputEffectivePercent } =
    storeToRefs(voiceLevels);
  const cameraPreferences = useCameraPreferencesStore();
  const { mirrorLocalVideo: vcMirrorCamera } = storeToRefs(cameraPreferences);

  watch(
    () => uiAudioDevices.outputSinkId,
    (id) => {
      const raw = !id || id === 'default' ? '' : id;
      switchSpeakerDevice(raw);
    },
  );

  watch(
    () => uiAudioDevices.inputDeviceId,
    (id) => {
      if (liveKitState.value !== 'connected') return;
      const raw = !id || id === 'default' ? '' : id;
      void switchMicDevice(raw);
    },
  );

  function syncLiveKitAudioFromUiStores() {
    if (liveKitState.value !== 'connected' || !liveKitVoiceApi) return;
    const out = uiAudioDevices.outputSinkId;
    switchSpeakerDevice(!out || out === 'default' ? '' : out);
    const inn = uiAudioDevices.inputDeviceId;
    void switchMicDevice(!inn || inn === 'default' ? '' : inn);
    setLkOutputVolume(outputEffectivePercent.value);
    setLkInputVolume(inputEffectivePercent.value);
    switchVcCamera(cameraPreferences.cameraDeviceId);
    setVcVideoQuality(cameraPreferences.vcVideoQualityPreset);
  }

  watch(
    () => liveKitState.value,
    (s) => {
      if (s === 'connected') {
        syncLiveKitAudioFromUiStores();
        void liveKitVoiceApi?.recoverVoiceMediaSession({
          muted: vcMuted.value,
          deafened: vcDeafened.value || micTestListenDeafenActive.value,
        });
      }
    },
  );

  const dmCallVoiceStripThreadId = computed(() => {
    if (!dmCallWithUserId.value?.trim()) return null;
    const jid = dmVoiceJoinTargetId.value.trim();
    return jid || null;
  });

  const dmCallVoiceStripTitle = computed(() => {
    const dm = dmCallWithUserId.value?.trim();
    if (!dm) return '';
    const g = groupDMs.value[dm];
    if (g) return g.name;
    const u = workspace.users.value.find((x) => x.id === dm);
    return u?.name ? `Call · ${u.name}` : 'Voice call';
  });
  const desktopStreamingControlTarget = ref<'guild' | 'dm'>('guild');

  function recoverGuildVcAudioAfterUserUnmuteOrUndeafen() {
    if (liveKitState.value !== 'connected' || !liveKitVoiceApi) return;
    if (isDmVoiceCallUi.value) return;
    void liveKitVoiceApi.recoverVoiceMediaSession({
      muted: vcMuted.value,
      deafened: vcDeafened.value || micTestListenDeafenActive.value,
    });
  }

  function recoverDmCallAudioAfterUserUnmuteOrUndeafen() {
    if (liveKitState.value !== 'connected' || !liveKitVoiceApi) return;
    if (!isDmVoiceCallUi.value) return;
    void liveKitVoiceApi.recoverVoiceMediaSession({
      muted: dmCallMuted.value,
      deafened: dmCallDeafened.value,
    });
  }

  function onGuildChannelVcMuted(next: boolean) {
    if (!currentVoiceChannelId.value?.trim()) return;
    const wasDeafened = vcDeafened.value;
    applyVcMuted(next);
    if (!next && (!wasDeafened || !vcDeafened.value)) {
      recoverGuildVcAudioAfterUserUnmuteOrUndeafen();
    }
  }

  function onGuildChannelVcDeafened(next: boolean) {
    if (!currentVoiceChannelId.value?.trim()) return;
    applyVcDeafened(next);
    if (!next) recoverGuildVcAudioAfterUserUnmuteOrUndeafen();
  }

  function onGuildChannelVcVideo(next: boolean) {
    if (!currentVoiceChannelId.value?.trim()) return;
    if (next && isDesktop()) {
      desktopStreamingControlTarget.value = 'guild';
      desktopStreamingControlMode.value = 'camera';
      isDesktopStreamingControlOpen.value = true;
      return;
    }
    vcVideo.value = next;
  }

  function onGuildChannelVcScreenshare(next: boolean) {
    if (!currentVoiceChannelId.value?.trim()) return;
    if (vcScreenshare.value === next) return;
    if (vcScreenshare.value) {
      void stopVcScreenShare();
    } else if (isDesktop()) {
      desktopStreamingControlTarget.value = 'guild';
      desktopStreamingControlMode.value = 'screen';
      isDesktopStreamingControlOpen.value = true;
    } else if (ECHO_SCREEN_SHARE_USE_CONFIG_MODAL) {
      isScreenSharePickerOpen.value = true;
    } else {
      void startVcScreenShare(SCREEN_SHARE_BROWSER_DEFAULTS);
    }
  }

  function onDmCallVcMuted(next: boolean) {
    if (!dmCallWithUserId.value?.trim()) return;
    const wasDeafened = dmCallDeafened.value;
    applyDmCallMuted(next);
    if (!next && (!wasDeafened || !dmCallDeafened.value)) {
      recoverDmCallAudioAfterUserUnmuteOrUndeafen();
    }
  }

  function onDmCallVcDeafened(next: boolean) {
    if (!dmCallWithUserId.value?.trim()) return;
    applyDmCallDeafened(next);
    if (!next) recoverDmCallAudioAfterUserUnmuteOrUndeafen();
  }

  function onDmCallVcVideo(next: boolean) {
    if (!dmCallWithUserId.value?.trim()) return;
    if (next && isDesktop()) {
      desktopStreamingControlTarget.value = 'dm';
      desktopStreamingControlMode.value = 'camera';
      isDesktopStreamingControlOpen.value = true;
      return;
    }
    dmCallVideo.value = next;
  }

  function onDmCallVcScreenshare(next: boolean) {
    if (!dmCallWithUserId.value?.trim()) return;
    if (dmCallScreenshare.value === next) return;
    if (next) {
      if (isDesktop()) {
        desktopStreamingControlTarget.value = 'dm';
        desktopStreamingControlMode.value = 'screen';
        isDesktopStreamingControlOpen.value = true;
        return;
      }
      if (ECHO_SCREEN_SHARE_USE_CONFIG_MODAL) {
        isScreenSharePickerOpen.value = true;
      } else {
        void startVcScreenShare(SCREEN_SHARE_BROWSER_DEFAULTS);
      }
    } else {
      void stopVcScreenShare();
    }
  }

  const channelPanelVoiceTransportUsesDmCall = computed(() => {
    if (isDmUiContext.value) return false;
    if (unref(dmCallLobbyAfterSelfLeave)) return false;
    if (!dmCallWithUserId.value?.trim()) return false;
    if (!dmCallVoiceStripThreadId.value?.trim()) return false;
    // Do not show "in-call" transport while an incoming call is still awaiting user choice.
    if (dmCallIncoming.value && dmCallRinging.value) return false;
    if (currentVoiceChannelId.value?.trim()) return false;
    return true;
  });

  const channelPanelVoiceChannelId = computed((): string | null => {
    const g = currentVoiceChannelId.value?.trim();
    if (g) return g;
    const tid = dmCallVoiceStripThreadId.value?.trim();
    if (channelPanelVoiceTransportUsesDmCall.value && tid) return tid;
    return null;
  });

  const channelPanelVoiceChannelName = computed(() => {
    if (currentVoiceChannelId.value?.trim()) {
      return currentVoiceChannelName.value;
    }
    if (channelPanelVoiceTransportUsesDmCall.value) {
      return dmCallVoiceStripTitle.value;
    }
    return '';
  });

  const channelPanelVcMutedEffective = computed(() =>
    channelPanelVoiceTransportUsesDmCall.value
      ? dmCallMuted.value
      : vcMuted.value,
  );

  const channelPanelVcDeafenedEffective = computed(() =>
    channelPanelVoiceTransportUsesDmCall.value
      ? dmCallDeafened.value
      : vcDeafened.value,
  );

  const channelPanelVcVideoEffective = computed(() =>
    channelPanelVoiceTransportUsesDmCall.value
      ? dmCallVideo.value
      : vcVideo.value,
  );

  const channelPanelVcScreenshareEffective = computed(() =>
    channelPanelVoiceTransportUsesDmCall.value
      ? dmCallScreenshare.value
      : vcScreenshare.value,
  );

  function onChannelPanelVcMuted(next: boolean) {
    if (channelPanelVoiceTransportUsesDmCall.value) {
      onDmCallVcMuted(next);
      return;
    }
    onGuildChannelVcMuted(next);
  }

  function onChannelPanelVcDeafened(next: boolean) {
    if (channelPanelVoiceTransportUsesDmCall.value) {
      onDmCallVcDeafened(next);
      return;
    }
    onGuildChannelVcDeafened(next);
  }

  function onChannelPanelVcVideo(next: boolean) {
    if (channelPanelVoiceTransportUsesDmCall.value) {
      onDmCallVcVideo(next);
      return;
    }
    onGuildChannelVcVideo(next);
  }

  function onChannelPanelVcScreenshare(next: boolean) {
    if (channelPanelVoiceTransportUsesDmCall.value) {
      onDmCallVcScreenshare(next);
      return;
    }
    onGuildChannelVcScreenshare(next);
  }

  watch(
    [liveKitState, outputEffectivePercent],
    () => {
      if (liveKitState.value !== 'connected') return;
      setLkOutputVolume(outputEffectivePercent.value);
    },
    { flush: 'post' },
  );

  watch(
    [liveKitState, inputEffectivePercent],
    () => {
      if (liveKitState.value !== 'connected') return;
      setLkInputVolume(inputEffectivePercent.value);
    },
    { flush: 'post' },
  );

  function canJoinGuildVoiceChannel(channelId: string): boolean {
    const sid = selectedServerEcho.value?.id ?? '';
    if (!sid || sid === 'echo' || !isEchoGraphId(sid)) return true;
    const ctx = findChannelContextById(channelId);
    const ch = ctx?.channel;
    if (!ch || (ch.type !== 'voice' && ch.type !== 'stage')) return true;
    if (roleUi.isRolePreviewActiveForServer.value) {
      const defaults = ctx.category.channelPermissionDefaults;
      return (
        resolvePreviewChannelPermission(ch, defaults, 'viewChannel') &&
        resolvePreviewChannelPermission(ch, defaults, 'connect')
      );
    }
    if (ch.discordVoiceMirrorOnly) return false;
    return ch.canConnectVoice !== false;
  }

  async function handleJoinVoiceNavigation(payload: {
    channelId: string;
    channelName: string;
  }) {
    const ctx = findChannelContextById(payload.channelId);
    const vch = ctx?.channel;
    if (
      (vch?.type === 'voice' || vch?.type === 'stage') &&
      vch.discordVoiceMirrorOnly
    ) {
      requestGuildVoiceDiscordMirrorModal();
      return;
    }
    if (!canJoinGuildVoiceChannel(payload.channelId)) {
      requestGuildVoiceJoinNoPermissionModal();
      return;
    }
    const targetId = payload.channelId.trim();
    /** Already in this VC — only surface the voice UI; do not re-run join / LiveKit reconnect. */
    if (currentVoiceChannelId.value?.trim() === targetId) {
      activeChannelId.value = payload.channelId;
      voiceSideChatCollapsed.value = isCompactGuildTriPane.value ? true : false;
      logShellNav('handleJoinVoiceNavigation', 'already_in_voice_ui_only', {
        channelId: targetId,
      });
      return;
    }
    let joinWithoutMic = false;
    if (micTestListenDeafenActive.value) {
      dispatchVoiceJoinPrepareMicTest();
      setMicTestListenDeafen(false);
    }
    if (!vcMuted.value) {
      const preflight = await runVoiceJoinMediaPreflightInteractive();
      if (preflight === 'cancelled') return;
      if (preflight === 'join_muted') {
        onChannelPanelVcMuted(true);
        joinWithoutMic = true;
      }
    }
    if (dmCallWithUserId.value) {
      await endDmCall();
    }
    activeChannelId.value = payload.channelId;
    try {
      await joinVoiceSession(payload);
      if (isCompactGuildTriPane.value) {
        voiceSideChatCollapsed.value = true;
      }
    } catch (e) {
      if (e instanceof EchoApiError) {
        requestGuildVoiceJoinApiDeniedModal(e);
      } else {
        const detail =
          e instanceof Error && e.message.trim()
            ? e.message.trim()
            : 'Could not connect to voice.';
        UIErrorBus.emit({
          context: 'voice.join_connect',
          severity: 'warning',
          userMessage: `${detail} Tap Retry to try this channel again.`,
          retryAction: () => {
            void handleJoinVoiceNavigation(payload);
          },
        });
      }
      const fallback = getFirstTextChannelId(categoriesForServer.value);
      if (fallback) {
        logShellNav(
          'handleJoinVoiceNavigation',
          'join_failed_fallback_channel',
          {
            fallback,
            was: activeChannelId.value,
          },
        );
        activeChannelId.value = fallback;
      }
    }
  }

  function canJoinPreviewVoiceChannel(channelId: string): boolean {
    return canJoinGuildVoiceChannel(channelId);
  }

  function handleLeaveVoiceNavigation() {
    const ch = findChannelContextById(activeChannelId.value)?.channel;
    if (ch?.type === 'voice' || ch?.type === 'stage') {
      logShellNav(
        'handleLeaveVoiceNavigation',
        'leave_voice_keep_surface_open',
        {
          channelId: activeChannelId.value,
        },
      );
    }
    leaveVoiceSession();
  }

  async function handleChannelVoicePanelLeave() {
    if (currentVoiceChannelId.value?.trim()) {
      handleLeaveVoiceNavigation();
    } else if (dmCallWithUserId.value?.trim()) {
      await leaveDmCallVoice();
    }
  }

  function onVcChatButtonClickNavigation() {
    const viewingVoice = (() => {
      const t = findChannelContextById(activeChannelId.value)?.channel?.type;
      return t === 'voice' || t === 'stage';
    })();
    if (currentVoiceChannelId.value && !viewingVoice) {
      logShellNav('onVcChatButtonClickNavigation', 'jump_to_voice_channel', {
        to: currentVoiceChannelId.value,
        from: activeChannelId.value,
      });
      activeChannelId.value = currentVoiceChannelId.value;
      voiceSideChatCollapsed.value = false;
      return;
    }
    if (viewingVoice) {
      toggleVoiceSideChat();
      return;
    }
    toggleVoiceSideChat();
  }

  /** Compact mobile: leave CallView while staying connected — browse text channels + floating pill. */
  function handleMinimizeVoiceViewNavigation() {
    if (!currentVoiceChannelId.value?.trim()) return;
    const t = findChannelContextById(activeChannelId.value)?.channel?.type;
    if (t !== 'voice' && t !== 'stage') return;
    const textId = getFirstTextChannelId(categoriesForServer.value);
    if (!textId) return;
    logShellNav('handleMinimizeVoiceViewNavigation', 'minimize_to_text', {
      textId,
      voiceChannelId: currentVoiceChannelId.value,
    });
    activeChannelId.value = textId;
    voiceSideChatCollapsed.value = true;
  }

  function buildVoiceBindingForDmCalls(): AppLayoutDmCallsVoiceBinding {
    return {
      liveKitState,
      liveKitVoiceApi,
      vcRemoteParticipants,
      speakingMap,
      localSpeaking,
      localAudioLevel,
      syncLiveKitAudioFromUiStores,
      stopVcScreenShare,
      selectedServerEcho,
      currentVoiceChannelId,
    };
  }

  function onDesktopCameraStarted() {
    if (desktopStreamingControlTarget.value === 'dm') {
      dmCallVideo.value = true;
      return;
    }
    vcVideo.value = true;
  }

  return {
    joinVoiceSession,
    leaveVoiceSession,
    reconnectGuildVoiceAfterE2eeRotation,
    getVcActivityPresenceForUser,
    getVcChannelActivityPresenceForChannel,
    vcHangmanActivity,
    hangmanRosterUserIds,
    hangmanGameRoomConnected,
    hangmanGameRoomLastError,
    vcSkrigglesActivity,
    skrigglesRosterUserIds,
    skrigglesCanvasEvents,
    vcCodenamesActivity,
    codenamesRosterUserIds,
    vcCodenamesSpymasterKey,
    commitVcHangmanWord,
    requestVcHangmanGuessLetter,
    requestVcHangmanNextRound,
    wordlineView,
    submitWordlineGuess,
    setWordlineMode,
    commitSkrigglesWordChoice,
    submitSkrigglesGuess,
    updateSkrigglesSettings,
    startSkrigglesGame,
    advanceSkrigglesRound,
    publishSkrigglesStrokeBatch,
    publishSkrigglesCanvasCmd,
    publishSkrigglesCanvasSnapshot,
    tickSkrigglesTimers,
    vcTicTacToeActivity,
    vcTicTacToePendingInvite,
    sendVcTicTacToeChallenge,
    respondVcTicTacToeInvite,
    dismissVcTicTacToeInvite,
    requestVcTicTacToeMove,
    requestVcTicTacToeRematch,
    commitVcCodenamesDeal,
    requestVcCodenamesSetup,
    requestVcCodenamesClue,
    requestVcCodenamesReveal,
    requestVcCodenamesEndTurn,
    requestVcCodenamesNewGame,
    requestVcCodenamesPushKeyToOrchestrator,
    activeVoiceChannelParticipants,
    liveKitState,
    liveKitNetworkStats,
    liveKitRoom,
    liveKitVoiceApi,
    vcRemoteParticipants,
    speakingMap,
    localSpeaking,
    localAudioLevel,
    switchMicDevice,
    switchSpeakerDevice,
    setLkOutputVolume,
    setLkInputVolume,
    desktopStreamingPreferences,
    setDesktopStreamingPreferences,
    reapplyVoiceProcessing,
    switchVcCamera,
    setVcVideoQuality,
    startVcScreenShare,
    startDesktopScreenShare,
    startDesktopCameraStream,
    desktopStreamingControlTarget,
    onDesktopCameraStarted,
    stopVcScreenShare,
    getVcLocalScreenTrack,
    getVcLocalCameraTrack,
    vcYoutubeRemotePlayback,
    publishVcYoutubePlaybackSync,
    vcYoutubePlaybackShouldPublish,
    vcWatchTogetherRemotePlayback,
    publishVcWatchTogetherPlaybackSync,
    vcWatchTogetherPlaybackShouldPublish,
    effectiveVcActivityKingUserId,
    vcMirrorCamera,
    syncLiveKitAudioFromUiStores,
    dmCallVoiceStripThreadId,
    dmCallVoiceStripTitle,
    onGuildChannelVcMuted,
    onGuildChannelVcDeafened,
    onGuildChannelVcVideo,
    onGuildChannelVcScreenshare,
    onDmCallVcMuted,
    onDmCallVcDeafened,
    onDmCallVcVideo,
    onDmCallVcScreenshare,
    channelPanelVoiceTransportUsesDmCall,
    channelPanelVoiceChannelId,
    channelPanelVoiceChannelName,
    channelPanelVcMutedEffective,
    channelPanelVcDeafenedEffective,
    channelPanelVcVideoEffective,
    channelPanelVcScreenshareEffective,
    onChannelPanelVcMuted,
    onChannelPanelVcDeafened,
    onChannelPanelVcVideo,
    onChannelPanelVcScreenshare,
    handleJoinVoiceNavigation,
    handleLeaveVoiceNavigation,
    handleChannelVoicePanelLeave,
    canJoinPreviewVoiceChannel,
    onVcChatButtonClickNavigation,
    handleMinimizeVoiceViewNavigation,
    buildVoiceBindingForDmCalls,
    applyVoiceMediaModerationFromSocket,
  };
}
