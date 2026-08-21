import {
  computed,
  shallowRef,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from 'vue';
import type {
  EchoSkrigglesActivityV1,
  EchoSkrigglesCanvasCmdV1,
  EchoSkrigglesCanvasSnapshotV1,
  EchoSkrigglesGuessIntentV1,
  EchoSkrigglesNextRoundIntentV1,
  EchoSkrigglesRoundSecretV1,
  EchoSkrigglesSettingsIntentV1,
  EchoSkrigglesSettingsV1,
  EchoSkrigglesStartIntentV1,
  EchoSkrigglesStrokeBatchV1,
  EchoSkrigglesWordChoiceIntentV1,
} from '@/audio/voiceEchoLiveKitData';
import type { LiveKitVoiceRoomApi } from '@/features/voice/useLiveKitVoiceRoom';
import { normalizeSkrigglesWord } from '@/features/voice/skriggles/vcSkrigglesGuess';
import {
  advanceAfterRoundReveal,
  applyGuessToActivity,
  applyHintIfEligible,
  applySettingsChange,
  applyWordChoice,
  buildInitialSkrigglesLobby,
  coerceSkrigglesActivityToLocalRoster,
  computeSkrigglesGuessOutcome,
  expirePhaseIfNeeded,
  isNewerSkrigglesTick,
  mergeSkrigglesPresenceRoster,
  skrigglesAuthorAllowed,
  skrigglesOrchestratorUserId,
  startGameFromLobby,
  type SkrigglesTick,
  shouldLocalClientApplySkrigglesGuess,
} from '@/features/voice/skriggles/vcSkrigglesReducer';
import type {
  VcActivityUiPhase,
  VcActivityUiState,
} from '@/features/voice/vcActivityTypes';
import { vcActivityPresenceKindsFromUi } from '@/features/voice/vcActivityTypes';

export type SkrigglesCanvasEvent =
  | { kind: 'stroke'; batch: EchoSkrigglesStrokeBatchV1 }
  | { kind: 'cmd'; cmd: EchoSkrigglesCanvasCmdV1 }
  | { kind: 'snapshot'; snapshot: EchoSkrigglesCanvasSnapshotV1 };

export type CreateSkrigglesVoiceSessionOpts = {
  currentUserId: () => string | undefined;
  vcActivityUi: Ref<VcActivityUiState>;
  vcActivityPresenceByUserId: Ref<Map<string, readonly string[]>>;
  isDmVoiceCallUi: Ref<boolean>;
  getLkRoom: () => LiveKitVoiceRoomApi | null | undefined;
};

export type SkrigglesVoiceSession = {
  vcSkrigglesActivity: ComputedRef<EchoSkrigglesActivityV1 | null>;
  skrigglesRosterUserIds: ComputedRef<string[]>;
  skrigglesCanvasEvents: ShallowRef<SkrigglesCanvasEvent[]>;
  tryApplySkrigglesRemote: (
    msg: EchoSkrigglesActivityV1,
    identity: string,
  ) => void;
  receiveSkrigglesRoundSecret: (
    msg: EchoSkrigglesRoundSecretV1,
    identity: string,
  ) => void;
  onSkrigglesGuessIntent: (
    msg: EchoSkrigglesGuessIntentV1,
    identity: string,
  ) => void;
  onSkrigglesWordChoiceIntent: (
    msg: EchoSkrigglesWordChoiceIntentV1,
    identity: string,
  ) => void;
  onSkrigglesSettingsIntent: (
    msg: EchoSkrigglesSettingsIntentV1,
    identity: string,
  ) => void;
  onSkrigglesStartIntent: (
    msg: EchoSkrigglesStartIntentV1,
    identity: string,
  ) => void;
  onSkrigglesNextRoundIntent: (
    msg: EchoSkrigglesNextRoundIntentV1,
    identity: string,
  ) => void;
  onSkrigglesStrokeBatch: (
    msg: EchoSkrigglesStrokeBatchV1,
    identity: string,
  ) => void;
  onSkrigglesCanvasCmd: (
    msg: EchoSkrigglesCanvasCmdV1,
    identity: string,
  ) => void;
  onSkrigglesCanvasSnapshot: (
    msg: EchoSkrigglesCanvasSnapshotV1,
    identity: string,
  ) => void;
  scheduleSkrigglesBootstrap: () => void;
  resetSkrigglesIfLeavingPhase: (phase: VcActivityUiPhase) => void;
  commitSkrigglesWordChoice: (word: string) => void;
  submitSkrigglesGuess: (guess: string) => void;
  updateSkrigglesSettings: (settings: Partial<EchoSkrigglesSettingsV1>) => void;
  startSkrigglesGame: () => void;
  advanceSkrigglesRound: () => void;
  publishSkrigglesStrokeBatch: (batch: EchoSkrigglesStrokeBatchV1) => void;
  publishSkrigglesCanvasCmd: (cmd: EchoSkrigglesCanvasCmdV1) => void;
  publishSkrigglesCanvasSnapshot: (
    snapshot: EchoSkrigglesCanvasSnapshotV1,
  ) => void;
  tickSkrigglesTimers: () => void;
};

export function createSkrigglesVoiceSession(
  opts: CreateSkrigglesVoiceSessionOpts,
): SkrigglesVoiceSession {
  const vcSkrigglesPublic = shallowRef<EchoSkrigglesActivityV1 | null>(null);
  const vcSkrigglesLastTick = shallowRef<SkrigglesTick | null>(null);
  const vcSkrigglesSecretByRound = shallowRef(new Map<number, string>());
  const vcSkrigglesPendingSecretByRound = shallowRef(new Map<number, string>());
  const skrigglesCanvasEvents = shallowRef<SkrigglesCanvasEvent[]>([]);

  function skrigglesRosterFromPresence(): string[] {
    const out = new Set<string>();
    const self = opts.currentUserId()?.trim();
    const ui = opts.vcActivityUi.value;
    if (self && ui.phase === 'skriggles') {
      if (vcActivityPresenceKindsFromUi(ui).includes('skriggles'))
        out.add(self);
    }
    for (const [id, acts] of opts.vcActivityPresenceByUserId.value) {
      const uid = id.trim();
      if (!uid) continue;
      if (acts.includes('skriggles')) out.add(uid);
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  }

  function nextSkrigglesRevision(): number {
    return (
      Math.max(
        vcSkrigglesPublic.value?.revision ?? -1,
        vcSkrigglesLastTick.value?.revision ?? -1,
      ) + 1
    );
  }

  function publishLocal(next: EchoSkrigglesActivityV1): void {
    const tick: SkrigglesTick = {
      updatedAt: next.updatedAt,
      revision: next.revision,
    };
    vcSkrigglesLastTick.value = tick;
    vcSkrigglesPublic.value = next;
    if (next.phase === 'drawing') {
      scheduleShareSkrigglesRoundSecret(next.roundSeq);
    }
    opts.getLkRoom()?.publishSkrigglesActivity(next);
  }

  function shareSkrigglesRoundSecretWithOrchestrator(roundSeq: number): void {
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    const lk = opts.getLkRoom();
    if (
      !self ||
      !st ||
      !lk ||
      lk.roomState.value !== 'connected' ||
      opts.isDmVoiceCallUi.value
    )
      return;
    if (st.phase !== 'drawing' || st.roundSeq !== roundSeq) return;
    if (self !== st.drawerUserId.trim()) return;
    const secret = vcSkrigglesSecretByRound.value.get(roundSeq);
    if (!secret) return;
    const roster = mergeSkrigglesPresenceRoster(
      st.rosterUserIds,
      skrigglesRosterFromPresence(),
    );
    const orch = skrigglesOrchestratorUserId(roster);
    if (!orch || orch === self) return;
    if (!skrigglesRosterFromPresence().includes(orch)) return;
    lk.publishSkrigglesRoundSecret(
      {
        v: 1,
        t: 'skriggles_round_secret',
        updatedAt: Date.now(),
        fromUserId: self,
        roundSeq,
        drawerUserId: self,
        secret,
      },
      [orch],
    );
  }

  let secretShareTimer: ReturnType<typeof setTimeout> | null = null;
  let secretShareRound = -1;

  function scheduleShareSkrigglesRoundSecret(roundSeq: number): void {
    if (secretShareRound === roundSeq && secretShareTimer != null) return;
    secretShareRound = roundSeq;
    if (secretShareTimer != null) clearTimeout(secretShareTimer);
    secretShareTimer = setTimeout(() => {
      secretShareTimer = null;
      shareSkrigglesRoundSecretWithOrchestrator(roundSeq);
    }, 350);
  }

  function receiveSkrigglesRoundSecret(
    msg: EchoSkrigglesRoundSecretV1,
    fromIdentity: string,
  ): void {
    if (fromIdentity.trim() !== msg.drawerUserId.trim()) return;
    const secret = normalizeSkrigglesWord(msg.secret);
    if (!secret) return;
    const st = vcSkrigglesPublic.value;
    if (
      st &&
      st.roundSeq === msg.roundSeq &&
      st.drawerUserId.trim() === msg.drawerUserId.trim() &&
      st.phase === 'drawing'
    ) {
      const next = new Map(vcSkrigglesSecretByRound.value);
      next.set(msg.roundSeq, secret);
      vcSkrigglesSecretByRound.value = next;
      return;
    }
    const pn = new Map(vcSkrigglesPendingSecretByRound.value);
    pn.set(msg.roundSeq, secret);
    vcSkrigglesPendingSecretByRound.value = pn;
  }

  function tryMergePendingSecret(st: EchoSkrigglesActivityV1): void {
    if (st.phase !== 'drawing') return;
    const pending = vcSkrigglesPendingSecretByRound.value.get(st.roundSeq);
    if (!pending) return;
    const next = new Map(vcSkrigglesSecretByRound.value);
    next.set(st.roundSeq, pending);
    vcSkrigglesSecretByRound.value = next;
    const pn = new Map(vcSkrigglesPendingSecretByRound.value);
    pn.delete(st.roundSeq);
    vcSkrigglesPendingSecretByRound.value = pn;
  }

  function tryApplySkrigglesRemote(
    msg: EchoSkrigglesActivityV1,
    identity: string,
  ): void {
    if (msg.fromUserId.trim() !== identity.trim()) return;
    const localR = skrigglesRosterFromPresence();
    const coerced = coerceSkrigglesActivityToLocalRoster(msg, localR);
    if (!skrigglesAuthorAllowed(coerced, coerced.rosterUserIds)) return;
    const tick: SkrigglesTick = {
      updatedAt: coerced.updatedAt,
      revision: coerced.revision,
    };
    if (!isNewerSkrigglesTick(tick, vcSkrigglesLastTick.value)) return;
    vcSkrigglesLastTick.value = tick;
    vcSkrigglesPublic.value = coerced;
    tryMergePendingSecret(coerced);
    if (coerced.phase === 'drawing') {
      scheduleShareSkrigglesRoundSecret(coerced.roundSeq);
    }
  }

  function processGuessIntent(
    intent: EchoSkrigglesGuessIntentV1,
    identity: string,
  ): void {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    if (!self || !st || st.phase !== 'drawing') return;
    if (intent.roundSeq !== st.roundSeq) return;
    if (intent.fromUserId.trim() === st.drawerUserId.trim()) return;
    const roster = mergeSkrigglesPresenceRoster(
      st.rosterUserIds,
      skrigglesRosterFromPresence(),
    );
    const secret = vcSkrigglesSecretByRound.value.get(st.roundSeq);
    if (
      !shouldLocalClientApplySkrigglesGuess({
        selfUserId: self,
        drawerUserId: st.drawerUserId,
        rosterSorted: roster,
        presenceUserIds: skrigglesRosterFromPresence(),
        hasRoundSecret: !!secret,
      }) ||
      !secret
    ) {
      return;
    }
    const outcome = computeSkrigglesGuessOutcome({
      activity: st,
      secret,
      guesserUserId: intent.fromUserId.trim(),
      guessText: intent.guess,
    });
    if (!outcome) return;
    const next = applyGuessToActivity(
      { ...st, rosterUserIds: roster },
      outcome,
      self,
      nextSkrigglesRevision(),
      secret,
    );
    publishLocal(next);
  }

  function processWordChoiceIntent(
    intent: EchoSkrigglesWordChoiceIntentV1,
    identity: string,
  ): void {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    if (!self || !st || st.phase !== 'word_pick') return;
    if (intent.roundSeq !== st.roundSeq) return;
    const word = normalizeSkrigglesWord(intent.word);
    const m = new Map(vcSkrigglesSecretByRound.value);
    m.set(st.roundSeq, word);
    vcSkrigglesSecretByRound.value = m;
    const next = applyWordChoice(
      st,
      word,
      intent.fromUserId.trim(),
      nextSkrigglesRevision(),
    );
    if (!next) return;
    publishLocal(next);
  }

  function processSettingsIntent(
    intent: EchoSkrigglesSettingsIntentV1,
    identity: string,
  ): void {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    if (!self || !st) return;
    const next = applySettingsChange(
      st,
      intent.settings,
      intent.fromUserId.trim(),
      nextSkrigglesRevision(),
    );
    if (!next) return;
    publishLocal(next);
  }

  function processStartIntent(
    intent: EchoSkrigglesStartIntentV1,
    identity: string,
  ): void {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    if (!self || !st) return;
    const orch = skrigglesOrchestratorUserId(st.rosterUserIds);
    if (self !== orch) return;
    const next = startGameFromLobby(st, self, nextSkrigglesRevision());
    if (!next) return;
    publishLocal(next);
  }

  function processNextRoundIntent(
    intent: EchoSkrigglesNextRoundIntentV1,
    identity: string,
  ): void {
    if (intent.fromUserId.trim() !== identity.trim()) return;
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    if (!self || !st || st.phase !== 'round_reveal') return;
    if (intent.completedRoundSeq !== st.roundSeq) return;
    const orch = skrigglesOrchestratorUserId(st.rosterUserIds);
    if (self !== orch) return;
    const sm = new Map(vcSkrigglesSecretByRound.value);
    sm.delete(st.roundSeq);
    vcSkrigglesSecretByRound.value = sm;
    const next = advanceAfterRoundReveal(st, self, nextSkrigglesRevision());
    if (!next) return;
    publishLocal(next);
  }

  function trySkrigglesBootstrap(): void {
    const lk = opts.getLkRoom();
    if (lk?.roomState.value !== 'connected' || opts.isDmVoiceCallUi.value)
      return;
    if (opts.vcActivityUi.value.phase !== 'skriggles') return;
    const roster = skrigglesRosterFromPresence();
    if (!roster.length || vcSkrigglesPublic.value) return;
    const self = opts.currentUserId()?.trim();
    const orch = skrigglesOrchestratorUserId(roster);
    if (!self || orch !== self) return;
    publishLocal(
      buildInitialSkrigglesLobby({
        fromUserId: self,
        rosterUserIds: roster,
        revision: nextSkrigglesRevision(),
      }),
    );
  }

  let bootstrapTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleSkrigglesBootstrap(): void {
    if (bootstrapTimer != null) clearTimeout(bootstrapTimer);
    bootstrapTimer = setTimeout(() => {
      bootstrapTimer = null;
      trySkrigglesBootstrap();
    }, 220);
  }

  function resetSkrigglesIfLeavingPhase(phase: VcActivityUiPhase): void {
    if (phase === 'skriggles') return;
    vcSkrigglesSecretByRound.value = new Map();
    vcSkrigglesPendingSecretByRound.value = new Map();
    skrigglesCanvasEvents.value = [];
  }

  function commitSkrigglesWordChoice(word: string): void {
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    const lk = opts.getLkRoom();
    if (!self || !st || !lk || lk.roomState.value !== 'connected') return;
    if (st.phase !== 'word_pick' || self !== st.drawerUserId.trim()) return;
    const normalized = normalizeSkrigglesWord(word);
    const m = new Map(vcSkrigglesSecretByRound.value);
    m.set(st.roundSeq, normalized);
    vcSkrigglesSecretByRound.value = m;
    const next = applyWordChoice(st, normalized, self, nextSkrigglesRevision());
    if (next) {
      publishLocal(next);
      scheduleShareSkrigglesRoundSecret(st.roundSeq);
    }
    lk.publishSkrigglesWordChoiceIntent({
      v: 1,
      t: 'skriggles_word_choice_intent',
      updatedAt: Date.now(),
      fromUserId: self,
      roundSeq: st.roundSeq,
      word: normalized,
    });
  }

  function submitSkrigglesGuess(guess: string): void {
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    const lk = opts.getLkRoom();
    if (!self || !st || !lk || lk.roomState.value !== 'connected') return;
    if (st.phase !== 'drawing' || self === st.drawerUserId.trim()) return;
    const text = guess.trim();
    if (!text) return;
    lk.publishSkrigglesGuessIntent({
      v: 1,
      t: 'skriggles_guess_intent',
      updatedAt: Date.now(),
      fromUserId: self,
      roundSeq: st.roundSeq,
      guess: text.slice(0, 64),
    });
  }

  function updateSkrigglesSettings(
    settings: Partial<EchoSkrigglesSettingsV1>,
  ): void {
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    const lk = opts.getLkRoom();
    if (!self || !st || !lk) return;
    const next = applySettingsChange(
      st,
      settings,
      self,
      nextSkrigglesRevision(),
    );
    if (next) publishLocal(next);
    lk.publishSkrigglesSettingsIntent({
      v: 1,
      t: 'skriggles_settings_intent',
      updatedAt: Date.now(),
      fromUserId: self,
      settings,
    });
  }

  function startSkrigglesGame(): void {
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    const lk = opts.getLkRoom();
    if (!self || !st || !lk) return;
    const next = startGameFromLobby(st, self, nextSkrigglesRevision());
    if (next) publishLocal(next);
    lk.publishSkrigglesStartIntent({
      v: 1,
      t: 'skriggles_start_intent',
      updatedAt: Date.now(),
      fromUserId: self,
    });
  }

  function advanceSkrigglesRound(): void {
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    const lk = opts.getLkRoom();
    if (!self || !st || !lk || st.phase !== 'round_reveal') return;
    const sm = new Map(vcSkrigglesSecretByRound.value);
    sm.delete(st.roundSeq);
    vcSkrigglesSecretByRound.value = sm;
    const next = advanceAfterRoundReveal(st, self, nextSkrigglesRevision());
    if (next) publishLocal(next);
    lk.publishSkrigglesNextRoundIntent({
      v: 1,
      t: 'skriggles_next_round_intent',
      updatedAt: Date.now(),
      fromUserId: self,
      completedRoundSeq: st.roundSeq,
    });
  }

  function publishSkrigglesStrokeBatch(
    batch: EchoSkrigglesStrokeBatchV1,
  ): void {
    opts.getLkRoom()?.publishSkrigglesStrokeBatch(batch);
  }

  function publishSkrigglesCanvasCmd(cmd: EchoSkrigglesCanvasCmdV1): void {
    opts.getLkRoom()?.publishSkrigglesCanvasCmd(cmd);
  }

  function publishSkrigglesCanvasSnapshot(
    snapshot: EchoSkrigglesCanvasSnapshotV1,
  ): void {
    opts.getLkRoom()?.publishSkrigglesCanvasSnapshot(snapshot);
  }

  function pushCanvasEvent(event: SkrigglesCanvasEvent): void {
    const next = [...skrigglesCanvasEvents.value, event];
    skrigglesCanvasEvents.value =
      next.length > 200 ? next.slice(next.length - 200) : next;
  }

  function onSkrigglesStrokeBatch(
    msg: EchoSkrigglesStrokeBatchV1,
    _identity: string,
  ): void {
    const st = vcSkrigglesPublic.value;
    if (!st || st.phase !== 'drawing' || msg.roundSeq !== st.roundSeq) return;
    pushCanvasEvent({ kind: 'stroke', batch: msg });
  }

  function onSkrigglesCanvasCmd(
    msg: EchoSkrigglesCanvasCmdV1,
    _identity: string,
  ): void {
    const st = vcSkrigglesPublic.value;
    if (!st || st.phase !== 'drawing' || msg.roundSeq !== st.roundSeq) return;
    pushCanvasEvent({ kind: 'cmd', cmd: msg });
  }

  function onSkrigglesCanvasSnapshot(
    msg: EchoSkrigglesCanvasSnapshotV1,
    _identity: string,
  ): void {
    const st = vcSkrigglesPublic.value;
    if (!st || msg.roundSeq !== st.roundSeq) return;
    pushCanvasEvent({ kind: 'snapshot', snapshot: msg });
  }

  function tickSkrigglesTimers(): void {
    const self = opts.currentUserId()?.trim();
    const st = vcSkrigglesPublic.value;
    if (!self || !st || !st.phaseEndsAt) return;
    if (Date.now() < st.phaseEndsAt) {
      const secret = vcSkrigglesSecretByRound.value.get(st.roundSeq);
      if (secret && st.phase === 'drawing') {
        const hinted = applyHintIfEligible(st, secret);
        if (hinted && hinted !== st) {
          publishLocal({ ...hinted, revision: nextSkrigglesRevision() });
        }
      }
      return;
    }
    const orch = skrigglesOrchestratorUserId(st.rosterUserIds);
    if (self !== orch && self !== st.drawerUserId.trim()) return;
    const secret =
      vcSkrigglesSecretByRound.value.get(st.roundSeq) ??
      vcSkrigglesPendingSecretByRound.value.get(st.roundSeq) ??
      null;
    const expired = expirePhaseIfNeeded(
      st,
      self,
      nextSkrigglesRevision(),
      secret,
    );
    if (expired) publishLocal(expired);
  }

  return {
    vcSkrigglesActivity: computed(() => vcSkrigglesPublic.value),
    skrigglesRosterUserIds: computed(() => skrigglesRosterFromPresence()),
    skrigglesCanvasEvents,
    tryApplySkrigglesRemote,
    receiveSkrigglesRoundSecret,
    onSkrigglesGuessIntent: processGuessIntent,
    onSkrigglesWordChoiceIntent: processWordChoiceIntent,
    onSkrigglesSettingsIntent: processSettingsIntent,
    onSkrigglesStartIntent: processStartIntent,
    onSkrigglesNextRoundIntent: processNextRoundIntent,
    onSkrigglesStrokeBatch,
    onSkrigglesCanvasCmd,
    onSkrigglesCanvasSnapshot,
    scheduleSkrigglesBootstrap,
    resetSkrigglesIfLeavingPhase,
    commitSkrigglesWordChoice,
    submitSkrigglesGuess,
    updateSkrigglesSettings,
    startSkrigglesGame,
    advanceSkrigglesRound,
    publishSkrigglesStrokeBatch,
    publishSkrigglesCanvasCmd,
    publishSkrigglesCanvasSnapshot,
    tickSkrigglesTimers,
  };
}
