import {
  applyClue,
  applyDeal,
  applyEndTurn,
  applyNewGameLobby,
  applyReveal,
  applySetupToLobby,
  buildBootstrapLobby,
  codenamesOrchestratorUserId,
  mergeCodenamesPresenceRoster,
  pickWordsAndKey,
  viewerIsSpymaster,
  type CodenamesAffiliation,
  type CodenamesSnapshot,
} from '../../../../shared/games/codenames/core';
import { CODENAMES_WORD_BANK } from '../../../../shared/games/codenames/wordBank';
import {
  CODENAMES_ACTION,
  type CodenamesCluePayload,
  type CodenamesNewGamePayload,
  type CodenamesRevealPayload,
  type CodenamesSetupPayload,
  type CodenamesView,
} from '../../../../shared/games/codenames';
import type { GameModule } from '../../core/GameModule';

interface CodenamesState extends CodenamesSnapshot {
  roomId: string;
  words: string[] | null;
  key: CodenamesAffiliation[] | null;
}

function syncRoster(
  state: CodenamesState,
  roster: readonly string[],
): CodenamesState {
  const merged = mergeCodenamesPresenceRoster(state.rosterUserIds, roster);
  if (merged.join(',') === state.rosterUserIds.join(',')) return state;
  return { ...state, rosterUserIds: merged };
}

function snapshotFromState(state: CodenamesState): CodenamesSnapshot {
  const { words: _w, key: _k, roomId: _r, ...snap } = state;
  return snap;
}

function toView(viewerId: string, state: CodenamesState): CodenamesView {
  const snap = snapshotFromState(state);
  const orch = codenamesOrchestratorUserId(snap.rosterUserIds);
  const role = snap.roleAssignments.find((r) => r.userId === viewerId.trim());
  const isSm = viewerIsSpymaster(snap, viewerId);
  return {
    ...snap,
    spymasterKey:
      isSm && state.key && snap.phase === 'playing' ? [...state.key] : null,
    youAreSpymaster: isSm,
    youAreOperative: role?.role === 'operative',
    youAreOrchestrator: viewerId.trim() === orch,
  };
}

/** Authoritative Codenames — server holds spymaster key; operatives see public cells only. */
export const codenamesModule: GameModule<CodenamesState, CodenamesView> = {
  key: 'codenames',
  tickHz: 0,

  createInitialState: (ctx) => ({
    ...buildBootstrapLobby({ rosterUserIds: [] }),
    roomId: ctx.roomId,
    words: null,
    key: null,
  }),

  onJoin: (state, userId, _now) => {
    const roster = mergeCodenamesPresenceRoster(state.rosterUserIds, [userId]);
    if (!roster.length) return null;
    if (!state.rosterUserIds.length) {
      return {
        ...buildBootstrapLobby({ rosterUserIds: roster }),
        roomId: state.roomId,
        words: null,
        key: null,
      };
    }
    return syncRoster(state, roster);
  },

  onLeave: (state, userId) => {
    const roster = state.rosterUserIds.filter((id) => id !== userId);
    if (!roster.length) {
      return {
        ...buildBootstrapLobby({ rosterUserIds: [] }),
        roomId: state.roomId,
        words: null,
        key: null,
      };
    }
    if (state.phase === 'playing' && roster.length < 2) {
      return {
        ...syncRoster(state, roster),
        phase: 'paused_requires_new_game',
        turnStage: 'na',
        currentClue: null,
        guessesRemaining: 0,
        lastEvent: 'roster_shrank',
        words: null,
        key: null,
      };
    }
    return syncRoster(state, roster);
  },

  reduce: (state, payload, ctx) => {
    const s = syncRoster(state, ctx.roster);
    const orch = codenamesOrchestratorUserId(s.rosterUserIds);
    const snap = snapshotFromState(s);

    if (ctx.type === CODENAMES_ACTION.setup) {
      if (ctx.userId.trim() !== orch) return null;
      const roles =
        (payload as CodenamesSetupPayload | undefined)?.roleAssignments ?? [];
      const next = applySetupToLobby(snap, roles);
      if (!next) return null;
      return { ...s, ...next };
    }

    if (ctx.type === CODENAMES_ACTION.deal) {
      if (ctx.userId.trim() !== orch) return null;
      const { words, key, startingTeam } = pickWordsAndKey({
        wordBank: CODENAMES_WORD_BANK,
        gameSeq: s.gameSeq,
        channelSalt: s.roomId,
        rosterUserIdsSorted: s.rosterUserIds,
      });
      const next = applyDeal(snap, words, key, startingTeam);
      if (!next) return null;
      return { ...s, ...next, words, key };
    }

    if (ctx.type === CODENAMES_ACTION.clue) {
      const p = payload as CodenamesCluePayload | undefined;
      if (!p || typeof p.word !== 'string' || typeof p.number !== 'number') {
        return null;
      }
      const next = applyClue(snap, ctx.userId, p.word, p.number);
      if (!next) return null;
      return { ...s, ...next };
    }

    if (ctx.type === CODENAMES_ACTION.reveal) {
      const idx = (payload as CodenamesRevealPayload | undefined)?.cardIndex;
      if (typeof idx !== 'number' || !s.key) return null;
      const next = applyReveal(snap, ctx.userId, idx, s.key);
      if (!next) return null;
      return { ...s, ...next };
    }

    if (ctx.type === CODENAMES_ACTION.endTurn) {
      const next = applyEndTurn(snap, ctx.userId);
      if (!next) return null;
      return { ...s, ...next };
    }

    if (ctx.type === CODENAMES_ACTION.newGame) {
      if (ctx.userId.trim() !== orch) return null;
      const completed = (payload as CodenamesNewGamePayload | undefined)
        ?.completedGameSeq;
      if (typeof completed !== 'number') return null;
      const next = applyNewGameLobby(snap, completed);
      if (!next) return null;
      return { ...s, ...next, words: null, key: null };
    }

    return null;
  },

  serializeFor: (viewerId, state) => toView(viewerId, state),
};
