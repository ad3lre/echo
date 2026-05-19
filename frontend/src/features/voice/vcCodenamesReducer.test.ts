import { describe, expect, it } from 'vitest';
import type {
  EchoCodenamesActivityV1,
  EchoCodenamesAffiliationV1,
  EchoCodenamesPublicCellV1,
  EchoCodenamesRoleAssignmentV1,
} from '@/audio/voiceEchoLiveKitData';
import {
  applyClue,
  applyDeal,
  applyEndTurn,
  applyNewGameLobby,
  applyReveal,
  applySetupToLobby,
  buildBootstrapLobby,
  cellsFromWords,
  clueConflictsWithUnrevealedBoard,
  emptyLobbyCells,
  isNewerCodenamesTick,
  pickWordsAndKey,
  sanitizeCodenamesActivityForMerge,
  validateRoleSetup,
} from '@/features/voice/vcCodenamesReducer';

const ROSTER = ['alice', 'bob', 'carol', 'dave'] as const;

const ROLES: EchoCodenamesRoleAssignmentV1[] = [
  { userId: 'alice', team: 'red', role: 'spymaster' },
  { userId: 'bob', team: 'blue', role: 'spymaster' },
  { userId: 'carol', team: 'red', role: 'operative' },
  { userId: 'dave', team: 'blue', role: 'operative' },
];

function lobbyWithRoles(
  partial: Partial<EchoCodenamesActivityV1> = {},
): EchoCodenamesActivityV1 {
  const base = buildBootstrapLobby({
    fromUserId: 'alice',
    rosterUserIds: [...ROSTER],
    revision: 1,
  });
  const withRoles = applySetupToLobby(base, ROLES, 'alice', 2);
  expect(withRoles).not.toBeNull();
  return { ...withRoles!, ...partial };
}

function playingBoard(
  words: string[],
  key: EchoCodenamesAffiliationV1[],
  partial: Partial<EchoCodenamesActivityV1> = {},
): EchoCodenamesActivityV1 {
  const lobby = lobbyWithRoles();
  const dealt = applyDeal(lobby, words, key, 'red', 'alice', 3);
  expect(dealt).not.toBeNull();
  return { ...dealt!, ...partial };
}

