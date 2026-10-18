import { computed, ref, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { emptyWatchTogetherUiFields } from '@/features/voice/vcActivityTypes';
import { useAppLayoutShellVoice } from './useAppLayoutShellVoice';

const joinVoiceSessionMock = vi.hoisted(() => vi.fn());
const runPreflightMock = vi.hoisted(() => vi.fn(async () => 'ready' as const));

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

vi.mock('@/features/settings/uiAudioDevices', () => ({
  useUiAudioDevicesStore: () => ({
    outputSinkId: '',
    inputDeviceId: '',
  }),
}));

vi.mock('@/features/voice/voiceLevels', () => ({
  useVoiceLevelsStore: () => ({
    outputEffectivePercent: 100,
    inputEffectivePercent: 100,
  }),
}));

vi.mock('@/features/voice/cameraPreferences', () => ({
  useCameraPreferencesStore: () => ({
    cameraDeviceId: 'default',
    vcVideoQualityPreset: '720p',
  }),
}));

vi.mock('@/features/voice/voiceJoinMediaPreflightFlow', () => ({
  runVoiceJoinMediaPreflightInteractive: () => runPreflightMock(),
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

function makeShellVoiceDeps(opts?: {
  activeChannelId?: ReturnType<typeof ref<string>>;
  voiceSideChatCollapsed?: ReturnType<typeof ref<boolean>>;
  currentVoiceChannelId?: ReturnType<typeof ref<string | null>>;
  currentVoiceChannelName?: ReturnType<typeof ref<string>>;
  onLeaveVoice?: () => void;
}) {
  const activeChannelId = opts?.activeChannelId ?? ref('text-1');
  const voiceSideChatCollapsed = opts?.voiceSideChatCollapsed ?? ref(true);
  const currentVoiceChannelId =
    opts?.currentVoiceChannelId ?? ref<string | null>(null);
  const currentVoiceChannelName = opts?.currentVoiceChannelName ?? ref('');
  return {
    authSession: {
      backendUser: { id: 'self' },
    } as any,
    workspace: { users: ref([]) } as any,
    selectedServerEcho: computed(() => ({ id: 'server-1' }) as any),
    voiceChannelForParticipants: computed(
      () =>
        ({
          id: currentVoiceChannelId.value ?? 'vc-1',
          name: currentVoiceChannelName.value || 'General',
          type: 'voice',
        }) as any,
    ),
    currentVoiceChannelId,
    currentVoiceChannelName,
    vcMuted: ref(false),
    vcDeafened: ref(false),
    micTestListenDeafenActive: ref(false),
    setMicTestListenDeafen: vi.fn(),
    applyVcDeafened: vi.fn(),
    applyVcMuted: vi.fn(),
    vcVideo: ref(false),
    vcScreenshare: ref(false),
    isScreenSharePickerOpen: ref(false),
    isDesktopStreamingControlOpen: ref(false),
    desktopStreamingControlMode: ref<'screen' | 'camera'>('screen'),
    onJoinVoice: vi.fn(),
    onLeaveVoice: opts?.onLeaveVoice ?? vi.fn(),
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
    applyDmCallMuted: vi.fn(),
    endDmCall: vi.fn(async () => undefined),
    leaveDmCallVoice: vi.fn(async () => undefined),
    dmCallLobbyAfterSelfLeave: ref(false),
    isDmUiContext: computed(() => false),
    activeChannelId,
    voiceSideChatCollapsed,
    toggleVoiceSideChat: vi.fn(),
    categoriesForServer: computed(() => []),
    getFirstTextChannelId: vi.fn(() => 'text-1'),
    findChannelContextById: (channelId: string | null | undefined) => {
      if (channelId === 'vc-1') {
        return {
          channel: { id: 'vc-1', name: 'General', type: 'voice' },
          category: { channelPermissionDefaults: {} },
        } as any;
      }
      if (channelId === 'voice-1') {
        return {
          channel: { id: 'voice-1', name: 'Voice', type: 'voice' },
          category: { channelPermissionDefaults: {} },
        } as any;
      }
      return null;
    },
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
      ...emptyWatchTogetherUiFields(),
    }),
    applyVcYoutubeWatchTogetherRemote: vi.fn(),
    applyVcWatchTogetherRemote: vi.fn(),
    closeVcActivity: vi.fn(),
  };
}

describe('useAppLayoutShellVoice', () => {
  it('does not re-join LiveKit when clicking the same VC you are already in (UI only)', async () => {
    joinVoiceSessionMock.mockClear();
    const activeChannelId = ref('text-1');
    const voiceSideChatCollapsed = ref(true);
    const shellVoice = useAppLayoutShellVoice(
      makeShellVoiceDeps({
        activeChannelId,
        voiceSideChatCollapsed,
        currentVoiceChannelId: ref('vc-1'),
        currentVoiceChannelName: ref('General'),
      }) as any,
    );

    await shellVoice.handleJoinVoiceNavigation({
      channelId: 'vc-1',
      channelName: 'General',
    });

    expect(joinVoiceSessionMock).not.toHaveBeenCalled();
    expect(activeChannelId.value).toBe('vc-1');
    expect(voiceSideChatCollapsed.value).toBe(false);
  });

  it('joins voice without switching the main surface away from the current channel', async () => {
    joinVoiceSessionMock.mockClear();
    joinVoiceSessionMock.mockResolvedValue(undefined);
    runPreflightMock.mockClear();
    runPreflightMock.mockResolvedValue('ready');
    const activeChannelId = ref('text-1');
    const shellVoice = useAppLayoutShellVoice(
      makeShellVoiceDeps({ activeChannelId }) as any,
    );

    await shellVoice.handleJoinVoiceNavigation({
      channelId: 'vc-1',
      channelName: 'General',
    });

    expect(runPreflightMock).toHaveBeenCalled();
    expect(joinVoiceSessionMock).toHaveBeenCalledWith({
      channelId: 'vc-1',
      channelName: 'General',
    });
    expect(activeChannelId.value).toBe('text-1');
    expect(shellVoice.guildVoiceJoinUi.value).toEqual({ status: 'idle' });
  });

  it('keeps the voice channel surface open when leaving from inside that voice channel', () => {
    const leaveVoiceSession = vi.fn();
    const activeChannelId = ref('voice-1');

    const shellVoice = useAppLayoutShellVoice(
      makeShellVoiceDeps({
        activeChannelId,
        voiceSideChatCollapsed: ref(false),
        currentVoiceChannelId: ref('voice-1'),
        currentVoiceChannelName: ref('Voice'),
        onLeaveVoice: leaveVoiceSession,
      }) as any,
    );

    shellVoice.handleLeaveVoiceNavigation();

    expect(activeChannelId.value).toBe('voice-1');
    expect(leaveVoiceSession).toHaveBeenCalledTimes(1);
  });
});
