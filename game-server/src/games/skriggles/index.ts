import {
  advanceAfterRoundReveal,
  applyGuessToActivity,
  applyHintIfEligible,
  applySettingsChange,
  applyWordChoice,
  buildInitialSkrigglesLobby,
  computeSkrigglesGuessOutcome,
  expirePhaseIfNeeded,
  mergeSkrigglesPresenceRoster,
  normalizeSkrigglesWord,
  skrigglesOrchestratorUserId,
  startGameFromLobby,
  type SkrigglesSnapshot,
} from '../../../../shared/games/skriggles/core';
import { pickWordChoices } from '../../../../shared/games/skriggles/wordBank';
import {
  SKRIGGLES_ACTION,
  SKRIGGLES_RELAY_KIND,
  type SkrigglesGuessPayload,
  type SkrigglesNextRoundPayload,
  type SkrigglesRelayPayload,
  type SkrigglesSettingsPayload,
  type SkrigglesView,
  type SkrigglesWordChoicePayload,
} from '../../../../shared/games/skriggles';
import type { GameModule } from '../../core/GameModule';

interface SkrigglesState extends SkrigglesSnapshot {
  roundSecret: string | null;
}

function syncRoster(
  state: SkrigglesState,
  roster: readonly string[],
): SkrigglesState {
  const merged = mergeSkrigglesPresenceRoster(state.rosterUserIds, roster);
  if (merged.join(',') === state.rosterUserIds.join(',')) return state;
  const scores = { ...state.scores };
  for (const uid of merged) {
    if (scores[uid] == null) scores[uid] = 0;
  }
  return { ...state, rosterUserIds: merged, scores };
}

function snapshotFromState(state: SkrigglesState): SkrigglesSnapshot {
  const { roundSecret: _s, ...snap } = state;
  return snap;
}

function toView(viewerId: string, state: SkrigglesState): SkrigglesView {
  const snap = snapshotFromState(state);
  const orch = skrigglesOrchestratorUserId(snap.rosterUserIds);
  return {
    ...snap,
    youAreDrawer: viewerId.trim() === snap.drawerUserId.trim(),
    youAreOrchestrator: viewerId.trim() === orch,
  };
}

const RELAY_ACTIONS = new Set<string>([
  SKRIGGLES_ACTION.strokeBatch,
  SKRIGGLES_ACTION.canvasCmd,
  SKRIGGLES_ACTION.canvasSnapshot,
]);

