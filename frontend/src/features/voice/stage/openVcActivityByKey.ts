import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';

export type VcActivityOpenHandlers = {
  youtube: () => void;
  wordle: () => void;
  hangman: () => void;
  tic_tac_toe: () => void;
  openguessr: () => void;
  skribbl_io: () => void;
  gartic_phone: () => void;
  krunker: () => void;
  codenames: () => void;
  richup: () => void;
  goober_dash: () => void;
  smash_karts: () => void;
  basketball_stars_2026: () => void;
  cluster_rush: () => void;
  picker: () => void;
};

export function openVcActivityByKey(
  key: EchoVcActivityKey,
  handlers: VcActivityOpenHandlers,
): void {
  switch (key) {
    case 'youtube':
      handlers.youtube();
      break;
    case 'wordle':
      handlers.wordle();
      break;
    case 'hangman':
      handlers.hangman();
      break;
    case 'tic_tac_toe':
      handlers.tic_tac_toe();
      break;
    case 'openguessr':
      handlers.openguessr();
      break;
    case 'skribbl_io':
      handlers.skribbl_io();
      break;
    case 'gartic_phone':
      handlers.gartic_phone();
      break;
    case 'krunker':
      handlers.krunker();
      break;
    case 'codenames':
      handlers.codenames();
      break;
    case 'richup':
      handlers.richup();
      break;
    case 'goober_dash':
      handlers.goober_dash();
      break;
    case 'smash_karts':
      handlers.smash_karts();
      break;
    case 'basketball_stars_2026':
      handlers.basketball_stars_2026();
      break;
    case 'cluster_rush':
      handlers.cluster_rush();
      break;
    default: {
      const _exhaustive: never = key;
      handlers.picker();
    }
  }
}
