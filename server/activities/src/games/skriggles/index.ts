import {
  advanceAfterRoundReveal,
  applyGuessToActivity,
  applyHintIfEligible,
  applySettingsChange,
  applyWordChoice,
  beginWordPickRound,
  buildInitialSkrigglesLobby,
  computeSkrigglesGuessOutcome,
  expirePhaseIfNeeded,
  mergeSkrigglesPresenceRoster,
  normalizeSkrigglesWord,
  skrigglesOrchestratorUserId,
  startGameFromLobby,
  type SkrigglesSnapshot,
} from '../../../cores/games/skriggles/core';
import { pickWordChoices } from '../../../cores/games/skriggles/wordBank';
import {
  SKRIGGLES_ACTION,
  SKRIGGLES_RELAY_KIND,
  type SkrigglesGuessPayload,
  type SkrigglesNextRoundPayload,
  type SkrigglesRelayPayload,
  type SkrigglesSettingsPayload,
  type SkrigglesView,
  type SkrigglesWordChoicePayload,
} from '../../../cores/games/skriggles';
import type { GameModule } from '../../core/GameModule';

interface SkrigglesState extends SkrigglesSnapshot {
  roundSecret: string | null;
}

export const SKRIGGLES_RELAY_MAX_JSON_BYTES = 64 * 1024;
export const SKRIGGLES_RELAY_MAX_ARRAY_LEN = 2000;

export const SKRIGGLES_RELAY_MAX_DEPTH = 8;
export const SKRIGGLES_RELAY_MAX_NODES = 5000;
/** Separate node budget for values under truncated `points` / `strokes` arrays. */
export const SKRIGGLES_RELAY_MAX_DRAW_NODES = 20000;
export const SKRIGGLES_RELAY_WALK_ARRAY_CAP = 500;

/**
 * Cheap bounded structural walk (no stringify): false if the value is too deep,
 * has too many nodes, or contains an array above the per-level cap. Iterative
 * so hostile nesting cannot overflow the stack.
 */
function relayShapeWithinBounds(root: unknown): boolean {
  // `inDraw` marks values under a `points` / `strokes` array: those are truncated
  // (not rejected) at SKRIGGLES_RELAY_MAX_ARRAY_LEN, so they get a separate node budget
  // and only their first MAX_ARRAY_LEN items are walked.
  const stack: { v: unknown; d: number; inDraw: boolean }[] = [
    { v: root, d: 0, inDraw: false },
  ];
  let nodes = 0;
  let drawNodes = 0;
  while (stack.length) {
    const { v, d, inDraw } = stack.pop()!;
    if (inDraw) {
      if (++drawNodes > SKRIGGLES_RELAY_MAX_DRAW_NODES) return false;
    } else if (++nodes > SKRIGGLES_RELAY_MAX_NODES) return false;
    if (!v || typeof v !== 'object') continue;
    if (d >= SKRIGGLES_RELAY_MAX_DEPTH) return false;
    if (Array.isArray(v)) {
      if (v.length > SKRIGGLES_RELAY_WALK_ARRAY_CAP && !inDraw) return false;
      for (const item of v) stack.push({ v: item, d: d + 1, inDraw });
    } else {
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) {
        if ((k === 'points' || k === 'strokes') && Array.isArray(item)) {
          if (item.length > SKRIGGLES_RELAY_MAX_ARRAY_LEN * 4) return false;
          nodes++;
          for (const el of item.slice(0, SKRIGGLES_RELAY_MAX_ARRAY_LEN)) {
            stack.push({ v: el, d: d + 2, inDraw: true });
          }
        } else {
          stack.push({ v: item, d: d + 1, inDraw });
        }
      }
    }
  }
  return true;
}

/**
 * Bound a client-supplied relay payload: reject oversized/deep JSON and truncate any
 * `points` / `strokes` arrays (top-level or inside the nested `payload`).
 */
export function sanitizeSkrigglesRelayPayload(
  p: SkrigglesRelayPayload,
): SkrigglesRelayPayload | null {
  if (!relayShapeWithinBounds(p)) return null;
  let size: number;
  try {
    size = JSON.stringify(p).length;
  } catch {
    return null;
  }
  if (size > SKRIGGLES_RELAY_MAX_JSON_BYTES) return null;
  const cap = (v: unknown): unknown => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    const o = { ...(v as Record<string, unknown>) };
    for (const k of ['points', 'strokes']) {
      const arr = o[k];
      if (Array.isArray(arr) && arr.length > SKRIGGLES_RELAY_MAX_ARRAY_LEN) {
        o[k] = arr.slice(0, SKRIGGLES_RELAY_MAX_ARRAY_LEN);
      }
    }
    return o;
  };
  const top = cap(p) as Record<string, unknown>;
  if ('payload' in top) top.payload = cap(top.payload);
  return top as unknown as SkrigglesRelayPayload;
}

function syncRoster(
  state: SkrigglesState,
  roster: readonly string[],
): SkrigglesState {
  const merged = mergeSkrigglesPresenceRoster([], roster);
  if (merged.join(',') === state.rosterUserIds.join(',')) return state;
  const scores = Object.fromEntries(
    merged.map((uid) => [uid, state.scores[uid] ?? 0]),
  );
  return {
    ...state,
    rosterUserIds: merged,
    scores,
    correctGuessersThisRound: state.correctGuessersThisRound.filter((uid) =>
      merged.includes(uid),
    ),
  };
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

  onLeave: (state, userId, now) => {
    const roster = state.rosterUserIds.filter((id) => id !== userId);
    if (roster.length < 2) {
      return {
        ...buildInitialSkrigglesLobby({
          rosterUserIds: roster,
          settings: state.settings,
        }),
        roundSecret: null,
      };
    }
    const next = syncRoster(state, roster);
    if (
      userId === state.drawerUserId &&
      (state.phase === 'drawing' || state.phase === 'word_pick')
    ) {
      return {
        ...next,
        ...beginWordPickRound(next, state.roundSeq, now),
        roundSecret: null,
      };
    }
    return next;
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
    if (!p || typeof p !== 'object' || p.roundSeq !== snap.roundSeq) {
      return null;
    }
    const safe = sanitizeSkrigglesRelayPayload(p);
    if (!safe) return null;
    // Trusted fields last so a client payload can never override them.
    return {
      kind: SKRIGGLES_RELAY_KIND,
      data: { ...safe, type: ctx.type, fromUserId: ctx.userId },
    };
  },

  serializeFor: (viewerId, state) => toView(viewerId, state),
};
