/**
 * Stable identifiers for guild VC “Activity library” cards.
 * Used for global popularity aggregation (server-wide open counts).
 */
export const ECHO_VC_ACTIVITY_KEYS = [
  'youtube',
  'wordle',
  'hangman',
  'openguessr',
  'skribbl_io',
  'gartic_phone',
  'krunker',
  'codenames',
  'richup',
  'goober_dash',
  'smash_karts',
  'basketball_stars_2026',
  'cluster_rush',
  'tic_tac_toe',
] as const;

export type EchoVcActivityKey = (typeof ECHO_VC_ACTIVITY_KEYS)[number];

const KEY_SET = new Set<string>(ECHO_VC_ACTIVITY_KEYS);

export function isEchoVcActivityKey(raw: string): raw is EchoVcActivityKey {
  return KEY_SET.has(raw);
}
