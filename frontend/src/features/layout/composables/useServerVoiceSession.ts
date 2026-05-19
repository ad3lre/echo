import {
  computed,
  nextTick,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import type { useAuthSessionStore } from '@/stores/authSession';
import type { WorkspaceStateApi } from '@/composables/workspace/types';
import { createVoiceService } from '@/services/orchestration/voice';
import {
  useLiveKitVoiceRoom,
  type DesktopStreamingPreferences,
  type LiveKitRoomState,
  type LiveKitNetworkStats,
  type VideoQualityPreset,
  type ParticipantAudioLevel,
} from '@/composables/useLiveKitVoiceRoom';
import { voiceClientTrace } from '@/observability/voiceClientTrace';
import { useVcPushToTalk } from '@/composables/useVcPushToTalk';
import type { ChannelSummary } from '@shared/types';
import type { Server } from '@shared/types/server';
import {
  buildVoiceParticipantMediaState,
  canonicalVoiceParticipantIdsForLiveKitRoom,
  mergeVoiceModerationMaps,
} from '@/features/layout/domain/voiceParticipantState';
import { playEchoSound } from '@/composables/useEchoSounds';
import { liveKitRemoteParticipantByIdentity } from '@/services/livekit/liveKitRoomParticipants';
import {
  findEchoVoiceChannelIdContainingUserOnServer,
  resolveEchoServerIdContainingChannel,
} from '@/features/voice/resolveEchoServerIdForGuildChannel';
import { UIErrorBus } from '@/utils/uiErrorBus';
import { isEchoGraphId } from '@/utils/echoIds';
import { resolveGuildMemberDisplayName } from '@/utils/resolveGuildMemberDisplayName';
import {
  buildYoutubeActivityPayload,
  shouldPublishYoutubeWatchTogether,
  withYoutubeWatchTogetherSuppressPublish,
  youtubeWatchTogetherPayloadMatchesLocalUi,
} from '@/features/voice/youtubeWatchTogetherBridge';
import type {
  VcActivityPresenceKind,
  VcActivityUiPhase,
  VcActivityUiState,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';
import { vcActivityPresenceKindsFromUi } from '@/features/voice/vcActivityTypes';
import { prepareGuildVoiceE2eeMediaKey } from '@/services/voice/voiceE2eePrepare';
import type { VcYoutubeRemotePlaybackState } from '@/features/voice/composables/useVcYoutubeWatchTogetherPlayer';
import type {
  EchoCodenamesActivityV1,
  EchoCodenamesAffiliationV1,
  EchoCodenamesClueIntentV1,
  EchoCodenamesEndTurnIntentV1,
  EchoCodenamesKeyToOrchestratorV1,
  EchoCodenamesNewGameIntentV1,
  EchoCodenamesRevealIntentV1,
  EchoCodenamesRoleAssignmentV1,
  EchoCodenamesSetupIntentV1,
  EchoCodenamesSpymasterKeyV1,
  EchoHangmanActivityV1,
  EchoHangmanGuessIntentV1,
  EchoHangmanNextRoundV1,
  EchoHangmanRoundSecretV1,
  EchoTicTacToeActivityV1,
  EchoTicTacToeInviteV1,
  EchoYoutubeActivityV1,
  EchoYoutubePlaybackSyncV1,
} from '@/audio/voiceEchoLiveKitData';
import {
  coerceHangmanActivityToLocalRoster,
  computeHangmanGuessOutcome,
  expectedSetterForRound,
  hangmanMaskForSecretAndGuesses,
  hangmanOrchestratorUserId,
  isNewerHangmanTick,
  mergeHangmanPresenceRoster,
  sanitizeHangmanActivityForMerge,
  validateHangmanSecretWord,
  type HangmanTick,
} from '@/features/voice/vcHangmanReducer';
import {
  applyClue,
  applyDeal,
  applyEndTurn,
  applyNewGameLobby,
  applyReveal,
  applySetupToLobby,
  buildBootstrapLobby,
  codenamesAuthorAllowed,
  coerceCodenamesActivityToLocalRoster,
  isNewerCodenamesTick,
  pickWordsAndKey,
  sanitizeCodenamesActivityForMerge,
  type CodenamesTick,
} from '@/features/voice/vcCodenamesReducer';
import { VC_CODENAMES_WORD_BANK } from '@/features/voice/vcCodenamesWordBank';

/** Workspace row can lag; LiveKit `Participant.metadata` may carry a URL or JSON `{ pfp }`. */
function resolveParticipantPfpFromWorkspaceAndLiveKit(
  workspacePfp: string | undefined,
  rp: { metadata?: string } | undefined,
): string {
  const fromWs = workspacePfp?.trim() ?? '';
  if (fromWs) return fromWs;
  const meta = rp?.metadata?.trim();
  if (!meta) return '';
  if (
    meta.startsWith('http://') ||
    meta.startsWith('https://') ||
    meta.startsWith('/') ||
    meta.startsWith('data:')
  ) {
    return meta;
  }
  try {
    const j = JSON.parse(meta) as {
      pfp?: string;
      avatarUrl?: string;
      avatar?: string;
      profileImage?: string;
      profileImageUrl?: string;
      imageUrl?: string;
      picture?: string;
      photoUrl?: string;
    };
    return (
      j.pfp ??
      j.avatarUrl ??
      j.avatar ??
      j.profileImageUrl ??
      j.profileImage ??
      j.imageUrl ??
      j.picture ??
      j.photoUrl ??
      ''
    ).trim();
  } catch {
    return '';
  }
}

/** After LiveKit reconnects, drop buffered VC activity packets (esp. YouTube) before fresh sync. */
const VC_LK_RECONNECT_QUEUE_FLUSH_MS = 450;
/** Defer full VC data reset on disconnect so brief drops do not wipe Hangman / presence. */
const VC_LK_DISCONNECT_TEARDOWN_MS = 600;

export function useServerVoiceSession(deps: {
  authSession: ReturnType<typeof useAuthSessionStore>;
  workspace: WorkspaceStateApi;
  selectedServer: ComputedRef<Server | undefined>;
  activeChannel: ComputedRef<ChannelSummary | null>;
  currentVoiceChannelId: Ref<string | null>;
  /** Display name for VC reconnect copy; fallback via {@link findChannelContextById}. */
  currentVoiceChannelName: Ref<string>;
  /** Resolve channel metadata when reconnecting after a drop. */
  findChannelContextById: (channelId: string | null | undefined) => {
    channel?: ChannelSummary;
  } | null;
  vcMuted: Ref<boolean>;
  vcDeafened: Ref<boolean>;
  /** Settings mic listen-back: OR into effective LiveKit deafen. */
  micTestListenDeafenActive: Ref<boolean>;
  vcVideo: Ref<boolean>;
  vcScreenshare: Ref<boolean>;
  currentUser: ComputedRef<{ id: string } | undefined>;
  onJoinVoiceUi: (payload: { channelId: string; channelName: string }) => void;
  onLeaveVoiceUi: () => void;
  hydrateWorkspace: () => Promise<void>;
  /**
   * When true (1:1 / group DM call overlay), guild VC mute/video must not drive LiveKit —
   * the layout applies `dmCall*` state instead.
   */
  isDmVoiceCallUi: Ref<boolean>;
  dmCallMuted: Ref<boolean>;
  dmCallDeafened: Ref<boolean>;
  /** DM / group call overlay: local camera on (guild uses {@link vcVideo}). */
  dmCallVideo: Ref<boolean>;
  vcActivityUi: Ref<VcActivityUiState>;
  applyVcYoutubeWatchTogetherRemote: (snapshot: {
    playlist: YoutubePlaylistEntry[];
    currentIndex: number;
    youtubeBrowseOpen?: boolean;
    updatedAt: number;
    activityPhase?: VcActivityUiPhase;
  }) => void;
  /** When the activity host leaves voice, followers reset the activity surface. */
  closeVcActivity: () => void;
}) {
  const {
    authSession,
    workspace,
    selectedServer,
    activeChannel,
    currentVoiceChannelId,
    currentVoiceChannelName,
    findChannelContextById,
    vcMuted,
    vcDeafened,
    micTestListenDeafenActive,
    vcVideo,
    vcScreenshare,
    currentUser,
    onJoinVoiceUi,
    onLeaveVoiceUi,
    hydrateWorkspace,
    isDmVoiceCallUi,
    dmCallMuted,
    dmCallDeafened,
    dmCallVideo,
    vcActivityUi,
    applyVcYoutubeWatchTogetherRemote,
    closeVcActivity,
  } = deps;

  const lastAppliedYoutubeAt = ref(0);
  /** Echo user id whose VC activity we mirror; null = self-led (publish). */
  const vcActivitySyncKingUserId = ref<string | null>(null);
  const vcActivitySyncKingDisplayName = ref('');
  const pendingIncomingYoutubeQueue = shallowRef<
    { msg: EchoYoutubeActivityV1; senderIdentity: string }[]
  >([]);
  const vcYoutubeRemotePlayback = shallowRef<VcYoutubeRemotePlaybackState | null>(
    null,
  );
  let handlingIncomingYoutubeActivity = false;

  const vcYoutubePlaybackShouldPublish = computed(
    () => vcActivitySyncKingUserId.value == null,
  );

  const effectiveVcActivityKingUserId = computed(() => {
    const k = vcActivitySyncKingUserId.value?.trim() ?? '';
    if (k) return k;
    const self = currentUser.value?.id?.trim() ?? '';
    if (self && vcActivityUi.value.phase !== 'closed') return self;
    return '';
  });

  function clearVcYoutubeRemotePlayback(): void {
    vcYoutubeRemotePlayback.value = null;
  }

  function applyRemoteYoutubePlaybackFromMsg(msg: EchoYoutubeActivityV1): void {
    const pb = msg.ytPlayback;
    if (!pb || msg.activityPhase !== 'youtube') return;
    vcYoutubeRemotePlayback.value = {
      playing: pb.playing,
      mediaTimeSec: pb.mediaTimeSec,
      wallMs: pb.wallMs,
      updatedAt: msg.updatedAt,
    };
  }

  function resetVcWatchTogetherConsentState(): void {
    vcActivitySyncKingUserId.value = null;
    vcActivitySyncKingDisplayName.value = '';
    pendingIncomingYoutubeQueue.value = [];
    handlingIncomingYoutubeActivity = false;
    clearVcYoutubeRemotePlayback();
  }

  let liveKitVcDataCleanupTimer: ReturnType<typeof setTimeout> | null = null;
  let liveKitReconnectQueueFlushTimer: ReturnType<typeof setTimeout> | null = null;
  /** True after `connected` → `connecting` until reconnect succeeds or VC data is torn down. */
  let liveKitVcReconnectFromConnectedPending = false;

  function clearVcLiveKitScheduledCleanups(): void {
    if (liveKitVcDataCleanupTimer != null) {
      clearTimeout(liveKitVcDataCleanupTimer);
      liveKitVcDataCleanupTimer = null;
    }
    if (liveKitReconnectQueueFlushTimer != null) {
      clearTimeout(liveKitReconnectQueueFlushTimer);
      liveKitReconnectQueueFlushTimer = null;
    }
  }

  /** Drop buffered incoming YouTube / VC activity packets (e.g. after reconnect or mid-drain). */
  function flushPendingIncomingYoutubeQueue(reason: string): void {
    voiceClientTrace('voice.client:vc_youtube_incoming_queue_flush', { reason });
    pendingIncomingYoutubeQueue.value = [];
    handlingIncomingYoutubeActivity = false;
  }

  function applyIncomingYoutubeActivity(msg: EchoYoutubeActivityV1): void {
    lastAppliedYoutubeAt.value = Math.max(
      lastAppliedYoutubeAt.value,
      msg.updatedAt,
    );
    withYoutubeWatchTogetherSuppressPublish(() => {
      applyVcYoutubeWatchTogetherRemote({
        playlist: msg.playlist,
        currentIndex: msg.currentIndex,
        youtubeBrowseOpen: msg.youtubeBrowseOpen,
        updatedAt: msg.updatedAt,
        activityPhase: msg.activityPhase,
      });
    });
  }

  function handleOneIncomingYoutubeActivity(
    msg: EchoYoutubeActivityV1,
    senderIdentity: string,
  ): void {
    const self = currentUser.value?.id?.trim();
    if (!self) return;

    const sid = senderIdentity.trim();
    const fromId = msg.fromUserId.trim();
    if (!fromId || sid !== fromId) return;

    const local = vcActivityUi.value;
    if (msg.updatedAt <= lastAppliedYoutubeAt.value) return;

    const king = vcActivitySyncKingUserId.value?.trim() || null;
    if (king && fromId !== king) return;

    const fromOther = fromId !== self;

    if (msg.activityPhase === 'closed' && fromOther) {
      if (!king || fromId !== king) return;
    }

    if (
      fromOther &&
      !king &&
      local.phase !== 'closed' &&
      local.phase !== 'pick' &&
      !youtubeWatchTogetherPayloadMatchesLocalUi(msg, local)
    ) {
      return;
    }

    if (youtubeWatchTogetherPayloadMatchesLocalUi(msg, local)) {
      lastAppliedYoutubeAt.value = Math.max(
        lastAppliedYoutubeAt.value,
        msg.updatedAt,
      );
      if (fromOther && msg.activityPhase === 'closed' && king === fromId) {
        vcActivitySyncKingUserId.value = null;
        vcActivitySyncKingDisplayName.value = '';
      }
      if (
        fromOther &&
        msg.activityPhase === 'youtube' &&
        msg.ytPlayback &&
        (king == null || king === fromId)
      ) {
        applyRemoteYoutubePlaybackFromMsg(msg);
      }
      return;
    }

    applyIncomingYoutubeActivity(msg);
    if (fromOther) {
      if (msg.activityPhase === 'closed') {
        vcActivitySyncKingUserId.value = null;
        vcActivitySyncKingDisplayName.value = '';
      } else {
        vcActivitySyncKingUserId.value = fromId;
        vcActivitySyncKingDisplayName.value = msg.fromName?.trim() ?? '';
      }
    }
    if (fromOther && msg.activityPhase === 'youtube' && msg.ytPlayback) {
      applyRemoteYoutubePlaybackFromMsg(msg);
    }
  }

  async function drainIncomingYoutubeActivities(
    msg: EchoYoutubeActivityV1,
    senderIdentity: string,
  ): Promise<void> {
    pendingIncomingYoutubeQueue.value = [
      ...pendingIncomingYoutubeQueue.value,
      { msg, senderIdentity },
    ];
    if (handlingIncomingYoutubeActivity) return;
    handlingIncomingYoutubeActivity = true;
    try {
      while (pendingIncomingYoutubeQueue.value.length > 0) {
        const cur = pendingIncomingYoutubeQueue.value.shift();
        if (!cur) break;
        handleOneIncomingYoutubeActivity(cur.msg, cur.senderIdentity);
      }
    } finally {
      handlingIncomingYoutubeActivity = false;
    }
  }

  watch(
    currentVoiceChannelId,
    (id, prev) => {
      const next = id?.trim() ?? '';
      const was = prev?.trim() ?? '';
      if (next === was) return;
      clearVcLiveKitScheduledCleanups();
      liveKitVcReconnectFromConnectedPending = false;
      lastAppliedYoutubeAt.value = 0;
      vcActivitySyncKingUserId.value = null;
      vcActivitySyncKingDisplayName.value = '';
      flushPendingIncomingYoutubeQueue('voice_channel_changed');
    },
  );

  const vcActivityPresenceByUserId = shallowRef(
    new Map<string, VcActivityPresenceKind[]>(),
  );

  function mergePresenceFromRemote(
    identity: string,
    activities: VcActivityPresenceKind[],
  ) {
    const next = new Map(vcActivityPresenceByUserId.value);
    if (activities.length > 0) next.set(identity, [...activities]);
    else next.delete(identity);
    vcActivityPresenceByUserId.value = next;
  }

  function dropPresenceForRemote(identity: string) {
    if (!vcActivityPresenceByUserId.value.has(identity)) return;
    const next = new Map(vcActivityPresenceByUserId.value);
    next.delete(identity);
    vcActivityPresenceByUserId.value = next;
  }

  function clearAllRemotePresence() {
    vcActivityPresenceByUserId.value = new Map();
  }

  const vcHangmanPublic = shallowRef<EchoHangmanActivityV1 | null>(null);
  const vcHangmanLastTick = shallowRef<HangmanTick | null>(null);
  const vcHangmanSecretByRound = shallowRef(new Map<number, string>());
  /** Secret arrived before the guessing snapshot applied locally. */
  const vcHangmanPendingSecretByRound = shallowRef(new Map<number, string>());

  function hangmanRosterFromPresence(): string[] {
    const out = new Set<string>();
    const self = currentUser.value?.id?.trim();
    const ui = vcActivityUi.value;
    if (self && ui.phase === 'hangman') {
      if (vcActivityPresenceKindsFromUi(ui).includes('hangman')) out.add(self);
    }
    for (const [id, acts] of vcActivityPresenceByUserId.value) {
      const uid = id.trim();
      if (!uid) continue;
      if (acts.includes('hangman')) out.add(uid);
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  function nextHangmanRevision(): number {
    return (
      Math.max(
        vcHangmanPublic.value?.revision ?? -1,
        vcHangmanLastTick.value?.revision ?? -1,
      ) + 1
    );
  }

  function hangmanAuthorAllowed(s: EchoHangmanActivityV1): boolean {
    const roster = s.rosterUserIds;
    if (!roster.length) return false;
    const orch = hangmanOrchestratorUserId(roster);
    if (!orch) return false;
    if (s.phase === 'setter_picking') {
      return s.fromUserId === s.setterUserId || s.fromUserId === orch;
    }
    if (s.phase === 'guessing' || s.phase === 'round_over') {
      return s.fromUserId === s.setterUserId || s.fromUserId === orch;
    }
    return false;
  }

  function tryMergeHangmanPendingSecretForRound(st: EchoHangmanActivityV1): void {
    if (st.phase !== 'guessing') return;
    const pending = vcHangmanPendingSecretByRound.value.get(st.roundSeq);
    if (!pending) return;
    const v = validateHangmanSecretWord(pending);
    if (!v.ok) {
      const pn = new Map(vcHangmanPendingSecretByRound.value);
      pn.delete(st.roundSeq);
      vcHangmanPendingSecretByRound.value = pn;
      return;
    }
    if (
      hangmanMaskForSecretAndGuesses(v.normalized, new Set(st.guessedLetters)) !==
      st.mask
    ) {
      return;
    }
    const next = new Map(vcHangmanSecretByRound.value);
    next.set(st.roundSeq, v.normalized);
    vcHangmanSecretByRound.value = next;
    const pn = new Map(vcHangmanPendingSecretByRound.value);
    pn.delete(st.roundSeq);
    vcHangmanPendingSecretByRound.value = pn;
  }

  function receiveHangmanRoundSecret(
    msg: EchoHangmanRoundSecretV1,
    fromIdentity: string,
  ): void {
    if (fromIdentity.trim() !== msg.setterUserId.trim()) return;
    const v = validateHangmanSecretWord(msg.secret);
    if (!v.ok) return;
    const normalized = v.normalized;
    const st = vcHangmanPublic.value;
    if (
      st &&
      st.roundSeq === msg.roundSeq &&
      st.setterUserId.trim() === msg.setterUserId.trim() &&
      st.phase === 'guessing' &&
      hangmanMaskForSecretAndGuesses(normalized, new Set(st.guessedLetters)) ===
        st.mask
    ) {
      const next = new Map(vcHangmanSecretByRound.value);
      next.set(msg.roundSeq, normalized);
      vcHangmanSecretByRound.value = next;
      return;
    }
    const pn = new Map(vcHangmanPendingSecretByRound.value);
    pn.set(msg.roundSeq, normalized);
    vcHangmanPendingSecretByRound.value = pn;
  }

  function tryApplyHangmanRemote(
    msg: EchoHangmanActivityV1,
    identity: string,
  ): void {
    if (msg.fromUserId.trim() !== identity.trim()) return;
    const localR = hangmanRosterFromPresence();
    const coerced = coerceHangmanActivityToLocalRoster(msg, localR);
    const s = sanitizeHangmanActivityForMerge(coerced);
    if (!s) return;
    if (!hangmanAuthorAllowed(s)) return;
    const tick: HangmanTick = { updatedAt: s.updatedAt, revision: s.revision };
    if (!isNewerHangmanTick(tick, vcHangmanLastTick.value)) return;
    vcHangmanLastTick.value = tick;
    vcHangmanPublic.value = s;
    tryMergeHangmanPendingSecretForRound(s);
  }

  const hangmanHandlers: {
    publish: (next: EchoHangmanActivityV1) => void;
    onGuess: (msg: EchoHangmanGuessIntentV1, identity: string) => void;
    onNext: (msg: EchoHangmanNextRoundV1, identity: string) => void;
  } = {
    publish: () => {},
    onGuess: () => {},
    onNext: () => {},
  };

  const vcCodenamesPublic = shallowRef<EchoCodenamesActivityV1 | null>(null);
  const vcCodenamesLastTick = shallowRef<CodenamesTick | null>(null);
  const vcCodenamesOrchKeyByGameSeq = shallowRef(
    new Map<number, EchoCodenamesAffiliationV1[]>(),
  );
  const vcCodenamesSpymasterKeyByGameSeq = shallowRef(
    new Map<number, EchoCodenamesAffiliationV1[]>(),
  );

  let publishCodenamesActivityLocal: (next: EchoCodenamesActivityV1) => void =
    () => {};
  let fanoutCodenamesSpymasterKeys: (opts: {
    gameSeq: number;
    key: EchoCodenamesAffiliationV1[];
    fromUserId: string;
  }) => void = () => {};

  function codenamesRosterFromPresence(): string[] {
    const out = new Set<string>();
    const self = currentUser.value?.id?.trim();
    const ui = vcActivityUi.value;
    if (self && ui.phase === 'codenames') {
      if (vcActivityPresenceKindsFromUi(ui).includes('codenames')) out.add(self);
    }
    for (const [id, acts] of vcActivityPresenceByUserId.value) {
      const uid = id.trim();
      if (!uid) continue;
      if (acts.includes('codenames')) out.add(uid);
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  function nextCodenamesRevision(): number {
    return (
      Math.max(
        vcCodenamesPublic.value?.revision ?? -1,
        vcCodenamesLastTick.value?.revision ?? -1,
      ) + 1
    );
  }

  function tryApplyCodenamesRemote(
    msg: EchoCodenamesActivityV1,
    identity: string,
  ): void {
    if (msg.fromUserId.trim() !== identity.trim()) return;
    const localR = codenamesRosterFromPresence();
    const coerced = coerceCodenamesActivityToLocalRoster(msg, localR);
    const s = sanitizeCodenamesActivityForMerge(coerced);
    if (!s) return;
    const orch = hangmanOrchestratorUserId(localR);
    if (!codenamesAuthorAllowed(s, orch)) return;
    const tick: CodenamesTick = { updatedAt: s.updatedAt, revision: s.revision };
    if (!isNewerCodenamesTick(tick, vcCodenamesLastTick.value)) return;
    vcCodenamesLastTick.value = tick;
    vcCodenamesPublic.value = s;
  }

  function receiveCodenamesSpymasterKey(
    msg: EchoCodenamesSpymasterKeyV1,
    identity: string,
  ): void {
    if (msg.fromUserId.trim() !== identity.trim()) return;
    const st = vcCodenamesPublic.value;
    if (!st || msg.gameSeq !== st.gameSeq) return;
    const orch = hangmanOrchestratorUserId(st.rosterUserIds);
    if (identity.trim() !== orch) return;
    const self = currentUser.value?.id?.trim();
    if (!self) return;
    const isSm = st.roleAssignments.some(
      (r) => r.userId === self && r.role === 'spymaster',
    );
    if (!isSm) return;
    const m = new Map(vcCodenamesSpymasterKeyByGameSeq.value);
    m.set(msg.gameSeq, msg.key);
    vcCodenamesSpymasterKeyByGameSeq.value = m;
  }

  function receiveCodenamesKeyToOrch(
    msg: EchoCodenamesKeyToOrchestratorV1,
    identity: string,
  ): void {
    if (msg.fromUserId.trim() !== identity.trim()) return;
    const self = currentUser.value?.id?.trim();
    if (!self) return;
    const roster = codenamesRosterFromPresence();
    const orch = hangmanOrchestratorUserId(roster);
    if (self !== orch) return;
    const st = vcCodenamesPublic.value;
    if (!st || msg.gameSeq !== st.gameSeq) return;
    const isSm = st.roleAssignments.some(
      (r) => r.userId === msg.fromUserId && r.role === 'spymaster',
    );
    if (!isSm) return;
    const m = new Map(vcCodenamesOrchKeyByGameSeq.value);
    m.set(msg.gameSeq, msg.key);
    vcCodenamesOrchKeyByGameSeq.value = m;
  }

  function processCodenamesClueIntent(
    intent: EchoCodenamesClueIntentV1,
    identity: string,
  ): void {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = currentUser.value?.id?.trim();
    const roster = codenamesRosterFromPresence();
    const orch = hangmanOrchestratorUserId(roster);
    if (!self || self !== orch) return;
    const st = vcCodenamesPublic.value;
    if (!st || intent.gameSeq !== st.gameSeq) return;
    if (!roster.includes(intent.fromUserId.trim())) return;
    const next = applyClue(
      st,
      intent.fromUserId.trim(),
      intent.word,
      intent.number,
      self,
      nextCodenamesRevision(),
    );
    if (!next) return;
    publishCodenamesActivityLocal(next);
  }

  function processCodenamesRevealIntent(
    intent: EchoCodenamesRevealIntentV1,
    identity: string,
  ): void {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = currentUser.value?.id?.trim();
    const roster = codenamesRosterFromPresence();
    const orch = hangmanOrchestratorUserId(roster);
    if (!self || self !== orch) return;
    const st = vcCodenamesPublic.value;
    if (!st || intent.gameSeq !== st.gameSeq) return;
    if (!roster.includes(intent.fromUserId.trim())) return;
    const key = vcCodenamesOrchKeyByGameSeq.value.get(st.gameSeq);
    if (!key) return;
    const next = applyReveal(
      st,
      intent.fromUserId.trim(),
      intent.cardIndex,
      key,
      self,
      nextCodenamesRevision(),
    );
    if (!next) return;
    publishCodenamesActivityLocal(next);
  }

  function processCodenamesEndTurnIntent(
    intent: EchoCodenamesEndTurnIntentV1,
    identity: string,
  ): void {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = currentUser.value?.id?.trim();
    const roster = codenamesRosterFromPresence();
    const orch = hangmanOrchestratorUserId(roster);
    if (!self || self !== orch) return;
    const st = vcCodenamesPublic.value;
    if (!st || intent.gameSeq !== st.gameSeq) return;
    if (!roster.includes(intent.fromUserId.trim())) return;
    const next = applyEndTurn(
      st,
      intent.fromUserId.trim(),
      self,
      nextCodenamesRevision(),
    );
    if (!next) return;
    publishCodenamesActivityLocal(next);
  }

  function processCodenamesSetupIntent(
    intent: EchoCodenamesSetupIntentV1,
    identity: string,
  ): void {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = currentUser.value?.id?.trim();
    const roster = codenamesRosterFromPresence();
    const orch = hangmanOrchestratorUserId(roster);
    if (!self || self !== orch) return;
    const st = vcCodenamesPublic.value;
    if (!st || intent.gameSeq !== st.gameSeq) return;
    if (!roster.includes(intent.fromUserId.trim())) return;
    const next = applySetupToLobby(
      st,
      intent.roleAssignments,
      self,
      nextCodenamesRevision(),
    );
    if (!next) return;
    publishCodenamesActivityLocal(next);
  }

  function processCodenamesNewGameIntent(
    intent: EchoCodenamesNewGameIntentV1,
    identity: string,
  ): void {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = currentUser.value?.id?.trim();
    const roster = codenamesRosterFromPresence();
    const orch = hangmanOrchestratorUserId(roster);
    if (!self || self !== orch) return;
    const st = vcCodenamesPublic.value;
    if (!st) return;
    if (!roster.includes(intent.fromUserId.trim())) return;
    const next = applyNewGameLobby(
      st,
      intent.completedGameSeq,
      self,
      nextCodenamesRevision(),
    );
    if (!next) return;
    const km = new Map(vcCodenamesOrchKeyByGameSeq.value);
    km.delete(st.gameSeq);
    vcCodenamesOrchKeyByGameSeq.value = km;
    const sm = new Map(vcCodenamesSpymasterKeyByGameSeq.value);
    sm.delete(st.gameSeq);
    vcCodenamesSpymasterKeyByGameSeq.value = sm;
    publishCodenamesActivityLocal(next);
  }

  function tryCodenamesBootstrap(): void {
    if (lkRoom?.roomState.value !== 'connected' || isDmVoiceCallUi.value) return;
    if (vcActivityUi.value.phase !== 'codenames') return;
    const roster = codenamesRosterFromPresence();
    if (roster.length < 1) return;
    if (vcCodenamesPublic.value) return;
    const self = currentUser.value?.id?.trim();
    const orch = hangmanOrchestratorUserId(roster);
    if (!self || orch !== self) return;
    publishCodenamesActivityLocal(
      buildBootstrapLobby({
        fromUserId: self,
        rosterUserIds: roster,
        revision: nextCodenamesRevision(),
      }),
    );
  }

  let codenamesBootstrapTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleCodenamesBootstrap(): void {
    if (codenamesBootstrapTimer != null) clearTimeout(codenamesBootstrapTimer);
    codenamesBootstrapTimer = setTimeout(() => {
      codenamesBootstrapTimer = null;
      tryCodenamesBootstrap();
    }, 220);
  }

  const lkRoom = useLiveKitVoiceRoom({
    getUserWantsLocalCamera: () =>
      isDmVoiceCallUi.value ? dmCallVideo.value : vcVideo.value,
    onYoutubeActivity: (msg, senderIdentity) => {
      void drainIncomingYoutubeActivities(msg, senderIdentity);
    },
    onVcActivityPresence: (_msg, identity) => {
      mergePresenceFromRemote(identity, _msg.activities);
    },
    onHangmanActivity: tryApplyHangmanRemote,
    onHangmanGuessIntent: (msg, identity) =>
      hangmanHandlers.onGuess(msg, identity),
    onHangmanNextRound: (msg, identity) =>
      hangmanHandlers.onNext(msg, identity),
    onHangmanRoundSecret: (msg, identity) =>
      receiveHangmanRoundSecret(msg, identity),
    onCodenamesActivity: tryApplyCodenamesRemote,
    onCodenamesSpymasterKey: receiveCodenamesSpymasterKey,
    onCodenamesKeyToOrchestrator: receiveCodenamesKeyToOrch,
    onCodenamesClueIntent: processCodenamesClueIntent,
    onCodenamesRevealIntent: processCodenamesRevealIntent,
    onCodenamesEndTurnIntent: processCodenamesEndTurnIntent,
    onCodenamesSetupIntent: processCodenamesSetupIntent,
    onCodenamesNewGameIntent: processCodenamesNewGameIntent,
    onRemoteParticipantDisconnected: (identity) => {
      dropPresenceForRemote(identity);
      const id = identity.trim();
      const king = vcActivitySyncKingUserId.value?.trim();
      if (king && id === king) {
        flushPendingIncomingYoutubeQueue('watch_together_host_left');
        vcActivitySyncKingUserId.value = null;
        vcActivitySyncKingDisplayName.value = '';
        withYoutubeWatchTogetherSuppressPublish(() => {
          closeVcActivity();
        });
      }
    },
  });

  publishCodenamesActivityLocal = (next: EchoCodenamesActivityV1): void => {
    const tick: CodenamesTick = {
      updatedAt: next.updatedAt,
      revision: next.revision,
    };
    vcCodenamesLastTick.value = tick;
    vcCodenamesPublic.value = next;
    lkRoom?.publishCodenamesActivity(next);
  };

  fanoutCodenamesSpymasterKeys = (opts: {
    gameSeq: number;
    key: EchoCodenamesAffiliationV1[];
    fromUserId: string;
  }): void => {
    const st = vcCodenamesPublic.value;
    if (!st || !lkRoom) return;
    const sm = st.roleAssignments
      .filter((r) => r.role === 'spymaster')
      .map((r) => r.userId.trim())
      .filter(Boolean);
    if (!sm.length) return;
    const now = Date.now();
    lkRoom.publishCodenamesSpymasterKey(
      {
        v: 1,
        t: 'codenames_spymaster_key',
        updatedAt: now,
        fromUserId: opts.fromUserId.trim(),
        gameSeq: opts.gameSeq,
        key: opts.key,
      },
      sm,
    );
  };

  hangmanHandlers.publish = (next: EchoHangmanActivityV1) => {
    const tick: HangmanTick = {
      updatedAt: next.updatedAt,
      revision: next.revision,
    };
    vcHangmanLastTick.value = tick;
    vcHangmanPublic.value = next;
    tryMergeHangmanPendingSecretForRound(next);
    lkRoom?.publishHangmanActivity(next);
  };

  hangmanHandlers.onGuess = (intent, identity) => {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = currentUser.value?.id?.trim();
    const st = vcHangmanPublic.value;
    if (!self || !st || st.phase !== 'guessing') return;
    if (intent.fromUserId === st.setterUserId) return;
    if (intent.roundSeq !== st.roundSeq) return;
    const roster = mergeHangmanPresenceRoster(
      st.rosterUserIds,
      hangmanRosterFromPresence(),
    );
    const orch = hangmanOrchestratorUserId(roster);
    const presence = hangmanRosterFromPresence();
    const orchPresent = !!(orch && presence.includes(orch));
    const applier = orchPresent ? orch! : st.setterUserId.trim();
    if (!applier || self !== applier) return;
    const secret = vcHangmanSecretByRound.value.get(st.roundSeq);
    if (!secret) return;
    const next = computeHangmanGuessOutcome({
      secret,
      guessedLetters: st.guessedLetters,
      letter: intent.letter,
    });
    if (!next) return;
    const guessHistory = [
      ...(st.guessHistory ?? []),
      {
        userId: intent.fromUserId.trim(),
        letter: intent.letter.toUpperCase(),
      },
    ];
    const now = Date.now();
    if (next.status === 'playing') {
      hangmanHandlers.publish({
        v: 1,
        t: 'hangman_activity',
        updatedAt: now,
        revision: nextHangmanRevision(),
        fromUserId: self,
        roundSeq: st.roundSeq,
        setterUserId: st.setterUserId,
        rosterUserIds: roster,
        phase: 'guessing',
        guessedLetters: next.guessedLetters,
        guessHistory,
        wrongCount: next.wrongCount,
        mask: next.mask,
        roundResult: null,
        answerReveal: null,
      });
    } else if (next.status === 'won') {
      hangmanHandlers.publish({
        v: 1,
        t: 'hangman_activity',
        updatedAt: now,
        revision: nextHangmanRevision(),
        fromUserId: self,
        roundSeq: st.roundSeq,
        setterUserId: st.setterUserId,
        rosterUserIds: roster,
        phase: 'round_over',
        guessedLetters: next.guessedLetters,
        guessHistory,
        wrongCount: next.wrongCount,
        mask: next.mask,
        roundResult: 'won',
        answerReveal: null,
      });
    } else {
      hangmanHandlers.publish({
        v: 1,
        t: 'hangman_activity',
        updatedAt: now,
        revision: nextHangmanRevision(),
        fromUserId: self,
        roundSeq: st.roundSeq,
        setterUserId: st.setterUserId,
        rosterUserIds: roster,
        phase: 'round_over',
        guessedLetters: next.guessedLetters,
        guessHistory,
        wrongCount: next.wrongCount,
        mask: next.mask,
        roundResult: 'lost',
        answerReveal: next.answerReveal,
      });
    }
  };

  function hangmanMayApplyNextRoundRequest(requesterUserId: string): boolean {
    const self = currentUser.value?.id?.trim();
    const st = vcHangmanPublic.value;
    if (!self || !st || st.phase !== 'round_over') return false;
    const req = requesterUserId.trim();
    const roster = mergeHangmanPresenceRoster(
      st.rosterUserIds,
      hangmanRosterFromPresence(),
    );
    if (!roster.includes(req)) return false;
    const orch = hangmanOrchestratorUserId(roster);
    if (!orch) return false;
    const presence = hangmanRosterFromPresence();
    const orchInPresence = presence.includes(orch);
    const setter = st.setterUserId.trim();
    if (orchInPresence && self === orch) return true;
    if (!orchInPresence && self === setter) return true;
    return false;
  }

  function advanceHangmanToNextRoundFromRoundOver(
    completedRoundSeq: number,
    tickUpdatedAt: number,
  ): boolean {
    const self = currentUser.value?.id?.trim();
    const st = vcHangmanPublic.value;
    if (!self || !st || st.phase !== 'round_over') return false;
    if (st.roundSeq !== completedRoundSeq) return false;
    const roster = mergeHangmanPresenceRoster(
      st.rosterUserIds,
      hangmanRosterFromPresence(),
    );
    const sm = new Map(vcHangmanSecretByRound.value);
    sm.delete(completedRoundSeq);
    vcHangmanSecretByRound.value = sm;
    const pm = new Map(vcHangmanPendingSecretByRound.value);
    pm.delete(completedRoundSeq);
    vcHangmanPendingSecretByRound.value = pm;
    const nextSeq = completedRoundSeq + 1;
    const nextSetter = expectedSetterForRound(roster, nextSeq);
    if (!nextSetter) return false;
    const now = Math.max(Date.now(), tickUpdatedAt + 1);
    hangmanHandlers.publish({
      v: 1,
      t: 'hangman_activity',
      updatedAt: now,
      revision: nextHangmanRevision(),
      fromUserId: self,
      roundSeq: nextSeq,
      setterUserId: nextSetter,
      rosterUserIds: roster,
      phase: 'setter_picking',
      guessedLetters: [],
      guessHistory: [],
      wrongCount: 0,
      mask: null,
      roundResult: null,
      answerReveal: null,
    });
    return true;
  }

  hangmanHandlers.onNext = (msg, identity) => {
    if (msg.fromUserId.trim() !== identity.trim()) return;
    const st = vcHangmanPublic.value;
    if (!st || st.phase !== 'round_over') return;
    if (msg.completedRoundSeq !== st.roundSeq) return;
    if (!hangmanMayApplyNextRoundRequest(msg.fromUserId)) return;
    void advanceHangmanToNextRoundFromRoundOver(
      msg.completedRoundSeq,
      msg.updatedAt,
    );
  };

  function commitVcHangmanWord(raw: string): string | null {
    const validated = validateHangmanSecretWord(raw);
    if (!validated.ok) return validated.error;
    const self = currentUser.value?.id?.trim();
    const st = vcHangmanPublic.value;
    if (!self || !st || st.phase !== 'setter_picking') {
      return 'Not your turn to pick a word.';
    }
    if (self !== st.setterUserId) return 'Not your turn to pick a word.';
    if (!hangmanRosterFromPresence().includes(self)) {
      return 'Join the activity to pick a word.';
    }
    const mask = hangmanMaskForSecretAndGuesses(
      validated.normalized,
      new Set(),
    );
    const roster = mergeHangmanPresenceRoster(
      st.rosterUserIds,
      hangmanRosterFromPresence(),
    );
    const m = new Map(vcHangmanSecretByRound.value);
    m.set(st.roundSeq, validated.normalized);
    vcHangmanSecretByRound.value = m;
    hangmanHandlers.publish({
      v: 1,
      t: 'hangman_activity',
      updatedAt: Date.now(),
      revision: nextHangmanRevision(),
      fromUserId: self,
      roundSeq: st.roundSeq,
      setterUserId: st.setterUserId,
      rosterUserIds: roster,
      phase: 'guessing',
      guessedLetters: [],
      guessHistory: [],
      wrongCount: 0,
      mask,
      roundResult: null,
      answerReveal: null,
    });
    const orch = hangmanOrchestratorUserId(roster);
    if (orch && orch !== self) {
      lkRoom?.publishHangmanRoundSecret(
        {
          v: 1,
          t: 'hangman_round_secret',
          updatedAt: Date.now(),
          roundSeq: st.roundSeq,
          setterUserId: self,
          secret: validated.normalized,
        },
        [orch],
      );
    }
    return null;
  }

  function requestVcHangmanGuessLetter(letter: string): void {
    const st = vcHangmanPublic.value;
    const self = currentUser.value?.id?.trim();
    if (
      !lkRoom ||
      lkRoom.roomState.value !== 'connected' ||
      isDmVoiceCallUi.value
    )
      return;
    if (!self || !st || st.phase !== 'guessing') return;
    if (self === st.setterUserId) return;
    const L = letter.toUpperCase();
    if (!/^[A-Z]$/.test(L)) return;
    if (st.guessedLetters.includes(L)) return;
    lkRoom.publishHangmanGuessIntent({
      v: 1,
      t: 'hangman_guess_intent',
      updatedAt: Date.now(),
      fromUserId: self,
      roundSeq: st.roundSeq,
      letter: L,
    });
  }

  function requestVcHangmanNextRound(): void {
    const st = vcHangmanPublic.value;
    const self = currentUser.value?.id?.trim();
    if (
      !lkRoom ||
      lkRoom.roomState.value !== 'connected' ||
      isDmVoiceCallUi.value
    )
      return;
    if (!self || !st || st.phase !== 'round_over') return;
    if (hangmanMayApplyNextRoundRequest(self)) {
      void advanceHangmanToNextRoundFromRoundOver(st.roundSeq, Date.now());
      return;
    }
    lkRoom.publishHangmanNextRound({
      v: 1,
      t: 'hangman_next_round',
      updatedAt: Date.now(),
      fromUserId: self,
      completedRoundSeq: st.roundSeq,
    });
  }

  function tryHangmanBootstrap(): void {
    if (lkRoom?.roomState.value !== 'connected' || isDmVoiceCallUi.value)
      return;
    if (vcActivityUi.value.phase !== 'hangman') return;
    const roster = hangmanRosterFromPresence();
    if (roster.length === 0) return;
    if (vcHangmanPublic.value) return;
    const self = currentUser.value?.id?.trim();
    const orch = hangmanOrchestratorUserId(roster);
    if (!self || orch !== self) return;
    const setter = expectedSetterForRound(roster, 0);
    if (!setter) return;
    hangmanHandlers.publish({
      v: 1,
      t: 'hangman_activity',
      updatedAt: Date.now(),
      revision: nextHangmanRevision(),
      fromUserId: self,
      roundSeq: 0,
      setterUserId: setter,
      rosterUserIds: roster,
      phase: 'setter_picking',
      guessedLetters: [],
      guessHistory: [],
      wrongCount: 0,
      mask: null,
      roundResult: null,
      answerReveal: null,
    });
  }

  let hangmanBootstrapTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleHangmanBootstrap(): void {
    if (hangmanBootstrapTimer != null) clearTimeout(hangmanBootstrapTimer);
    hangmanBootstrapTimer = setTimeout(() => {
      hangmanBootstrapTimer = null;
      tryHangmanBootstrap();
    }, 220);
  }

  function getVcActivityPresenceForUser(
    userId: string,
  ): VcActivityPresenceKind[] {
    const self = currentUser.value?.id?.trim();
    if (self && userId === self) {
      return vcActivityPresenceKindsFromUi(vcActivityUi.value);
    }
    return vcActivityPresenceByUserId.value.get(userId) ?? [];
  }

  function resolveWatchTogetherAuthor(): {
    userId: string;
    name?: string;
  } | null {
    const id = currentUser.value?.id?.trim();
    if (!id) return null;
    const u = authSession.backendUser;
    if (!u) return { userId: id };
    const nameRaw =
      ('displayName' in u && typeof u.displayName === 'string'
        ? u.displayName
        : '') ||
      ('username' in u && typeof u.username === 'string' ? u.username : '');
    const name = nameRaw.trim();
    return name ? { userId: id, name } : { userId: id };
  }

  const liveKitState = computed<LiveKitRoomState>(
    () => lkRoom?.roomState.value ?? 'idle',
  );

  function republishVcActivitySnapshotIfHostForLateJoiners() {
    if (liveKitState.value !== 'connected' || isDmVoiceCallUi.value) return;
    if (vcActivitySyncKingUserId.value != null) return;
    if (!shouldPublishYoutubeWatchTogether()) return;
    const v = vcActivityUi.value;
    if (v.phase === 'closed') return;
    if (v.phase === 'codenames') return;
    const who = resolveWatchTogetherAuthor();
    if (!who) return;
    const payload = buildYoutubeActivityPayload(v, who);
    lastAppliedYoutubeAt.value = Math.max(
      lastAppliedYoutubeAt.value,
      payload.updatedAt,
    );
    lkRoom?.publishYoutubeActivity(payload);
  }

  function publishVcYoutubePlaybackSync(sample: EchoYoutubePlaybackSyncV1): void {
    if (liveKitState.value !== 'connected' || isDmVoiceCallUi.value) return;
    if (!vcYoutubePlaybackShouldPublish.value) return;
    if (!shouldPublishYoutubeWatchTogether()) return;
    const who = resolveWatchTogetherAuthor();
    if (!who) return;
    const v = vcActivityUi.value;
    if (v.phase !== 'youtube' || !v.youtubeVideoId) return;
    const payload = buildYoutubeActivityPayload(v, {
      userId: who.userId,
      name: who.name,
      ytPlayback: sample,
    });
    lastAppliedYoutubeAt.value = Math.max(
      lastAppliedYoutubeAt.value,
      payload.updatedAt,
    );
    lkRoom?.publishYoutubeActivity(payload);
  }

  function scheduleVcLiveKitDataTeardownAfterDisconnect(reason: string): void {
    liveKitVcDataCleanupTimer = setTimeout(() => {
      liveKitVcDataCleanupTimer = null;
      liveKitVcReconnectFromConnectedPending = false;
      if (liveKitState.value === 'connected') return;
      lastAppliedYoutubeAt.value = 0;
      resetVcWatchTogetherConsentState();
      clearAllRemotePresence();
      vcHangmanPublic.value = null;
      vcHangmanLastTick.value = null;
      vcHangmanSecretByRound.value = new Map();
      vcHangmanPendingSecretByRound.value = new Map();
      vcCodenamesPublic.value = null;
      vcCodenamesLastTick.value = null;
      vcCodenamesOrchKeyByGameSeq.value = new Map();
      vcCodenamesSpymasterKeyByGameSeq.value = new Map();
      if (hangmanBootstrapTimer != null) {
        clearTimeout(hangmanBootstrapTimer);
        hangmanBootstrapTimer = null;
      }
      if (codenamesBootstrapTimer != null) {
        clearTimeout(codenamesBootstrapTimer);
        codenamesBootstrapTimer = null;
      }
      voiceClientTrace('voice.client:vc_lk_teardown_after_disconnect', {
        state: liveKitState.value,
        reason,
      });
    }, VC_LK_DISCONNECT_TEARDOWN_MS);
  }

  watch(
    () => liveKitState.value,
    (s, prev) => {
      clearVcLiveKitScheduledCleanups();

      if (s === 'connected') {
        liveKitVcReconnectFromConnectedPending = false;
        flushPendingIncomingYoutubeQueue('livekit_connected');
        if (prev !== 'connected') {
          void nextTick(() => republishVcActivitySnapshotIfHostForLateJoiners());
        }
        return;
      }

      // Reconnect: stay on 'connecting' — do not wipe Hangman/presence; only drain stale data queue.
      if (prev === 'connected' && s === 'connecting') {
        liveKitVcReconnectFromConnectedPending = true;
        liveKitReconnectQueueFlushTimer = setTimeout(() => {
          liveKitReconnectQueueFlushTimer = null;
          flushPendingIncomingYoutubeQueue('livekit_reconnect_settled');
        }, VC_LK_RECONNECT_QUEUE_FLUSH_MS);
        return;
      }

      // Real disconnect / error: wait out brief flaps, then tear down synced VC state.
      if (prev === 'connected') {
        scheduleVcLiveKitDataTeardownAfterDisconnect('livekit_left_connected');
        return;
      }

      if (prev === 'connecting' && (s === 'idle' || s === 'error')) {
        if (liveKitVcReconnectFromConnectedPending) {
          liveKitVcReconnectFromConnectedPending = false;
          scheduleVcLiveKitDataTeardownAfterDisconnect('livekit_reconnect_failed');
          return;
        }
        flushPendingIncomingYoutubeQueue('livekit_connect_aborted');
      }
    },
  );

  onScopeDispose(() => {
    clearVcLiveKitScheduledCleanups();
    liveKitVcReconnectFromConnectedPending = false;
  });

  watch(
    () => lkRoom?.remoteParticipants.value.size ?? 0,
    () => {
      if (liveKitState.value === 'connected') {
        void nextTick(() => republishVcActivitySnapshotIfHostForLateJoiners());
      }
    },
  );

  watch(
    vcActivityUi,
    () => {
      if (liveKitState.value !== 'connected' || isDmVoiceCallUi.value) return;
      lkRoom?.publishVcActivityPresence({
        v: 1,
        t: 'vc_activity_presence',
        updatedAt: Date.now(),
        activities: vcActivityPresenceKindsFromUi(vcActivityUi.value),
      });
    },
    { deep: true },
  );

  watch(
    vcActivityUi,
    () => {
      if (liveKitState.value !== 'connected' || isDmVoiceCallUi.value) return;
      if (!shouldPublishYoutubeWatchTogether()) return;
      const who = resolveWatchTogetherAuthor();
      if (!who) return;
      const payload = buildYoutubeActivityPayload(vcActivityUi.value, {
        userId: who.userId,
        name: who.name,
      });
      lastAppliedYoutubeAt.value = Math.max(
        lastAppliedYoutubeAt.value,
        payload.updatedAt,
      );
      lkRoom?.publishYoutubeActivity(payload);
    },
    { deep: true },
  );

  watch(
    () => vcActivityUi.value.phase,
    (phase) => {
      if (phase === 'closed') {
        vcActivitySyncKingUserId.value = null;
        vcActivitySyncKingDisplayName.value = '';
      }
      if (phase !== 'youtube') {
        clearVcYoutubeRemotePlayback();
      }
      if (phase !== 'hangman') {
        vcHangmanSecretByRound.value = new Map();
        vcHangmanPendingSecretByRound.value = new Map();
      }
      if (phase !== 'codenames') {
        vcCodenamesPublic.value = null;
        vcCodenamesLastTick.value = null;
        vcCodenamesOrchKeyByGameSeq.value = new Map();
        vcCodenamesSpymasterKeyByGameSeq.value = new Map();
        if (codenamesBootstrapTimer != null) {
          clearTimeout(codenamesBootstrapTimer);
          codenamesBootstrapTimer = null;
        }
      }
    },
  );

  watch(
    () => ({
      conn: liveKitState.value,
      phase: vcActivityUi.value.phase,
      rosterSig: hangmanRosterFromPresence().join(','),
    }),
    () => {
      scheduleHangmanBootstrap();
    },
    { flush: 'post' },
  );

  watch(
    () => ({
      conn: liveKitState.value,
      phase: vcActivityUi.value.phase,
      rosterSig: codenamesRosterFromPresence().join(','),
    }),
    () => {
      scheduleCodenamesBootstrap();
    },
    { flush: 'post' },
  );

  /** PTT must toggle DM mute state during calls, not guild VC mute. */
  const pttMuted = computed({
    get: () => (isDmVoiceCallUi.value ? dmCallMuted.value : vcMuted.value),
    set: (v) => {
      if (isDmVoiceCallUi.value) dmCallMuted.value = v;
      else vcMuted.value = v;
    },
  });
  const pttDeafened = computed({
    get: () =>
      isDmVoiceCallUi.value ? dmCallDeafened.value : vcDeafened.value,
    set: (v) => {
      if (isDmVoiceCallUi.value) dmCallDeafened.value = v;
      else vcDeafened.value = v;
    },
  });

  const vcPushToTalkEnabled = ref(true);
  useVcPushToTalk({
    liveKitState,
    vcMuted: pttMuted,
    vcDeafened: pttDeafened,
    enabled: vcPushToTalkEnabled,
    inVoiceChannel: () =>
      (isDmVoiceCallUi.value && liveKitState.value === 'connected') ||
      (!!currentVoiceChannelId.value && activeChannel.value?.type === 'voice'),
  });

  const liveKitNetworkStats = computed<LiveKitNetworkStats | null>(
    () => lkRoom?.networkStats.value ?? null,
  );

  const speakingMap = computed<Record<string, ParticipantAudioLevel>>(
    () => lkRoom?.speakingMap.value ?? {},
  );
  const localSpeaking = computed(() => lkRoom?.localSpeaking.value ?? false);
  const localAudioLevel = computed(() => lkRoom?.localAudioLevel.value ?? 0);

  watch(
    () =>
      [
        liveKitState.value,
        vcMuted.value,
        vcDeafened.value,
        micTestListenDeafenActive.value,
      ] as const,
    ([state, muted, deafened, micTestDeafen]) => {
      if (!lkRoom || state !== 'connected') return;
      if (isDmVoiceCallUi.value) return;
      void lkRoom.applyVcAudioState({
        muted,
        deafened: deafened || micTestDeafen,
      });
    },
    { flush: 'post' },
  );

  watch(
    () => vcVideo.value,
    (enabled) => {
      if (isDmVoiceCallUi.value) return;
      if (lkRoom && liveKitState.value === 'connected') {
        void lkRoom.setCameraEnabled(enabled);
      }
    },
  );

  watch(
    () => vcScreenshare.value,
    (enabled) => {
      if (isDmVoiceCallUi.value) return;
      if (lkRoom && liveKitState.value === 'connected') {
        if (enabled === lkRoom.isScreenShareEnabled.value) return;
        void lkRoom.setScreenShareEnabled(enabled);
      }
    },
  );

  if (lkRoom) {
    watch(
      () => lkRoom.isCameraEnabled.value,
      (v) => {
        if (isDmVoiceCallUi.value) return;
        vcVideo.value = v;
      },
    );
    watch(
      () => lkRoom.isScreenShareEnabled.value,
      (v) => {
        if (isDmVoiceCallUi.value) return;
        vcScreenshare.value = v;
      },
    );
    watch(
      () => isDmVoiceCallUi.value,
      (isDm) => {
        if (isDm) return;
        // Reconcile guild UI flags after DM-call overlay exits so stale media
        // intent does not leak back into guild voice chrome.
        vcVideo.value = lkRoom.isCameraEnabled.value;
        vcScreenshare.value = lkRoom.isScreenShareEnabled.value;
      },
      { flush: 'post' },
    );
  }

  function resolveGuildVoiceServerId(channelId: string): string {
    const fromTree = resolveEchoServerIdContainingChannel(
      channelId,
      workspace.categoriesByServer.value,
    );
    const selectedSid = selectedServer.value?.id?.trim() ?? '';
    return (
      (fromTree && isEchoGraphId(fromTree) ? fromTree : '') ||
      (selectedSid && isEchoGraphId(selectedSid) ? selectedSid : '')
    );
  }

  function resolveReconnectChannelName(channelId: string): string {
    const fromUi = currentVoiceChannelName.value?.trim();
    if (fromUi) return fromUi;
    const ctx = findChannelContextById(channelId);
    const n = ctx?.channel?.name?.trim();
    return n || 'Voice';
  }

  /** Bumped on intentional leave so in-flight auto-reconnect loops exit. */
  let vcAutoReconnectEpoch = 0;

  async function guildVoiceE2eePrepare(
    serverId: string,
    channelId: string,
  ): Promise<ArrayBuffer | null> {
    const ctx = findChannelContextById(channelId);
    const ch = ctx?.channel;
    if (!ch?.voiceE2eeEnabled) return null;
    const token = authSession.accessToken?.trim() ?? '';
    const uid = currentUser.value?.id?.trim() ?? '';
    if (!token || !uid) return null;
    let members = [...(ch.accessibleMemberUserIds ?? [])];
    if (members.length === 0) {
      const ids = workspace.serverMemberIds.value[serverId];
      if (Array.isArray(ids)) members = [...ids];
    }
    if (!members.includes(uid)) members.push(uid);
    return prepareGuildVoiceE2eeMediaKey({
      serverId,
      channelId,
      token,
      viewerUserId: uid,
      memberUserIds: members,
    });
  }

  async function runGuildVoiceJoinTransport(channelId: string): Promise<void> {
    const sid = resolveGuildVoiceServerId(channelId);
    const voiceService = createVoiceService({
      authSession,
      workspace,
      workspaceHydrator: { hydrate: hydrateWorkspace },
      liveKit: lkRoom ?? undefined,
      getGuildVoiceE2eeMediaKey: guildVoiceE2eePrepare,
    });
    await voiceService.onJoinVoice(sid, channelId);
  }

  async function onJoinVoice(payload: {
    channelId: string;
    channelName: string;
  }) {
    voiceClientTrace('voice.client:ui_onJoinVoice', {
      channelId: payload.channelId,
      serverId: selectedServer.value?.id,
    });
    onJoinVoiceUi(payload);

    const sid = selectedServer.value?.id;
    const voiceService = createVoiceService({
      authSession,
      workspace,
      workspaceHydrator: { hydrate: hydrateWorkspace },
      liveKit: lkRoom ?? undefined,
      getGuildVoiceE2eeMediaKey: guildVoiceE2eePrepare,
    });
    try {
      await voiceService.onJoinVoice(sid ?? '', payload.channelId);
      playEchoSound('joinVoiceChannel');
    } catch (e) {
      onLeaveVoiceUi();
      throw e;
    }
  }

  function onLeaveVoice() {
    vcAutoReconnectEpoch++;
    const voiceChannelId = currentVoiceChannelId.value?.trim() ?? '';
    const fromTree = resolveEchoServerIdContainingChannel(
      voiceChannelId,
      workspace.categoriesByServer.value,
    );
    const selectedSid = selectedServer.value?.id?.trim() ?? '';
    const sid =
      (fromTree && isEchoGraphId(fromTree) ? fromTree : '') ||
      (selectedSid && isEchoGraphId(selectedSid) ? selectedSid : '');
    voiceClientTrace('voice.client:ui_onLeaveVoice', {
      serverId: sid,
      channelId: voiceChannelId || currentVoiceChannelId.value,
      selectedServerId: selectedSid,
      resolvedFromChannelTree: fromTree,
    });
    playEchoSound('leaveVc');
    onLeaveVoiceUi();

    const voiceService = createVoiceService({
      authSession,
      workspace,
      workspaceHydrator: { hydrate: hydrateWorkspace },
      liveKit: lkRoom ?? undefined,
      getGuildVoiceE2eeMediaKey: guildVoiceE2eePrepare,
    });
    void voiceService.onLeaveVoice(sid);
  }

  const VC_AUTO_RECONNECT_MAX_ATTEMPTS = 8;

  watch(
    () => liveKitState.value,
    async (next, prev) => {
      if (isDmVoiceCallUi.value) return;
      if (next !== 'error' && next !== 'idle') return;
      /** Avoid treating an aborted initial join (`connecting` → `idle`) as a dropped call. */
      const wasInSession =
        prev === 'connected' || (prev === 'connecting' && next === 'error');
      if (!wasInSession) return;

      if (!currentVoiceChannelId.value?.trim()) return;

      try {
        await hydrateWorkspace();
      } catch {
        // Best-effort: reconnect still uses local channel if hydrate fails.
      }

      const uid = currentUser.value?.id?.trim() ?? '';
      let channelId = currentVoiceChannelId.value?.trim() ?? '';
      if (!channelId) return;

      const voiceSid = resolveEchoServerIdContainingChannel(
        channelId,
        workspace.categoriesByServer.value,
      );
      const selectedSid = selectedServer.value?.id?.trim() ?? '';
      const sid =
        (voiceSid && isEchoGraphId(voiceSid) ? voiceSid : '') ||
        (selectedSid && isEchoGraphId(selectedSid) ? selectedSid : '');

      if (sid && uid) {
        const authoritative = findEchoVoiceChannelIdContainingUserOnServer(
          sid,
          uid,
          workspace.categoriesByServer.value,
        );
        if (!authoritative) {
          voiceClientTrace('voice.client:vc_auto_reconnect_no_roster_row', {
            channelId,
            serverId: sid,
          });
          onLeaveVoiceUi();
          return;
        }
        if (authoritative !== channelId) {
          voiceClientTrace('voice.client:vc_auto_reconnect_authoritative', {
            from: channelId,
            to: authoritative,
          });
          currentVoiceChannelId.value = authoritative;
          currentVoiceChannelName.value =
            resolveReconnectChannelName(authoritative);
          channelId = authoritative;
        }
      }

      const epoch = ++vcAutoReconnectEpoch;
      const channelName = resolveReconnectChannelName(channelId);

      voiceClientTrace('voice.client:vc_auto_reconnect_start', {
        channelId,
        channelName,
        prevState: prev,
        nextState: next,
      });

      for (
        let attempt = 1;
        attempt <= VC_AUTO_RECONNECT_MAX_ATTEMPTS;
        attempt++
      ) {
        if (epoch !== vcAutoReconnectEpoch) return;
        if (!currentVoiceChannelId.value?.trim()) return;
        if (isDmVoiceCallUi.value) return;
        if (liveKitState.value === 'connected') return;

        try {
          voiceClientTrace('voice.client:vc_auto_reconnect_attempt', {
            channelId,
            attempt,
          });
          await runGuildVoiceJoinTransport(channelId);
          voiceClientTrace('voice.client:vc_auto_reconnect_ok', {
            channelId,
            attempt,
          });
          return;
        } catch (e) {
          voiceClientTrace('voice.client:vc_auto_reconnect_attempt_failed', {
            channelId,
            attempt,
            err: e instanceof Error ? e.message : String(e),
          });
          if (attempt === VC_AUTO_RECONNECT_MAX_ATTEMPTS) break;
          const backoffMs = Math.min(10_000, 400 * Math.pow(2, attempt - 1));
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }

      if (epoch !== vcAutoReconnectEpoch) return;

      voiceClientTrace('voice.client:vc_auto_reconnect_give_up', { channelId });
      UIErrorBus.emit({
        context: 'voice.reconnect',
        severity: 'error',
        userMessage:
          'Lost voice connection and could not reconnect. You have left the voice channel.',
      });
      onLeaveVoice();
    },
  );

  const activeVoiceChannelParticipants = computed(() => {
    const currentVoiceId = currentVoiceChannelId.value?.trim() ?? '';
    let ch = activeChannel.value;
    // While browsing text (or another surface), keep the connected VC roster so
    // floating voice chrome and stream PiP still see LiveKit/stream state.
    if ((!ch || ch.type !== 'voice') && currentVoiceId) {
      ch = findChannelContextById(currentVoiceId)?.channel ?? null;
    }
    if (!ch || ch.type !== 'voice') return [];
    const channelId = ch.id?.trim() ?? '';
    const voiceGuildSid = resolveEchoServerIdContainingChannel(
      currentVoiceId || null,
      workspace.categoriesByServer.value,
    );
    const ids =
      (ch as { voiceParticipantIds?: string[] }).voiceParticipantIds ?? [];
    const curId = currentUser.value?.id;
    let withMe =
      currentVoiceId === channelId && curId
        ? ids.includes(curId)
          ? ids
          : [...ids, curId]
        : ids;
    if (
      liveKitState.value === 'connected' &&
      currentVoiceId === channelId &&
      lkRoom?.remoteParticipants.value
    ) {
      withMe = canonicalVoiceParticipantIdsForLiveKitRoom(withMe, {
        remoteIdentities: lkRoom.remoteParticipants.value.keys(),
        currentUserId: curId,
        liveKitConnected: liveKitState.value === 'connected',
        channelMatches: currentVoiceId === channelId,
      });
    }
    const { muteMap, deafMap } = mergeVoiceModerationMaps(
      ch.id,
      workspace.vcServerMuteByChannel.value,
      workspace.vcServerDeafenByChannel.value,
      ch.voiceServerMuteByUserId,
      ch.voiceServerDeafenByUserId,
    );

    const remoteMap = lkRoom?.remoteParticipants.value;
    const room = lkRoom?.lkRoom?.value ?? null;

    const participants = withMe.map((id) => {
      const u = workspace.users.value.find((wu) => wu.id === id);
      const rp =
        room && id ? liveKitRemoteParticipantByIdentity(room, id) : undefined;
      const baseName =
        (u?.name && u.name.trim()) ||
        (rp?.name && typeof rp.name === 'string' && rp.name.trim()) ||
        id;
      const displayName = voiceGuildSid
        ? resolveGuildMemberDisplayName({
            serverId: voiceGuildSid,
            userId: id,
            fallbackName: baseName,
            serverMemberNicknames: workspace.serverMemberNicknames.value,
          })
        : baseName;
      const pfp = resolveParticipantPfpFromWorkspaceAndLiveKit(u?.pfp, rp);
      const isCurrentUser = id === curId;
      const serverMuted = !!muteMap[id];
      const serverDeafened = !!deafMap[id];

      const remoteInfo = remoteMap?.get(id);
      const hasLiveKitData = isCurrentUser ? !!lkRoom : !!remoteInfo;

      const lkLocalCameraScreen =
        isCurrentUser && lkRoom
          ? {
              camera: lkRoom.isCameraEnabled.value,
              screen: lkRoom.isScreenShareEnabled.value,
            }
          : null;

      const {
        video,
        streaming,
        simMuted,
        simDeafened,
        cameraTrack,
        screenTrack,
        screenAudioTrack,
      } = buildVoiceParticipantMediaState({
        isCurrentUser,
        remoteInfo,
        lkLocalCameraScreen,
        vcVideo: vcVideo.value,
        vcScreenshare: vcScreenshare.value,
      });

      const deafened = isCurrentUser
        ? serverDeafened || vcDeafened.value
        : serverDeafened || simDeafened;
      const muted = isCurrentUser
        ? serverMuted || serverDeafened || vcMuted.value || vcDeafened.value
        : serverMuted || serverDeafened || simMuted || simDeafened;

      const spk =
        speakingMap.value[id] ?? speakingMap.value[displayName] ?? undefined;
      const speaking = isCurrentUser
        ? localSpeaking.value && !muted
        : (spk?.speaking ?? false) && !muted;
      const audioLevel = isCurrentUser
        ? muted
          ? 0
          : localAudioLevel.value
        : muted
          ? 0
          : (spk?.level ?? 0);

      const activityPresence: VcActivityPresenceKind[] = isCurrentUser
        ? vcActivityPresenceKindsFromUi(vcActivityUi.value)
        : (vcActivityPresenceByUserId.value.get(id) ?? []);

      const kingId = effectiveVcActivityKingUserId.value.trim();

      return {
        id,
        name: displayName,
        pfp,
        muted,
        deafened,
        streaming,
        video,
        serverMuted,
        serverDeafened,
        speaking,
        audioLevel,
        activityPresence,
        isVcActivityKing: !!kingId && id === kingId,
        ...(hasLiveKitData
          ? {
              cameraTrack,
              screenTrack,
              screenAudioTrack,
            }
          : {}),
      };
    });

    function rank(p: (typeof participants)[number]) {
      if (p.streaming) return 4;
      if (p.video) return 3;
      if (p.deafened) return 0;
      if (p.muted) return 1;
      return 2;
    }

    return participants.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return rb - ra;
      return a.name.localeCompare(b.name);
    });
  });

  function switchCamera(deviceId: string) {
    lkRoom?.switchCamera(deviceId);
  }

  function setVideoQuality(preset: VideoQualityPreset) {
    void lkRoom?.setVideoQuality(preset);
  }

  function switchMicDevice(deviceId: string) {
    void lkRoom?.switchMicDevice(deviceId);
  }

  function switchSpeakerDevice(deviceId: string) {
    void lkRoom?.switchSpeakerDevice(deviceId);
  }

  function setLkOutputVolume(volumePercent: number) {
    lkRoom?.setOutputVolume(volumePercent);
  }

  function setLkInputVolume(volumePercent: number) {
    lkRoom?.setLocalInputVolume(volumePercent);
  }

  function setDesktopStreamingPreferences(
    patch: Partial<DesktopStreamingPreferences>,
  ) {
    lkRoom?.setDesktopStreamingPreferences(patch);
  }

  function requestVcCodenamesSetup(
    assignments: EchoCodenamesRoleAssignmentV1[],
  ): void {
    const self = currentUser.value?.id?.trim();
    if (
      !lkRoom ||
      lkRoom.roomState.value !== 'connected' ||
      isDmVoiceCallUi.value
    )
      return;
    if (!self) return;
    const st = vcCodenamesPublic.value;
    if (!st) return;
    lkRoom.publishCodenamesSetupIntent({
      v: 1,
      t: 'codenames_setup_intent',
      updatedAt: Date.now(),
      fromUserId: self,
      gameSeq: st.gameSeq,
      roleAssignments: assignments,
    });
  }

  function commitVcCodenamesDeal(): string | null {
    const self = currentUser.value?.id?.trim();
    const roster = codenamesRosterFromPresence();
    const orch = hangmanOrchestratorUserId(roster);
    if (!self || self !== orch) return 'Only the session host can deal cards.';
    const st = vcCodenamesPublic.value;
    if (!st || st.phase !== 'lobby') return 'Game is not ready to deal.';
    if (!st.roleAssignments.length) return 'Assign roles first.';
    const { words, key, startingTeam } = pickWordsAndKey({
      wordBank: VC_CODENAMES_WORD_BANK,
      gameSeq: st.gameSeq,
      channelSalt: currentVoiceChannelId.value?.trim() ?? 'vc',
      rosterUserIdsSorted: st.rosterUserIds,
    });
    const next = applyDeal(
      st,
      words,
      key,
      startingTeam,
      self,
      nextCodenamesRevision(),
    );
    if (!next) return 'Could not deal.';
    const km = new Map(vcCodenamesOrchKeyByGameSeq.value);
    km.set(st.gameSeq, key);
    vcCodenamesOrchKeyByGameSeq.value = km;
    publishCodenamesActivityLocal(next);
    fanoutCodenamesSpymasterKeys({
      gameSeq: st.gameSeq,
      key,
      fromUserId: self,
    });
    return null;
  }

  function requestVcCodenamesClue(word: string, number: number): void {
    const self = currentUser.value?.id?.trim();
    if (
      !lkRoom ||
      lkRoom.roomState.value !== 'connected' ||
      isDmVoiceCallUi.value
    )
      return;
    if (!self) return;
    const st = vcCodenamesPublic.value;
    if (!st) return;
    lkRoom.publishCodenamesClueIntent({
      v: 1,
      t: 'codenames_clue_intent',
      updatedAt: Date.now(),
      fromUserId: self,
      gameSeq: st.gameSeq,
      word,
      number,
    });
  }

  function requestVcCodenamesReveal(cardIndex: number): void {
    const self = currentUser.value?.id?.trim();
    if (
      !lkRoom ||
      lkRoom.roomState.value !== 'connected' ||
      isDmVoiceCallUi.value
    )
      return;
    if (!self) return;
    const st = vcCodenamesPublic.value;
    if (!st) return;
    lkRoom.publishCodenamesRevealIntent({
      v: 1,
      t: 'codenames_reveal_intent',
      updatedAt: Date.now(),
      fromUserId: self,
      gameSeq: st.gameSeq,
      cardIndex,
    });
  }

  function requestVcCodenamesEndTurn(): void {
    const self = currentUser.value?.id?.trim();
    if (
      !lkRoom ||
      lkRoom.roomState.value !== 'connected' ||
      isDmVoiceCallUi.value
    )
      return;
    if (!self) return;
    const st = vcCodenamesPublic.value;
    if (!st) return;
    lkRoom.publishCodenamesEndTurnIntent({
      v: 1,
      t: 'codenames_end_turn_intent',
      updatedAt: Date.now(),
      fromUserId: self,
      gameSeq: st.gameSeq,
    });
  }

  function requestVcCodenamesNewGame(): void {
    const self = currentUser.value?.id?.trim();
    if (
      !lkRoom ||
      lkRoom.roomState.value !== 'connected' ||
      isDmVoiceCallUi.value
    )
      return;
    if (!self) return;
    const st = vcCodenamesPublic.value;
    if (!st) return;
    lkRoom.publishCodenamesNewGameIntent({
      v: 1,
      t: 'codenames_new_game_intent',
      updatedAt: Date.now(),
      fromUserId: self,
      completedGameSeq: st.gameSeq,
    });
  }

  function requestVcCodenamesPushKeyToOrchestrator(): void {
    const self = currentUser.value?.id?.trim();
    if (
      !lkRoom ||
      lkRoom.roomState.value !== 'connected' ||
      isDmVoiceCallUi.value
    )
      return;
    if (!self) return;
    const st = vcCodenamesPublic.value;
    if (!st || st.phase !== 'playing') return;
    const orch = hangmanOrchestratorUserId(codenamesRosterFromPresence());
    if (!orch || orch === self) return;
    const isSm = st.roleAssignments.some(
      (r) => r.userId === self && r.role === 'spymaster',
    );
    if (!isSm) return;
    const key = vcCodenamesSpymasterKeyByGameSeq.value.get(st.gameSeq);
    if (!key?.length) return;
    lkRoom.publishCodenamesKeyToOrchestrator(
      {
        v: 1,
        t: 'codenames_key_to_orch',
        updatedAt: Date.now(),
        fromUserId: self,
        gameSeq: st.gameSeq,
        key,
      },
      [orch],
    );
  }

  const vcTicTacToeActivity = computed<EchoTicTacToeActivityV1 | null>(() => null);
  const vcTicTacToePendingInvite = computed<EchoTicTacToeInviteV1 | null>(
    () => null,
  );
  function sendVcTicTacToeChallenge(_toUserId: string): void {}
  function respondVcTicTacToeInvite(_accept: boolean): void {
    void _accept;
  }
  function dismissVcTicTacToeInvite(): void {}
  function requestVcTicTacToeMove(_cellIndex: number): void {
    void _cellIndex;
  }
  function requestVcTicTacToeRematch(): void {}

  return {
    onJoinVoice,
    onLeaveVoice,
    getVcActivityPresenceForUser,
    vcHangmanActivity: computed(() => vcHangmanPublic.value),
    hangmanRosterUserIds: computed(() => hangmanRosterFromPresence()),
    vcCodenamesActivity: computed(() => vcCodenamesPublic.value),
    codenamesRosterUserIds: computed(() => codenamesRosterFromPresence()),
    vcCodenamesSpymasterKey: computed(() => {
      const st = vcCodenamesPublic.value;
      const self = currentUser.value?.id?.trim();
      if (!st || !self) return null;
      const isSm = st.roleAssignments.some(
        (r) => r.userId === self && r.role === 'spymaster',
      );
      if (!isSm) return null;
      return vcCodenamesSpymasterKeyByGameSeq.value.get(st.gameSeq) ?? null;
    }),
    commitVcCodenamesDeal,
    requestVcCodenamesSetup,
    requestVcCodenamesClue,
    requestVcCodenamesReveal,
    requestVcCodenamesEndTurn,
    requestVcCodenamesNewGame,
    requestVcCodenamesPushKeyToOrchestrator,
    commitVcHangmanWord,
    requestVcHangmanGuessLetter,
    requestVcHangmanNextRound,
    vcTicTacToeActivity,
    vcTicTacToePendingInvite,
    sendVcTicTacToeChallenge,
    respondVcTicTacToeInvite,
    dismissVcTicTacToeInvite,
    requestVcTicTacToeMove,
    requestVcTicTacToeRematch,
    activeVoiceChannelParticipants,
    liveKitState,
    liveKitNetworkStats,
    /** Raw LiveKit `Room` ref (for advanced UI). */
    lkRoom: lkRoom?.lkRoom ?? null,
    /** Full `useLiveKitVoiceRoom()` API (connect, disconnect, media). */
    liveKitVoiceApi: lkRoom ?? null,
    vcYoutubeRemotePlayback,
    publishVcYoutubePlaybackSync,
    vcYoutubePlaybackShouldPublish,
    effectiveVcActivityKingUserId,
    isCameraEnabled: lkRoom?.isCameraEnabled ?? computed(() => false),
    isScreenShareEnabled: lkRoom?.isScreenShareEnabled ?? computed(() => false),
    selectedCameraDeviceId:
      lkRoom?.selectedCameraDeviceId ?? computed(() => ''),
    videoQuality:
      lkRoom?.videoQuality ?? computed(() => '720p' as VideoQualityPreset),
    remoteParticipants: lkRoom?.remoteParticipants ?? computed(() => new Map()),
    switchCamera,
    setVideoQuality,
    speakingMap,
    localSpeaking,
    localAudioLevel,
    switchMicDevice,
    switchSpeakerDevice,
    setLkOutputVolume,
    setLkInputVolume,
    desktopStreamingPreferences:
      lkRoom?.desktopStreamingPreferences ??
      computed(
        () =>
          ({
            screenQuality: '720p30',
            screenContentHint: 'detail',
            screenIncludeAudio: true,
            cameraQuality: '720p',
          }) as DesktopStreamingPreferences,
      ),
    setDesktopStreamingPreferences,
    reapplyVoiceProcessing: () =>
      lkRoom?.reapplyVoiceProcessing() ?? Promise.resolve(),
    startScreenShare: (opts: {
      quality: '1080p60' | '720p30' | '720p15' | 'auto';
      audio: boolean;
      contentHint: 'motion' | 'detail';
    }) => {
      void lkRoom?.startScreenShare(opts);
    },
    startDesktopScreenShare: (patch?: Partial<DesktopStreamingPreferences>) => {
      void lkRoom?.startDesktopScreenShare(patch);
    },
    startDesktopCameraStream: (
      patch?: Partial<DesktopStreamingPreferences>,
    ) => {
      void lkRoom?.startDesktopCameraStream(patch);
    },
    stopScreenShare: () => lkRoom?.stopScreenShare(),
    getLocalScreenTrack: () => lkRoom?.getLocalScreenTrack() ?? null,
    getLocalCameraTrack: () => lkRoom?.getLocalCameraTrack() ?? null,
  };
}
