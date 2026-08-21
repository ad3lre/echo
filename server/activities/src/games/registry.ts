import type { GameModule } from '../core/GameModule';
import { codenamesModule } from './codenames';
import { hangmanModule } from './hangman';
import { skrigglesModule } from './skriggles';
import { ticTacToeModule } from './ticTacToe';
import { wordlineModule } from './wordline';

/**
 * Production game modules served by this process. Each wraps an existing pure
 * core from `server/activities/cores/games/`. Migration order: tic_tac_toe (M1), then
 * hangman/wordline (M2), codenames (M3), skriggles (M4).
 */
export const gameModules: readonly GameModule[] = [
  ticTacToeModule,
  hangmanModule,
  wordlineModule,
  codenamesModule,
  skrigglesModule,
];