/** Authoritative Skriggles — server holds round secret; canvas strokes relay via events. */
export const skrigglesModule: GameModule<SkrigglesState, SkrigglesView> = {
  key: 'skriggles',
  tickHz: 1,

  createInitialState: () => ({
    ...buildInitialSkrigglesLobby({ rosterUserIds: [] }),
    roundSecret: null,
  }),

  onJoin: (state, userId, _now) => {
    const roster = mergeSkrigglesPresenceRoster(state.rosterUserIds, [userId]);
    if (!roster.length) return null;
    if (!state.rosterUserIds.length) {
      return {
        ...buildInitialSkrigglesLobby({ rosterUserIds: roster }),
        roundSecret: null,
      };
    }
    return syncRoster(state, roster);
  },

  onLeave: (state, userId) => {
    const roster = state.rosterUserIds.filter((id) => id !== userId);
    if (!roster.length) {
      return {
        ...buildInitialSkrigglesLobby({ rosterUserIds: [] }),
        roundSecret: null,
      };
    }
    return syncRoster(state, roster);
  },

  reduce: (state, payload, ctx) => {
    const s = syncRoster(state, ctx.roster);
    const snap = snapshotFromState(s);
    const orch = skrigglesOrchestratorUserId(s.rosterUserIds);

    if (ctx.type === SKRIGGLES_ACTION.start) {
      if (ctx.userId.trim() !== orch) return null;
      const next = startGameFromLobby(snap, 0, ctx.now);
      if (!next) return null;
      return { ...s, ...next, roundSecret: null };
    }

    if (ctx.type === SKRIGGLES_ACTION.settings) {
      const settings =
        (payload as SkrigglesSettingsPayload | undefined)?.settings ?? {};
      const next = applySettingsChange(snap, settings, ctx.userId, orch);
      if (!next) return null;
      return { ...s, ...next };
    }

    if (ctx.type === SKRIGGLES_ACTION.wordChoice) {
      const word = (payload as SkrigglesWordChoicePayload | undefined)?.word;
      if (typeof word !== 'string') return null;
      const normalized = normalizeSkrigglesWord(word);
      const next = applyWordChoice(snap, normalized, ctx.userId, ctx.now);
      if (!next) return null;
      return { ...s, ...next, roundSecret: normalized };
    }

    if (ctx.type === SKRIGGLES_ACTION.guess) {
      const guess = (payload as SkrigglesGuessPayload | undefined)?.guess;
      if (typeof guess !== 'string' || !s.roundSecret) return null;
      const outcome = computeSkrigglesGuessOutcome({
        activity: snap,
        secret: s.roundSecret,
        guesserUserId: ctx.userId,
        guessText: guess,
        nowMs: ctx.now,
      });
      if (!outcome) return null;
      const next = applyGuessToActivity(snap, outcome, s.roundSecret, ctx.now);
      const secret =
        next.phase === 'round_reveal' || next.phase === 'game_over'
          ? null
          : s.roundSecret;
      return { ...s, ...next, roundSecret: secret };
    }

    if (ctx.type === SKRIGGLES_ACTION.nextRound) {
      if (ctx.userId.trim() !== orch) return null;
      const completed = (payload as SkrigglesNextRoundPayload | undefined)
        ?.completedRoundSeq;
      if (typeof completed !== 'number' || completed !== s.roundSeq)
        return null;
      const next = advanceAfterRoundReveal(snap, ctx.userId, orch);
      if (!next) return null;
      return { ...s, ...next, roundSecret: null };
    }

    return null;
  },

  tick: (state, now, roster) => {
    const s = syncRoster(state, roster);
    const snap = snapshotFromState(s);
    const orch = skrigglesOrchestratorUserId(s.rosterUserIds) ?? s.drawerUserId;

    if (s.roundSecret && s.phase === 'drawing') {
      const hinted = applyHintIfEligible(snap, s.roundSecret, now);
      if (hinted) return { ...s, ...hinted };
    }

    const expired = expirePhaseIfNeeded(
      snap,
      orch,
      skrigglesOrchestratorUserId(s.rosterUserIds),
      s.roundSecret,
      now,
    );
    if (!expired) return null;

    let roundSecret = s.roundSecret;
    if (s.phase === 'word_pick' && expired.phase === 'drawing') {
      const fallback =
        s.wordChoices?.[0] ?? pickWordChoices(s.settings)[0] ?? null;
      roundSecret = fallback ? normalizeSkrigglesWord(fallback) : null;
    } else if (
      expired.phase === 'round_reveal' ||
      expired.phase === 'game_over' ||
      expired.phase === 'word_pick'
    ) {
      roundSecret = null;
    }

    return { ...s, ...expired, roundSecret };
  },

  relay: (state, payload, ctx) => {
    if (!RELAY_ACTIONS.has(ctx.type)) return null;
    const snap = snapshotFromState(state);
    if (snap.phase !== 'drawing') return null;
    if (ctx.userId.trim() !== snap.drawerUserId.trim()) return null;
    const p = payload as SkrigglesRelayPayload | undefined;
    if (!p || p.roundSeq !== snap.roundSeq) return null;
    return {
      kind: SKRIGGLES_RELAY_KIND,
      data: { type: ctx.type, fromUserId: ctx.userId, ...p },
    };
  },

  serializeFor: (viewerId, state) => toView(viewerId, state),
};
