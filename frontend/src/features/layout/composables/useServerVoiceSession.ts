import {
  computed,
  nextTick,
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
import { resolveEchoServerIdContainingChannel } from '@/features/voice/resolveEchoServerIdForGuildChannel';
import { UIErrorBus } from '@/utils/uiErrorBus';
import { isEchoGraphId } from '@/utils/echoIds';
import { resolveGuildMemberDisplayName } from '@/utils/resolveGuildMemberDisplayName';
import {
  buildYoutubeActivityPayload,
  shouldAcceptStaleYoutubeActivityForCodenamesRoomUrl,
  shouldPublishYoutubeWatchTogether,
  withYoutubeWatchTogetherSuppressPublish,
} from '@/features/voice/youtubeWatchTogetherBridge';
import type {
  VcActivityPresenceKind,
  VcActivityUiPhase,
  VcActivityUiState,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';
import { vcActivityPresenceKindsFromUi } from '@/features/voice/vcActivityTypes';
import { prepareGuildVoiceE2eeMediaKey } from '@/services/voice/voiceE2eePrepare';
import type {
  EchoHangmanActivityV1,
  EchoHangmanGuessIntentV1,
  EchoHangmanNextRoundV1,
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
    codenamesRoomUrl?: string | null;
  }) => void;
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
  } = deps;

  const lastAppliedYoutubeAt = ref(0);
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
    return s.fromUserId === s.setterUserId;
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

  const lkRoom = useLiveKitVoiceRoom({
    getUserWantsLocalCamera: () =>
      isDmVoiceCallUi.value ? dmCallVideo.value : vcVideo.value,
    onYoutubeActivity: (msg) => {
      const local = vcActivityUi.value;
      const acceptStale = shouldAcceptStaleYoutubeActivityForCodenamesRoomUrl({
        msgUpdatedAt: msg.updatedAt,
        lastAppliedUpdatedAt: lastAppliedYoutubeAt.value,
        msg,
        local,
      });
      if (msg.updatedAt <= lastAppliedYoutubeAt.value && !acceptStale) return;
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
          codenamesRoomUrl: msg.codenamesRoomUrl,
        });
      });
    },
    onVcActivityPresence: (_msg, identity) => {
      mergePresenceFromRemote(identity, _msg.activities);
    },
    onHangmanActivity: tryApplyHangmanRemote,
    onHangmanGuessIntent: (msg, identity) =>
      hangmanHandlers.onGuess(msg, identity),
    onHangmanNextRound: (msg, identity) =>
      hangmanHandlers.onNext(msg, identity),
    onRemoteParticipantDisconnected: (identity) => {
      dropPresenceForRemote(identity);
    },
  });

  hangmanHandlers.publish = (next: EchoHangmanActivityV1) => {
    const tick: HangmanTick = {
      updatedAt: next.updatedAt,
      revision: next.revision,
    };
    vcHangmanLastTick.value = tick;
    vcHangmanPublic.value = next;
    lkRoom?.publishHangmanActivity(next);
  };

  hangmanHandlers.onGuess = (intent, identity) => {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = currentUser.value?.id?.trim();
    const st = vcHangmanPublic.value;
    if (!self || !st || st.phase !== 'guessing') return;
    if (self !== st.setterUserId) return;
    if (intent.fromUserId === st.setterUserId) return;
    if (intent.roundSeq !== st.roundSeq) return;
    const secret = vcHangmanSecretByRound.value.get(st.roundSeq);
    if (!secret) return;
    const next = computeHangmanGuessOutcome({
      secret,
      guessedLetters: st.guessedLetters,
      letter: intent.letter,
    });
    if (!next) return;
    const now = Date.now();
    const roster = mergeHangmanPresenceRoster(
      st.rosterUserIds,
      hangmanRosterFromPresence(),
    );
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
        wrongCount: next.wrongCount,
        mask: next.mask,
        roundResult: 'lost',
        answerReveal: next.answerReveal,
      });
    }
  };

  hangmanHandlers.onNext = (msg, identity) => {
    if (msg.fromUserId.trim() !== identity.trim()) return;
    const self = currentUser.value?.id?.trim();
    const st = vcHangmanPublic.value;
    if (!self || !st || st.phase !== 'round_over') return;
    if (msg.completedRoundSeq !== st.roundSeq) return;
    const roster = mergeHangmanPresenceRoster(
      st.rosterUserIds,
      hangmanRosterFromPresence(),
    );
    if (!roster.includes(msg.fromUserId)) return;
    const orch = hangmanOrchestratorUserId(roster);
    if (!orch || orch !== self) return;
    const nextSeq = st.roundSeq + 1;
    const nextSetter = expectedSetterForRound(roster, nextSeq);
    if (!nextSetter) return;
    const now = Math.max(Date.now(), msg.updatedAt + 1);
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
      wrongCount: 0,
      mask: null,
      roundResult: null,
      answerReveal: null,
    });
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
      wrongCount: 0,
      mask,
      roundResult: null,
      answerReveal: null,
    });
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

  function republishCodenamesRoomIfSynced() {
    if (liveKitState.value !== 'connected' || isDmVoiceCallUi.value) return;
    const v = vcActivityUi.value;
    if (v.phase !== 'codenames' || !v.codenamesRoomUrl?.trim()) return;
    if (!shouldPublishYoutubeWatchTogether()) return;
    const who = resolveWatchTogetherAuthor();
    if (!who) return;
    const payload = buildYoutubeActivityPayload(v, who);
    lastAppliedYoutubeAt.value = Math.max(
      lastAppliedYoutubeAt.value,
      payload.updatedAt,
    );
    lkRoom?.publishYoutubeActivity(payload);
  }

  watch(
    () => liveKitState.value,
    (s, prev) => {
      if (s !== 'connected') {
        lastAppliedYoutubeAt.value = 0;
        clearAllRemotePresence();
        vcHangmanPublic.value = null;
        vcHangmanLastTick.value = null;
        vcHangmanSecretByRound.value = new Map();
        if (hangmanBootstrapTimer != null) {
          clearTimeout(hangmanBootstrapTimer);
          hangmanBootstrapTimer = null;
        }
        return;
      }
      if (prev !== 'connected') {
        void nextTick(() => republishCodenamesRoomIfSynced());
      }
    },
  );

  watch(
    () => lkRoom?.remoteParticipants.value.size ?? 0,
    () => {
      if (liveKitState.value === 'connected') {
        void nextTick(() => republishCodenamesRoomIfSynced());
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
      if (phase !== 'hangman') {
        vcHangmanSecretByRound.value = new Map();
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

      const channelId = currentVoiceChannelId.value?.trim() ?? '';
      if (!channelId) return;

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

  return {
    onJoinVoice,
    onLeaveVoice,
    getVcActivityPresenceForUser,
    vcHangmanActivity: computed(() => vcHangmanPublic.value),
    hangmanRosterUserIds: computed(() => hangmanRosterFromPresence()),
    commitVcHangmanWord,
    requestVcHangmanGuessLetter,
    requestVcHangmanNextRound,
    activeVoiceChannelParticipants,
    liveKitState,
    liveKitNetworkStats,
    /** Raw LiveKit `Room` ref (for advanced UI). */
    lkRoom: lkRoom?.lkRoom ?? null,
    /** Full `useLiveKitVoiceRoom()` API (connect, disconnect, media). */
    liveKitVoiceApi: lkRoom ?? null,
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
