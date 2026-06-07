/**
 * Stable identifiers for guild VC “Activity library” cards.
 * Used for global popularity aggregation (server-wide open counts).
 */

import { YOUTUBE_INTEGRATION_ENABLED } from './integrationKillSwitches';

/** TODO: set true to re-enable Echoed Names in the VC activity library and open flow. */
export const ECHOED_NAMES_VC_ACTIVITY_ENABLED = false;

export const ECHO_VC_ACTIVITY_KEYS = [
  'youtube',
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
  return true;
}
