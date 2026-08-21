/**
 * Stable identifiers for guild VC “Activity library” cards.
 * Used for global popularity aggregation (server-wide open counts).
 */

import {
  YOUTUBE_INTEGRATION_ENABLED,
  WATCH_TOGETHER_VC_ACTIVITY_ENABLED,
} from '../../../contracts/integrationKillSwitches';

/** Disabled until Echoed Names UI is production-ready; flip to `true` to re-enable. */
export const ECHOED_NAMES_VC_ACTIVITY_ENABLED = false;

/**
 * Route tic-tac-toe PvP through the authoritative game server (`useGameRoom`)
 * instead of the legacy P2P LiveKit-data + client-arbiter model.
 */
export const TIC_TAC_TOE_SERVER_MODE = true;

/**
 * Route Hangman through the authoritative game server instead of LiveKit P2P
 * orchestration + client-held round secrets.
 */
export const HANGMAN_SERVER_MODE = true;

/** Wordline is solo/local — no authoritative game-server room needed. */
export const WORDLE_SERVER_MODE = false;

/**
 * Route Codenames through the authoritative game server instead of LiveKit P2P
 * orchestration + client-held spymaster keys.
 */
export const CODENAMES_SERVER_MODE = true;

/**
 * Route Skriggles through the authoritative game server instead of LiveKit P2P
 * orchestration + drawer-held round secrets.
 */
export const SKRIGGLES_SERVER_MODE = true;

export const ECHO_VC_ACTIVITY_KEYS = [
  'youtube',
  'watch_together',
  'wordle',
  'hangman',
  'skriggles',
  'openguessr',
  'skribbl_io',
  'gartic_phone',
  'krunker',
  'codenames',
  'richup',
  'goober_dash',
  'smash_karts',
  'cluster_rush',
  'tic_tac_toe',
] as const;

export type EchoVcActivityKey = (typeof ECHO_VC_ACTIVITY_KEYS)[number];

const KEY_SET = new Set<string>(ECHO_VC_ACTIVITY_KEYS);
const NATIVE_KEY_SET = new Set<string>([
  'youtube',
  'watch_together',
  'wordle',
  'hangman',
  'skriggles',
  'tic_tac_toe',
  'codenames',
]);

export function isEchoVcActivityKey(raw: string): raw is EchoVcActivityKey {
  return KEY_SET.has(raw);
}

/**
 * Echo-native VC activities are implemented as first-party surfaces.
 * Non-native activities are embedded third-party experiences.
 */
export function isEchoNativeVcActivityKey(key: EchoVcActivityKey): boolean {
  return NATIVE_KEY_SET.has(key);
}

/** Library picker visibility (popularity API may still return hidden keys). */
export function isEchoVcActivityLibraryVisible(
  key: EchoVcActivityKey,
): boolean {
  if (key === 'codenames' && !ECHOED_NAMES_VC_ACTIVITY_ENABLED) return false;
  if (key === 'youtube' && !YOUTUBE_INTEGRATION_ENABLED) return false;
  if (key === 'watch_together' && !WATCH_TOGETHER_VC_ACTIVITY_ENABLED) {
    return false;
  }
  return true;
}
