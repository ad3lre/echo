/**
 * Echo account profile badges, derived from durable account signals.
 * Keep IDs stable — clients render icons from these string ids.
 */
export const ECHO_OG_BADGE_MAX_SIGNUP_ORDINAL = 100;

export type EchoPublicBadgeId = 'og';

const OG: EchoPublicBadgeId = 'og';

/**
 * Full accounts only: guests and Discord shadow placeholders never earn signup-based badges.
 */
export function publicBadgesFromSignupOrdinal(
  signupOrdinal: number | null | undefined,
  flags: { isGuest?: boolean; isDiscordShadow?: boolean },
): EchoPublicBadgeId[] {
  if (flags.isGuest || flags.isDiscordShadow) return [];
  if (
    signupOrdinal == null ||
    !Number.isFinite(signupOrdinal) ||
    signupOrdinal < 1
  ) {
    return [];
  }
  if (signupOrdinal <= ECHO_OG_BADGE_MAX_SIGNUP_ORDINAL) return [OG];
  return [];
}

export function isEchoPublicBadgeId(id: string): id is EchoPublicBadgeId {
  return id === OG;
}
