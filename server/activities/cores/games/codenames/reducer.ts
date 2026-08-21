import type {
  CodenamesAffiliation,
  CodenamesPublicCell,
  CodenamesRoleAssignment,
  CodenamesSnapshot,
} from './types';
import {
  cellsFromWords,
  clueConflictsWithUnrevealedBoard,
  emptyLobbyCells,
} from './board';
import {
  canClueAsSpymaster,
  canGuessAsOperative,
  validateRoleSetup,
} from './roster';

export function buildBootstrapLobby(opts: {
  rosterUserIds: string[];
}): CodenamesSnapshot {
  return {
    gameSeq: 0,
    rosterUserIds: [...opts.rosterUserIds].sort((a, b) => a.localeCompare(b)),
    phase: 'lobby',
    turnStage: 'na',
    cells: emptyLobbyCells(),
    startingTeam: 'red',
    currentTeam: 'red',
    winner: null,
    currentClue: null,
    guessesRemaining: 0,
    roleAssignments: [],
  };
}

export function applySetupToLobby(
  prev: CodenamesSnapshot,
  roles: CodenamesRoleAssignment[],
): CodenamesSnapshot | null {
  if (prev.phase !== 'lobby') return null;
  const v = validateRoleSetup(prev.rosterUserIds, roles);
  if (!v) return null;
  return { ...prev, roleAssignments: v };
}

export function applyDeal(
  prev: CodenamesSnapshot,
  words: string[],
  key: CodenamesAffiliation[],
  startingTeam: 'red' | 'blue',
): CodenamesSnapshot | null {
  if (prev.phase !== 'lobby') return null;
  if (words.length !== 25 || key.length !== 25) return null;
  if (!prev.roleAssignments.length) return null;
  return {
    ...prev,
    phase: 'playing',
    turnStage: 'await_clue',
    cells: cellsFromWords(words),
    startingTeam,
    currentTeam: startingTeam,
    winner: null,
    currentClue: null,
    guessesRemaining: 0,
  };
}

export function applyClue(
  prev: CodenamesSnapshot,
  spymasterUserId: string,
  word: string,
  number: number,
): CodenamesSnapshot | null {
  if (prev.phase !== 'playing' || prev.turnStage !== 'await_clue') return null;
  const clueWord = word.trim();
  if (!clueWord || number < 0 || number > 9) return null;
  if (clueConflictsWithUnrevealedBoard(clueWord, prev.cells)) return null;
  if (!canClueAsSpymaster(prev, spymasterUserId)) return null;
  return {
    ...prev,
    turnStage: 'await_guess',
    currentClue: { word: clueWord.slice(0, 64), number },
    guessesRemaining: number + 1,
  };
}

function countRemainingTeamCells(
  cells: readonly CodenamesPublicCell[],
  key: readonly CodenamesAffiliation[],
  team: 'red' | 'blue',
): number {
  let n = 0;
  for (let i = 0; i < 25; i++) {
    const c = cells[i]!;
    const k = key[i]!;
    if (!c.revealed && k === team) n++;
  }
  return n;
}

export function applyReveal(
  prev: CodenamesSnapshot,
  operativeUserId: string,
  cardIndex: number,
  key: readonly CodenamesAffiliation[],
): CodenamesSnapshot | null {
  if (prev.phase !== 'playing' || prev.turnStage !== 'await_guess') return null;
  if (cardIndex < 0 || cardIndex > 24) return null;
  if (!canGuessAsOperative(prev, operativeUserId)) return null;
  const cell = prev.cells[cardIndex]!;
  if (cell.revealed) return null;
  const aff = key[cardIndex]!;
  if (!aff) return null;

  const nextCells = [...prev.cells] as CodenamesPublicCell[];
  nextCells[cardIndex] = {
    revealed: true,
    word: cell.word,
    affiliation: aff,
  };

  const guessesRemaining = Math.max(0, prev.guessesRemaining - 1);
  let phase: CodenamesSnapshot['phase'] = prev.phase;
  let turnStage: CodenamesSnapshot['turnStage'] = prev.turnStage;
  let currentTeam = prev.currentTeam;
  let winner: CodenamesSnapshot['winner'] = prev.winner;
  let nextGuessesRemaining = guessesRemaining;

  if (aff === 'assassin') {
    phase = 'game_over';
    turnStage = 'na';
    winner = prev.currentTeam === 'red' ? 'blue' : 'red';
    nextGuessesRemaining = 0;
  } else if (aff === 'neutral') {
    currentTeam = prev.currentTeam === 'red' ? 'blue' : 'red';
    turnStage = 'await_clue';
    nextGuessesRemaining = 0;
  } else if (aff !== prev.currentTeam) {
    currentTeam = prev.currentTeam === 'red' ? 'blue' : 'red';
    turnStage = 'await_clue';
    nextGuessesRemaining = 0;
  } else {
    const remainingOwn = countRemainingTeamCells(
      nextCells,
      key,
      prev.currentTeam,
    );
    if (remainingOwn === 0) {
      phase = 'game_over';
      turnStage = 'na';
      winner = prev.currentTeam;
      nextGuessesRemaining = 0;
    } else if (nextGuessesRemaining === 0) {
      currentTeam = prev.currentTeam === 'red' ? 'blue' : 'red';
      turnStage = 'await_clue';
    }
  }

  return {
    ...prev,
    cells: nextCells,
    phase,
    turnStage,
    currentTeam,
    winner,
    guessesRemaining: nextGuessesRemaining,
    currentClue: turnStage === 'await_clue' ? null : prev.currentClue,
  };
}

export function applyEndTurn(
  prev: CodenamesSnapshot,
  operativeUserId: string,
): CodenamesSnapshot | null {
  if (prev.phase !== 'playing' || prev.turnStage !== 'await_guess') return null;
  if (!canGuessAsOperative(prev, operativeUserId)) return null;
  return {
    ...prev,
    currentTeam: prev.currentTeam === 'red' ? 'blue' : 'red',
    turnStage: 'await_clue',
    guessesRemaining: 0,
    currentClue: null,
  };
}

export function applyNewGameLobby(
  prev: CodenamesSnapshot,
  completedGameSeq: number,
): CodenamesSnapshot | null {
  if (prev.gameSeq !== completedGameSeq) return null;
  if (prev.phase !== 'game_over' && prev.phase !== 'paused_requires_new_game')
    return null;
  return {
    ...buildBootstrapLobby({ rosterUserIds: prev.rosterUserIds }),
    gameSeq: prev.gameSeq + 1,
  };
}
