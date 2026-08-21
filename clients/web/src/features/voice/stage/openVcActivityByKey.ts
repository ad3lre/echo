import {
  WATCH_TOGETHER_VC_ACTIVITY_ENABLED,
  YOUTUBE_INTEGRATION_ENABLED,
} from '@shared/integrationKillSwitches';
import {
  ECHOED_NAMES_VC_ACTIVITY_ENABLED,
  type EchoVcActivityKey,
} from '@shared/vcActivityCatalog';

export type VcActivityOpenHandlers = {
  youtube: () => void;
  watch_together: () => void;
  wordle: () => void;
  hangman: () => void;
  skriggles: () => void;
  tic_tac_toe: () => void;
  openguessr: () => void;
  skribbl_io: () => void;
  gartic_phone: () => void;
  krunker: () => void;
  codenames: () => void;
  richup: () => void;
  goober_dash: () => void;
  smash_karts: () => void;
  cluster_rush: () => void;
  picker: () => void;
};

export function openVcActivityByKey(
  key: EchoVcActivityKey,
  handlers: VcActivityOpenHandlers,
): void {
  switch (key) {
    case 'youtube':
      if (YOUTUBE_INTEGRATION_ENABLED) handlers.youtube();
      else handlers.picker();
      break;
    case 'watch_together':
      if (WATCH_TOGETHER_VC_ACTIVITY_ENABLED) handlers.watch_together();
      else handlers.picker();
      break;
    case 'wordle':
      handlers.wordle();
      break;
    case 'hangman':
      handlers.hangman();
      break;
    case 'skriggles':
      handlers.skriggles();
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
      if (ECHOED_NAMES_VC_ACTIVITY_ENABLED) handlers.codenames();
      else handlers.picker();
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
    case 'cluster_rush':
      handlers.cluster_rush();
      break;
    default: {
      const _exhaustive: never = key;
      handlers.picker();
    }
  }
}
