import type { WordlineView } from '@shared/games/wordline';
import { wordlineWinMessage } from './wordlineGameCore';

export function wordlineRoundOverToastMessage(next: WordlineView): string {
  if (next.status === 'won') {
    return wordlineWinMessage({
      mode: next.mode,
      status: next.status,
      level: next.level,
    });
  }
  const sol = next.solution ?? '';
  return sol ? `Answer: ${sol.toUpperCase()}` : 'Round over.';
}