describe('vcCodenamesReducer', () => {
  it('orders codenames ticks by updatedAt then revision', () => {
    expect(
      isNewerCodenamesTick(
        { updatedAt: 2, revision: 1 },
        { updatedAt: 1, revision: 99 },
      ),
    ).toBe(true);
    expect(
      isNewerCodenamesTick(
        { updatedAt: 1, revision: 2 },
        { updatedAt: 1, revision: 1 },
      ),
    ).toBe(true);
    expect(
      isNewerCodenamesTick(
        { updatedAt: 1, revision: 1 },
        { updatedAt: 1, revision: 2 },
      ),
    ).toBe(false);
  });

  it('validateRoleSetup requires two spymasters and full roster coverage', () => {
    const sorted = [...ROSTER].sort((a, b) => a.localeCompare(b));
    expect(validateRoleSetup(sorted, ROLES)?.length).toBe(4);
    expect(
      validateRoleSetup(sorted, [
        ...ROLES,
        { userId: 'eve', team: 'red', role: 'operative' },
      ]),
    ).toBeNull();
    expect(
      validateRoleSetup(
        sorted,
        ROLES.filter((r) => r.role !== 'operative'),
      ),
    ).toBeNull();
  });

  it('rejects clues that match an unrevealed board word', () => {
    const cells: EchoCodenamesPublicCellV1[] = [
      { revealed: false, word: 'ORBIT' },
      { revealed: true, word: 'ECHO', affiliation: 'red' },
    ];
    while (cells.length < 25) {
      cells.push({ revealed: false, word: `W${cells.length}` });
    }
    expect(clueConflictsWithUnrevealedBoard('orbit', cells)).toBe(true);
    expect(clueConflictsWithUnrevealedBoard('  STAR  ', cells)).toBe(false);
  });

  it('applyClue sets guessesRemaining to number + 1', () => {
    const words = Array.from({ length: 25 }, (_, i) => `W${i}`);
    const key: EchoCodenamesAffiliationV1[] = Array(25).fill('neutral');
    key[0] = 'red';
    const g = playingBoard(words, key);
    const clue = applyClue(g, 'alice', 'STAR', 2, 'alice', 4);
    expect(clue?.turnStage).toBe('await_guess');
    expect(clue?.guessesRemaining).toBe(3);
    expect(clue?.currentClue).toEqual({ word: 'STAR', number: 2 });
  });

  it('applyClue rejects clue that matches an unrevealed cell', () => {
    const words = Array.from({ length: 25 }, (_, i) => `W${i}`);
    words[3] = 'PLANET';
    const key: EchoCodenamesAffiliationV1[] = Array(25).fill('neutral');
    const g = playingBoard(words, key);
    expect(applyClue(g, 'alice', 'planet', 2, 'alice', 4)).toBeNull();
  });

  it('applyReveal ends game on assassin with other team winning', () => {
    const words = Array.from({ length: 25 }, (_, i) => `W${i}`);
    const key: EchoCodenamesAffiliationV1[] = Array(25).fill('neutral');
    key[10] = 'assassin';
    const g = playingBoard(words, key, { currentTeam: 'red' });
    const clue = applyClue(g, 'alice', 'X', 1, 'alice', 4);
    expect(clue).not.toBeNull();
    const after = applyReveal(clue!, 'carol', 10, key, 'alice', 5);
    expect(after?.phase).toBe('game_over');
    expect(after?.winner).toBe('blue');
  });

  it('applyReveal switches turn on neutral', () => {
    const words = Array.from({ length: 25 }, (_, i) => `W${i}`);
    const key: EchoCodenamesAffiliationV1[] = Array(25).fill('neutral');
    key[5] = 'neutral';
    const g = playingBoard(words, key, { currentTeam: 'red' });
    const clue = applyClue(g, 'alice', 'X', 3, 'alice', 4);
    const after = applyReveal(clue!, 'carol', 5, key, 'alice', 5);
    expect(after?.currentTeam).toBe('blue');
    expect(after?.turnStage).toBe('await_clue');
  });

  it('applyReveal switches turn on wrong color', () => {
    const words = Array.from({ length: 25 }, (_, i) => `W${i}`);
    const key: EchoCodenamesAffiliationV1[] = Array(25).fill('neutral');
    key[2] = 'blue';
    const g = playingBoard(words, key, { currentTeam: 'red' });
    const clue = applyClue(g, 'alice', 'X', 3, 'alice', 4);
    const after = applyReveal(clue!, 'carol', 2, key, 'alice', 5);
    expect(after?.currentTeam).toBe('blue');
    expect(after?.turnStage).toBe('await_clue');
  });

  it('applyEndTurn hands turn to other team', () => {
    const words = Array.from({ length: 25 }, (_, i) => `W${i}`);
    const key: EchoCodenamesAffiliationV1[] = Array(25).fill('neutral');
    const g = playingBoard(words, key, { currentTeam: 'red' });
    const clue = applyClue(g, 'alice', 'X', 1, 'alice', 4);
    const after = applyEndTurn(clue!, 'carol', 'alice', 5);
    expect(after?.currentTeam).toBe('blue');
    expect(after?.turnStage).toBe('await_clue');
  });

  it('applyNewGameLobby bumps gameSeq after game_over', () => {
    const words = Array.from({ length: 25 }, (_, i) => `W${i}`);
    const key: EchoCodenamesAffiliationV1[] = Array(25).fill('red');
    let g = playingBoard(words, key);
    g = { ...g, phase: 'game_over', winner: 'red', turnStage: 'na' };
    const next = applyNewGameLobby(g, g.gameSeq, 'alice', 99);
    expect(next?.phase).toBe('lobby');
    expect(next?.gameSeq).toBe(1);
  });

  it('sanitizeCodenamesActivityForMerge rejects bad cell shape', () => {
    const ok = lobbyWithRoles();
    expect(sanitizeCodenamesActivityForMerge(ok)).not.toBeNull();
    const bad: EchoCodenamesActivityV1 = {
      ...ok,
      cells: [{ revealed: false, word: 'X', affiliation: 'red' } as any],
    };
    expect(sanitizeCodenamesActivityForMerge(bad)).toBeNull();
  });

  it('pickWordsAndKey returns 25 words and valid key counts', () => {
    const bank = Array.from({ length: 120 }, (_, i) => {
      let n = i + 100;
      let s = '';
      while (n > 0) {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26);
      }
      return `W${s}`;
    });
    const { words, key, startingTeam } = pickWordsAndKey({
      wordBank: bank,
      gameSeq: 1,
      channelSalt: 'ch1',
      rosterUserIdsSorted: ['a', 'b'],
    });
    expect(words).toHaveLength(25);
    expect(key).toHaveLength(25);
    const nRed = key.filter((x) => x === 'red').length;
    const nBlue = key.filter((x) => x === 'blue').length;
    const nNeu = key.filter((x) => x === 'neutral').length;
    const nAs = key.filter((x) => x === 'assassin').length;
    expect(nAs).toBe(1);
    expect(nNeu).toBe(7);
    if (startingTeam === 'red') {
      expect(nRed).toBe(9);
      expect(nBlue).toBe(8);
    } else {
      expect(nBlue).toBe(9);
      expect(nRed).toBe(8);
    }
  });

  it('cellsFromWords matches emptyLobbyCells word shape count', () => {
    const w = Array.from({ length: 25 }, (_, i) => `W${i}`);
    expect(cellsFromWords(w)).toHaveLength(25);
    expect(emptyLobbyCells()).toHaveLength(25);
  });
});
