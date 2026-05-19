import { computed, ref, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useAppLayoutShellVoice } from './useAppLayoutShellVoice';

const joinVoiceSessionMock = vi.hoisted(() => vi.fn());

vi.mock('pinia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pinia')>();
  return {
    ...actual,
    storeToRefs: () => ({
      mirrorLocalVideo: ref(false),
      outputEffectivePercent: ref(100),
      inputEffectivePercent: ref(100),
    }),
  };
});

vi.mock('@/stores/uiAudioDevices', () => ({
  useUiAudioDevicesStore: () => ({
    outputSinkId: '',
    inputDeviceId: '',
  }),
}));

vi.mock('@/stores/voiceLevels', () => ({
  useVoiceLevelsStore: () => ({
    outputEffectivePercent: 100,
    inputEffectivePercent: 100,
  }),
}));

vi.mock('@/stores/cameraPreferences', () => ({
  useCameraPreferencesStore: () => ({
    cameraDeviceId: 'default',
    vcVideoQualityPreset: '720p',
  }),
}));

vi.mock('./useServerVoiceSession', () => ({
  useServerVoiceSession: (deps: { onLeaveVoiceUi: () => void }) => ({
    onJoinVoice: joinVoiceSessionMock,
    onLeaveVoice: deps.onLeaveVoiceUi,
    activeVoiceChannelParticipants: computed(() => []),
    liveKitState: computed(() => 'idle' as const),
    liveKitNetworkStats: computed(() => null),
    lkRoom: computed(() => null),
    liveKitVoiceApi: null,
    remoteParticipants: computed(() => new Map()),
    speakingMap: computed(() => ({})),
    localSpeaking: computed(() => false),
    localAudioLevel: computed(() => 0),
    switchMicDevice: vi.fn(),
    switchSpeakerDevice: vi.fn(),
    setLkOutputVolume: vi.fn(),
    setLkInputVolume: vi.fn(),
    desktopStreamingPreferences: ref({
      screenQuality: '720p30',
      screenContentHint: 'detail',
      screenIncludeAudio: true,
      cameraQuality: '720p',
    }),
    setDesktopStreamingPreferences: vi.fn(),
    reapplyVoiceProcessing: vi.fn(),
    switchCamera: vi.fn(),
    setVideoQuality: vi.fn(),
    startScreenShare: vi.fn(),
    startDesktopScreenShare: vi.fn(),
    startDesktopCameraStream: vi.fn(),
    stopScreenShare: vi.fn(),
    getLocalScreenTrack: vi.fn(() => null),
    getLocalCameraTrack: vi.fn(() => null),
    vcYoutubeRemotePlayback: shallowRef(null),
    publishVcYoutubePlaybackSync: vi.fn(),
    vcYoutubePlaybackShouldPublish: computed(() => true),
    effectiveVcActivityKingUserId: computed(() => ''),
  }),
}));

