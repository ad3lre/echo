import {
  CODENAMES_SERVER_MODE,
  HANGMAN_SERVER_MODE,
  SKRIGGLES_SERVER_MODE,
  TIC_TAC_TOE_SERVER_MODE,
  WORDLE_SERVER_MODE,
} from '@shared/vcActivityCatalog';
import type { VcActivityUiPhase } from '@/features/voice/vcActivityTypes';

/** VC activity phases backed by the authoritative game server. */
export function isVcServerGamePhase(phase: VcActivityUiPhase): boolean {
  switch (phase) {
    case 'hangman':
      return HANGMAN_SERVER_MODE;
    case 'skriggles':
      return SKRIGGLES_SERVER_MODE;
    case 'tic_tac_toe':
      return TIC_TAC_TOE_SERVER_MODE;
    case 'codenames':
      return CODENAMES_SERVER_MODE;
    case 'wordle':
      return WORDLE_SERVER_MODE;
    default:
      return false;
  }
}
