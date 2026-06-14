import { withBasePath } from '@/features/layout/urlNavigation';
import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';

/**
 * VC activity library catalog — the cards shown on the activity picker, plus
 * their hero art. Extracted from VcActivityStage.vue (pure data; no reactive
 * state) so the stage component stays focused on orchestration.
 *
 * Hero art is served from `public/vc-activities/`.
 * Source URLs and licenses: `public/vc-activities/sources.json`.
 */
const VC_ACTIVITY_ART_FILES = {
  youtube: '/vc-activities/youtube-hero.svg',
  watchTogether: '/vc-activities/watch-together-hero.svg',
  wordle: '/vc-activities/wordle-hero.png',
  hangman: '/vc-activities/hangman-hero.svg',
  skriggles: '/vc-activities/skriggles-hero.svg',
  openguessr: '/vc-activities/openguessr-hero.jpg',
  skribblIo: '/vc-activities/skribbl-hero.png',
  garticPhone: '/vc-activities/gartic-phone-hero.png',
  krunker: '/vc-activities/krunker-hero.jpg',
  echoedNames: '/vc-activities/echoed-names-hero.svg',
  richup: '/vc-activities/richup-hero.png',
  gooberDash: '/vc-activities/goober-dash-hero.png',
  smashKarts: '/vc-activities/smash-karts-hero.png',
  clusterRush: '/vc-activities/cluster-rush-hero.jpg',
  ticTacToe: '/vc-activities/tic-tac-toe-hero.svg',
} as const;

export type VcActivityArtKey = keyof typeof VC_ACTIVITY_ART_FILES;

/** Resolve hero art URLs against the app base path. */
export function buildVcActivityArt(
  appBase: string,
): Record<VcActivityArtKey, string> {
  const out = {} as Record<VcActivityArtKey, string>;
  for (const key of Object.keys(VC_ACTIVITY_ART_FILES) as VcActivityArtKey[]) {
    out[key] = withBasePath(VC_ACTIVITY_ART_FILES[key], appBase);
  }
  return out;
}

export type VcActivityLibraryCard = {
  key: EchoVcActivityKey;
  artKey: VcActivityArtKey;
  widgetClass: string;
  title: string;
  description: string;
  ariaLabel: string;
};

export const VC_ACTIVITY_LIBRARY_CARDS: readonly VcActivityLibraryCard[] = [
  {
    key: 'youtube',
    artKey: 'youtube',
    widgetClass: 'vc-act-widget--youtube',
    title: 'YouTube',
    description:
      'Shared queue with voice · one host drives sync until they leave; you follow automatically',
    ariaLabel: 'Open YouTube activity',
  },
  {
    key: 'watch_together',
    artKey: 'watchTogether',
    widgetClass: 'vc-act-widget--watch-together',
    title: 'Watch Together',
    description:
      'Upload your own videos · Echo+ hosts transcode to HLS and sync playback in voice',
    ariaLabel: 'Open Watch Together activity',
  },
  {
    key: 'wordle',
    artKey: 'wordle',
    widgetClass: 'vc-act-widget--wordline',
    title: 'Wordline',
    description:
      'Five-letter puzzles · daily challenge or level practice, private to you in voice',
    ariaLabel: 'Open Wordline activity',
  },
  {
    key: 'hangman',
    artKey: 'hangman',
    widgetClass: 'vc-act-widget--hangman',
    title: 'Hangman',
    description:
      'Echo voice classic · shared board, one puzzle master per round, guesses over the voice channel',
    ariaLabel: 'Open Hangman activity',
  },
  {
    key: 'skriggles',
    artKey: 'skriggles',
    widgetClass: 'vc-act-widget--skriggles',
    title: 'Skriggles',
    description:
      'Draw & guess party game · native Echo voice sync, no external tab',
    ariaLabel: 'Open Skriggles activity',
  },
  {
    key: 'tic_tac_toe',
    artKey: 'ticTacToe',
    widgetClass: 'vc-act-widget--tictactoe',
    title: 'Tic-Tac-Toe',
    description:
      '1v1 classic · challenge someone in voice; shared board in this activity',
    ariaLabel: 'Open Tic-Tac-Toe activity',
  },
  {
    key: 'openguessr',
    artKey: 'openguessr',
    widgetClass: 'vc-act-widget--openguessr',
    title: 'OpenGuessr',
    description: 'Geography guessing · play in voice together',
    ariaLabel: 'Open OpenGuessr activity',
  },
  {
    key: 'skribbl_io',
    artKey: 'skribblIo',
    widgetClass: 'vc-act-widget--skribblio',
    title: 'skribbl.io',
    description: 'Drawing & guessing party game · play in voice together',
    ariaLabel: 'Open skribbl.io activity',
  },
  {
    key: 'gartic_phone',
    artKey: 'garticPhone',
    widgetClass: 'vc-act-widget--garticphone',
    title: 'Gartic Phone',
    description: 'Drawing telephone · play in voice together',
    ariaLabel: 'Open Gartic Phone activity',
  },
  {
    key: 'krunker',
    artKey: 'krunker',
    widgetClass: 'vc-act-widget--krunker',
    title: 'Krunker',
    description: 'Browser FPS · play in voice together',
    ariaLabel: 'Open Krunker activity',
  },
  {
    key: 'goober_dash',
    artKey: 'gooberDash',
    widgetClass: 'vc-act-widget--gooberdash',
    title: 'Goober Dash',
    description:
      'Race royale by Winterpixel · runs in the embedded activity web client',
    ariaLabel: 'Open Goober Dash activity',
  },
  {
    key: 'smash_karts',
    artKey: 'smashKarts',
    widgetClass: 'vc-act-widget--smashkarts',
    title: 'Smash Karts',
    description:
      'Multiplayer kart battles by Tall Team · play in voice together',
    ariaLabel: 'Open Smash Karts activity',
  },
  {
    key: 'cluster_rush',
    artKey: 'clusterRush',
    widgetClass: 'vc-act-widget--clusterrush',
    title: 'Cluster Rush',
    description:
      'First-person truck parkour (Unity WebGL on clusterrush.io) · local play in this activity',
    ariaLabel: 'Open Cluster Rush activity',
  },
  {
    key: 'codenames',
    artKey: 'echoedNames',
    widgetClass: 'vc-act-widget--echoed-names',
    title: 'Echoed Names',
    description: 'Team word game · voice-synced in Echo',
    ariaLabel: 'Open Echoed Names activity',
  },
  {
    key: 'richup',
    artKey: 'richup',
    widgetClass: 'vc-act-widget--richup',
    title: 'Richup.io',
    description: 'Online property board · play in voice together',
    ariaLabel: 'Open Richup.io activity',
  },
];

export type VcActivityLibraryCardKey =
  (typeof VC_ACTIVITY_LIBRARY_CARDS)[number]['key'];