describe('useAppLayoutShellVoice', () => {
  it('does not re-join LiveKit when clicking the same VC you are already in (UI only)', async () => {
    joinVoiceSessionMock.mockClear();
    const activeChannelId = ref('text-1');
    const voiceSideChatCollapsed = ref(true);
    const shellVoice = useAppLayoutShellVoice({
      authSession: {
        backendUser: { id: 'self' },
      } as any,
      workspace: { users: ref([]) } as any,
      selectedServerEcho: computed(() => ({ id: 'server-1' }) as any),
      voiceChannelForParticipants: computed(
        () =>
          ({
            id: 'vc-1',
            name: 'General',
            type: 'voice',
          }) as any,
      ),
      currentVoiceChannelId: ref('vc-1'),
      currentVoiceChannelName: ref('General'),
      vcMuted: ref(false),
      vcDeafened: ref(false),
      micTestListenDeafenActive: ref(false),
      applyVcDeafened: vi.fn(),
      vcVideo: ref(false),
      vcScreenshare: ref(false),
      isScreenSharePickerOpen: ref(false),
      isDesktopStreamingControlOpen: ref(false),
      desktopStreamingControlMode: ref<'screen' | 'camera'>('screen'),
      onJoinVoice: vi.fn(),
      onLeaveVoice: vi.fn(),
      hydrateEchoFromApi: vi.fn(async () => undefined),
      isDmVoiceCallUi: ref(false),
      dmCallIncoming: computed(() => false),
      dmCallRinging: computed(() => false),
      dmCallMuted: ref(false),
      dmCallDeafened: ref(false),
      dmCallVideo: ref(false),
      dmCallScreenshare: ref(false),
      dmCallWithUserId: ref(null),
      dmVoiceJoinTargetId: computed(() => ''),
      groupDMs: ref({}),
      applyDmCallDeafened: vi.fn(),
      endDmCall: vi.fn(async () => undefined),
      leaveDmCallVoice: vi.fn(async () => undefined),
      dmCallLobbyAfterSelfLeave: ref(false),
      isDmUiContext: computed(() => false),
      activeChannelId,
      voiceSideChatCollapsed,
      toggleVoiceSideChat: vi.fn(),
      categoriesForServer: computed(() => []),
      getFirstTextChannelId: vi.fn(() => 'text-1'),
      findChannelContextById: (channelId: string | null | undefined) =>
        channelId === 'vc-1'
          ? ({
              channel: { id: 'vc-1', name: 'General', type: 'voice' },
              category: { channelPermissionDefaults: {} },
            } as any)
          : null,
      roleUi: {
        isRolePreviewActiveForServer: computed(() => false),
      },
      resolvePreviewChannelPermission: vi.fn(() => true),
      isCompactGuildTriPane: computed(() => false),
      vcActivityUi: ref({
        phase: 'closed',
        youtubeVideoId: null,
        youtubeBrowseOpen: true,
        playlist: [],
        currentIndex: 0,
      }),
      applyVcYoutubeWatchTogetherRemote: vi.fn(),
      closeVcActivity: vi.fn(),
    });

    await shellVoice.handleJoinVoiceNavigation({
      channelId: 'vc-1',
      channelName: 'General',
    });

    expect(joinVoiceSessionMock).not.toHaveBeenCalled();
    expect(activeChannelId.value).toBe('vc-1');
    expect(voiceSideChatCollapsed.value).toBe(false);
  });

  it('keeps the voice channel surface open when leaving from inside that voice channel', () => {
    const leaveVoiceSession = vi.fn();
    const activeChannelId = ref('voice-1');

    const shellVoice = useAppLayoutShellVoice({
      authSession: {
        backendUser: { id: 'self' },
      } as any,
      workspace: {
        users: ref([]),
      } as any,
      selectedServerEcho: computed(() => ({ id: 'server-1' }) as any),
      voiceChannelForParticipants: computed(
        () =>
          ({
            id: 'voice-1',
            name: 'Voice',
            type: 'voice',
          }) as any,
      ),
      currentVoiceChannelId: ref('voice-1'),
      currentVoiceChannelName: ref('Voice'),
      vcMuted: ref(false),
      vcDeafened: ref(false),
      micTestListenDeafenActive: ref(false),
      applyVcDeafened: vi.fn(),
      vcVideo: ref(false),
      vcScreenshare: ref(false),
      isScreenSharePickerOpen: ref(false),
      isDesktopStreamingControlOpen: ref(false),
      desktopStreamingControlMode: ref<'screen' | 'camera'>('screen'),
      onJoinVoice: vi.fn(),
      onLeaveVoice: leaveVoiceSession,
      hydrateEchoFromApi: vi.fn(async () => undefined),
      isDmVoiceCallUi: ref(false),
      dmCallIncoming: computed(() => false),
      dmCallRinging: computed(() => false),
      dmCallMuted: ref(false),
      dmCallDeafened: ref(false),
      dmCallVideo: ref(false),
      dmCallScreenshare: ref(false),
      dmCallWithUserId: ref(null),
      dmVoiceJoinTargetId: computed(() => ''),
      groupDMs: ref({}),
      applyDmCallDeafened: vi.fn(),
      endDmCall: vi.fn(async () => undefined),
      leaveDmCallVoice: vi.fn(async () => undefined),
      dmCallLobbyAfterSelfLeave: ref(false),
      isDmUiContext: computed(() => false),
      activeChannelId,
      voiceSideChatCollapsed: ref(false),
      toggleVoiceSideChat: vi.fn(),
      categoriesForServer: computed(() => []),
      getFirstTextChannelId: vi.fn(() => 'text-1'),
      findChannelContextById: (channelId: string | null | undefined) =>
        channelId === 'voice-1'
          ? ({
              channel: { id: 'voice-1', name: 'Voice', type: 'voice' },
              category: { channelPermissionDefaults: {} },
            } as any)
          : null,
      roleUi: {
        isRolePreviewActiveForServer: computed(() => false),
      },
      resolvePreviewChannelPermission: vi.fn(() => true),
      isCompactGuildTriPane: computed(() => false),
      vcActivityUi: ref({
        phase: 'closed',
        youtubeVideoId: null,
        youtubeBrowseOpen: true,
        playlist: [],
        currentIndex: 0,
      }),
      applyVcYoutubeWatchTogetherRemote: vi.fn(),
      closeVcActivity: vi.fn(),
    });

    shellVoice.handleLeaveVoiceNavigation();

    expect(activeChannelId.value).toBe('voice-1');
    expect(leaveVoiceSession).toHaveBeenCalledTimes(1);
  });
});
