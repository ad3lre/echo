/** Skriggles pure rules — barrel re-export for client and game server. */

export * from './types';
export * from './guess';
export * from './scoring';
export * from './wordBank';
export * from './rounds';
export * from './guessing';

import type { SkrigglesTick } from './types';

export { mergeHangmanRoster as mergeSkrigglesPresenceRoster } from '../hangman/core';

export function isNewerSkrigglesTick(
  next: SkrigglesTick,
  prev: SkrigglesTick | null,
): boolean {
  if (!prev) return true;
  if (next.updatedAt > prev.updatedAt) return true;
  if (next.updatedAt < prev.updatedAt) return false;
  return next.revision > prev.revision;
}
