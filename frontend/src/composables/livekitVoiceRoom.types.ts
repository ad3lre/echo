import type { ComputedRef, Ref } from 'vue';
import type { RemoteTrack, Room as LKRoom } from 'livekit-client';
import type {
  EchoCodenamesActivityV1,
  EchoCodenamesClueIntentV1,
  EchoCodenamesDealIntentV1,
  EchoCodenamesEndTurnIntentV1,
  EchoCodenamesKeyToOrchestratorV1,
  EchoCodenamesNewGameIntentV1,
  EchoCodenamesRevealIntentV1,
  EchoCodenamesSetupIntentV1,
  EchoCodenamesSpymasterKeyV1,
  EchoHangmanActivityV1,
  EchoHangmanGuessIntentV1,
  EchoHangmanNextRoundV1,
  EchoHangmanRoundSecretV1,
  EchoSkrigglesActivityV1,
  EchoSkrigglesCanvasCmdV1,
  EchoSkrigglesCanvasSnapshotV1,
  EchoSkrigglesGuessIntentV1,
  EchoSkrigglesNextRoundIntentV1,
  EchoSkrigglesRoundSecretV1,
  EchoSkrigglesSettingsIntentV1,
  EchoSkrigglesStartIntentV1,
  EchoSkrigglesStrokeBatchV1,
  EchoSkrigglesWordChoiceIntentV1,
  EchoVcActivityPresenceV1,
  EchoYoutubeActivityV1,
} from '@/audio/voiceEchoLiveKitData';

/**
 * Voice E2EE v2 connect input: the initial MLS epoch media key plus the keyring
 * index it must be installed at (`epoch % keyringSize`). Subsequent epochs are
 * rotated in-band via {@link LiveKitVoiceRoomApi.rotateEpochKey} without a
 * reconnect. A bare `ArrayBuffer` is the legacy v1 static-key form (index 0).
 */
export type EchoVoiceE2eeConnectInput = {
  initialKey: ArrayBuffer;
  keyIndex: number;
};

export type LiveKitRoomState = 'idle' | 'connecting' | 'connected' | 'error';

export type LiveKitNetworkStats = {
  latencyMs: number;
  jitterMs: number;
  packetLossPct: number;
  bitrateKbps: number;
  codec: string;
  /** When unknown (e.g. SFU region not exposed), omitted. */
  serverRegion?: string;
  /** Outbound video (screen share / camera) — from getRTCStatsReport when available. */
  videoFramesPerSecond?: number;
  videoNackCount?: number;
  videoFirCount?: number;
  videoPliCount?: number;
  videoQualityLimitationReason?: string;
};

export type VideoQualityPreset = '720p' | '480p' | '360p' | '180p';

export type ParticipantAudioLevel = {
  level: number;
  speaking: boolean;
};

export type RemoteParticipantTrackInfo = {
  isCameraEnabled: boolean;
  isScreenShareEnabled: boolean;
  isMicEnabled: boolean;
  cameraTrack: RemoteTrack | null;
  screenTrack: RemoteTrack | null;
  screenAudioTrack: RemoteTrack | null;
};

export type DesktopStreamingControlMode = 'screen' | 'camera';

export type DesktopStreamingPreferences = {
  screenQuality: '1080p60' | '720p30' | '720p15' | 'auto';
  screenContentHint: 'motion' | 'detail';
  screenIncludeAudio: boolean;
  cameraQuality: VideoQualityPreset;
};

export type LiveKitVoiceInitialAudioState = {
  muted: boolean;
  deafened: boolean;
};

export type LiveKitVoiceConnectOptions = {
  /**
   * Applied immediately after LiveKit signaling connects, before attempting to
   * publish the microphone. This lets "join muted" avoid browser mic prompts.
   */
  initialAudioState?: LiveKitVoiceInitialAudioState;
};

