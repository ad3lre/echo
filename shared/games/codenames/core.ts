/** Codenames pure rules — barrel re-export for client and game server. */

export * from './types';
export * from './roster';
export * from './board';
export * from './reducer';

import { mergeHangmanRoster } from '../hangman/core';
import type { CodenamesSnapshot, CodenamesTick } from './types';

export { mergeHangmanRoster as mergeCodenamesPresenceRoster };

export function isNewerCodenamesTick(
  next: CodenamesTick,
  prev: CodenamesTick | null,
): boolean {
  if (!prev) return true;
  if (next.updatedAt > prev.updatedAt) return true;
  if (next.updatedAt < prev.updatedAt) return false;
  return next.revision > prev.revision;
}

export function sanitizeCodenamesSnapshot(
  msg: CodenamesSnapshot,
): CodenamesSnapshot | null {
  if (!msg.rosterUserIds.length) return null;
  if (msg.cells.length !== 25) return null;
  for (const c of msg.cells) {
    if (!c.revealed && 'affiliation' in c) return null;
    if (c.revealed && !('affiliation' in c)) return null;
  }
  if (msg.phase === 'playing') {
    if (msg.turnStage !== 'await_clue' && msg.turnStage !== 'await_guess')
      return null;
  } else if (msg.turnStage !== 'na') return null;
  return msg;
}

export function coerceCodenamesSnapshotToRoster(
  msg: CodenamesSnapshot,
  localPresenceRosterSorted: readonly string[],
): CodenamesSnapshot {
  const merged = mergeHangmanRoster(
    msg.rosterUserIds,
    localPresenceRosterSorted,
  );
  return { ...msg, rosterUserIds: merged };
}
