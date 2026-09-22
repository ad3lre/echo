import type { GameModule } from '../core/GameModule';
import { codenamesModule } from './codenames';
import { hangmanModule } from './hangman';
import { skrigglesModule } from './skriggles';
import { ticTacToeModule } from './ticTacToe';
import { createHolyCTicTacToeModule } from './ticTacToe/holyc';
import { wordlineModule } from './wordline';
import { gameServerConfig } from '../config';

/**
 * Production game modules served by this process. Each wraps an existing pure
 * core from `server/activities/cores/games/`. Migration order: tic_tac_toe (M1), then
 * hangman/wordline (M2), codenames (M3), skriggles (M4).
 */
const selectedTicTacToeModule: GameModule =
  gameServerConfig.ticTacToeEngine === 'holyc'
    ? createHolyCTicTacToeModule({
        command: gameServerConfig.ticTacToeHolyCCommand!,
        args: gameServerConfig.ticTacToeHolyCArgs,
        timeoutMs: gameServerConfig.ticTacToeHolyCTimeoutMs,
      })
    : ticTacToeModule;

export const gameModules: readonly GameModule[] = [
  selectedTicTacToeModule,
  hangmanModule,
  wordlineModule,
  codenamesModule,
  skrigglesModule,
];