export type UseLiveKitVoiceRoomOptions = {
  /**
   * When set, quality restarts and camera-switch fallbacks only call
   * `setCameraEnabled(true)` if this is true — matches in-call / DM video toggles
   * so we never re-acquire the camera (laptop LED) after the user turned video off.
   */
  getUserWantsLocalCamera?: () => boolean;
  /** Optional: aggregate RTC QoS to Echo API (caller should throttle, e.g. 30s). */
  onNetworkStatsSample?: (stats: LiveKitNetworkStats) => void;
  /** Guild VC YouTube “watch together” — incoming playlist snapshots from peers. */
  onYoutubeActivity?: (
    msg: EchoYoutubeActivityV1,
    senderIdentity: string,
  ) => void;
  /** Guild VC Hangman — authoritative snapshots from the current setter. */
  onHangmanActivity?: (
    msg: EchoHangmanActivityV1,
    fromIdentity: string,
  ) => void;
  onHangmanGuessIntent?: (
    msg: EchoHangmanGuessIntentV1,
    fromIdentity: string,
  ) => void;
  onHangmanNextRound?: (
    msg: EchoHangmanNextRoundV1,
    fromIdentity: string,
  ) => void;
  /** Setter → orchestrator: phrase for the current round (private data channel). */
  onHangmanRoundSecret?: (
    msg: EchoHangmanRoundSecretV1,
    fromIdentity: string,
  ) => void;
  onCodenamesActivity?: (
    msg: EchoCodenamesActivityV1,
    fromIdentity: string,
  ) => void;
  onCodenamesSpymasterKey?: (
    msg: EchoCodenamesSpymasterKeyV1,
    fromIdentity: string,
  ) => void;
  onCodenamesKeyToOrchestrator?: (
    msg: EchoCodenamesKeyToOrchestratorV1,
    fromIdentity: string,
  ) => void;
  onCodenamesClueIntent?: (
    msg: EchoCodenamesClueIntentV1,
    fromIdentity: string,
  ) => void;
  onCodenamesRevealIntent?: (
    msg: EchoCodenamesRevealIntentV1,
    fromIdentity: string,
  ) => void;
  onCodenamesEndTurnIntent?: (
    msg: EchoCodenamesEndTurnIntentV1,
    fromIdentity: string,
  ) => void;
  onCodenamesSetupIntent?: (
    msg: EchoCodenamesSetupIntentV1,
    fromIdentity: string,
  ) => void;
  onCodenamesDealIntent?: (
    msg: EchoCodenamesDealIntentV1,
    fromIdentity: string,
  ) => void;
  onCodenamesNewGameIntent?: (
    msg: EchoCodenamesNewGameIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesActivity?: (
    msg: EchoSkrigglesActivityV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesGuessIntent?: (
    msg: EchoSkrigglesGuessIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesWordChoiceIntent?: (
    msg: EchoSkrigglesWordChoiceIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesSettingsIntent?: (
    msg: EchoSkrigglesSettingsIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesStartIntent?: (
    msg: EchoSkrigglesStartIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesNextRoundIntent?: (
    msg: EchoSkrigglesNextRoundIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesRoundSecret?: (
    msg: EchoSkrigglesRoundSecretV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesStrokeBatch?: (
    msg: EchoSkrigglesStrokeBatchV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesCanvasCmd?: (
    msg: EchoSkrigglesCanvasCmdV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesCanvasSnapshot?: (
    msg: EchoSkrigglesCanvasSnapshotV1,
    fromIdentity: string,
  ) => void;
  /** Guild VC activity picker / YouTube — who has which activity open. */
  onVcActivityPresence?: (
    msg: EchoVcActivityPresenceV1,
    fromIdentity: string,
  ) => void;
  /** LiveKit peer left — drop stale activity presence. */
  onRemoteParticipantDisconnected?: (identity: string) => void;
};

export type LiveKitVoiceRoomApi = {
  roomState: Ref<LiveKitRoomState>;
  lkRoom: Ref<LKRoom | null>;
  networkStats: Ref<LiveKitNetworkStats | null>;
  connect: (
    url: string,
    token: string,
    bitrateBps?: number | null,
    e2eeMediaKey?: ArrayBuffer | EchoVoiceE2eeConnectInput | null,
    options?: LiveKitVoiceConnectOptions,
  ) => Promise<void>;
  disconnect: () => void;
  /**
   * Voice E2EE v2: install a new MLS-derived epoch key at its keyring index
   * without reconnecting. No-op if the room is not E2EE-enabled.
   */
  rotateEpochKey: (raw: ArrayBuffer, keyIndex: number) => Promise<void>;
  applyVcAudioState: (opts: {
    muted: boolean;
    deafened: boolean;
  }) => Promise<void>;
  isCameraEnabled: Ref<boolean>;
  isScreenShareEnabled: Ref<boolean>;
  selectedCameraDeviceId: Ref<string>;
  videoQuality: Ref<VideoQualityPreset>;
  remoteParticipants: ComputedRef<Map<string, RemoteParticipantTrackInfo>>;
  speakingMap: Ref<Record<string, ParticipantAudioLevel>>;
  localSpeaking: Ref<boolean>;
  localAudioLevel: Ref<number>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  setScreenShareEnabled: (enabled: boolean) => Promise<void>;
  startScreenShare: (opts: {
    quality: '1080p60' | '720p30' | '720p15' | 'auto';
    audio: boolean;
    contentHint: 'motion' | 'detail';
  }) => Promise<void>;
  stopScreenShare: () => Promise<void>;
  getLocalScreenTrack: () => unknown | null;
  getLocalCameraTrack: () => unknown | null;
  switchCamera: (deviceId: string) => void;
  setVideoQuality: (preset: VideoQualityPreset) => Promise<void>;
  desktopStreamingPreferences: Ref<DesktopStreamingPreferences>;
  setDesktopStreamingPreferences: (
    patch: Partial<DesktopStreamingPreferences>,
  ) => void;
  startDesktopScreenShare: (
    patch?: Partial<DesktopStreamingPreferences>,
  ) => Promise<void>;
  startDesktopCameraStream: (
    patch?: Partial<DesktopStreamingPreferences>,
  ) => Promise<void>;
  switchMicDevice: (deviceId: string) => Promise<void>;
  switchSpeakerDevice: (deviceId: string) => Promise<void>;
  setOutputVolume: (volumePercent: number) => void;
  setLocalInputVolume: (volumePercent: number) => void;
  /** Per-remote-user playback level (0–200, default 100), multiplied with global output gain. */
  getRemoteParticipantVolume: (userId: string) => number;
  setRemoteParticipantVolume: (userId: string, volumePercent: number) => void;
  reapplyVoiceProcessing: () => Promise<void>;
  /** Re-sync mic monitor, playback context, and publish state after focus / device changes. */
  recoverVoiceMediaSession: (opts: {
    muted: boolean;
    deafened: boolean;
  }) => Promise<void>;
  /** Publish guild VC YouTube activity state to peers (reliable data channel). */
  publishYoutubeActivity: (payload: EchoYoutubeActivityV1) => void;
  publishVcActivityPresence: (payload: EchoVcActivityPresenceV1) => void;
  publishHangmanActivity: (payload: EchoHangmanActivityV1) => void;
  publishHangmanGuessIntent: (payload: EchoHangmanGuessIntentV1) => void;
  publishHangmanNextRound: (payload: EchoHangmanNextRoundV1) => void;
  publishHangmanRoundSecret: (
    payload: EchoHangmanRoundSecretV1,
    destinationIdentities: string[],
  ) => void;
  publishCodenamesActivity: (payload: EchoCodenamesActivityV1) => void;
  publishCodenamesSpymasterKey: (
    payload: EchoCodenamesSpymasterKeyV1,
    destinationIdentities: string[],
  ) => void;
  publishCodenamesKeyToOrchestrator: (
    payload: EchoCodenamesKeyToOrchestratorV1,
    destinationIdentities: string[],
  ) => void;
  publishCodenamesClueIntent: (payload: EchoCodenamesClueIntentV1) => void;
  publishCodenamesRevealIntent: (payload: EchoCodenamesRevealIntentV1) => void;
  publishCodenamesEndTurnIntent: (
    payload: EchoCodenamesEndTurnIntentV1,
  ) => void;
  publishCodenamesSetupIntent: (payload: EchoCodenamesSetupIntentV1) => void;
  publishCodenamesDealIntent: (payload: EchoCodenamesDealIntentV1) => void;
  publishCodenamesNewGameIntent: (
    payload: EchoCodenamesNewGameIntentV1,
  ) => void;
  publishSkrigglesActivity: (payload: EchoSkrigglesActivityV1) => void;
  publishSkrigglesGuessIntent: (payload: EchoSkrigglesGuessIntentV1) => void;
  publishSkrigglesWordChoiceIntent: (
    payload: EchoSkrigglesWordChoiceIntentV1,
  ) => void;
  publishSkrigglesSettingsIntent: (
    payload: EchoSkrigglesSettingsIntentV1,
  ) => void;
  publishSkrigglesStartIntent: (payload: EchoSkrigglesStartIntentV1) => void;
  publishSkrigglesNextRoundIntent: (
    payload: EchoSkrigglesNextRoundIntentV1,
  ) => void;
  publishSkrigglesRoundSecret: (
    payload: EchoSkrigglesRoundSecretV1,
    destinationIdentities: string[],
  ) => void;
  publishSkrigglesStrokeBatch: (payload: EchoSkrigglesStrokeBatchV1) => void;
  publishSkrigglesCanvasCmd: (payload: EchoSkrigglesCanvasCmdV1) => void;
  publishSkrigglesCanvasSnapshot: (
    payload: EchoSkrigglesCanvasSnapshotV1,
  ) => void;
};
