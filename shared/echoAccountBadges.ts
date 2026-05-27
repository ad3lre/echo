/**
 * Echo account profile badges, derived from durable account signals.
 * Keep IDs stable — clients render icons from these string ids.
 */
import { normalizeEchoPlanId, type EchoPlanId } from './echoPlanLimits';

export const ECHO_OG_BADGE_MAX_SIGNUP_ORDINAL = 100;

export type EchoPublicBadgeId = 'og' | 'plus' | 'black' | 'bug_hunter';

const OG: EchoPublicBadgeId = 'og';
const PLUS: EchoPublicBadgeId = 'plus';
const BLACK: EchoPublicBadgeId = 'black';
const BUG_HUNTER: EchoPublicBadgeId = 'bug_hunter';

export type EchoPublicBadgeAccountFlags = {
  isGuest?: boolean;
  isDiscordShadow?: boolean;
};

/**
 * Full accounts only: guests and Discord shadow placeholders never earn signup-based badges.
 */
export function publicBadgesFromSignupOrdinal(
  signupOrdinal: number | null | undefined,
  flags: EchoPublicBadgeAccountFlags,
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

/** Subscription tier badges (Echo+ / Echo Black) — Black supersedes Plus. */
export function publicBadgesFromEchoPlan(
  echoPlan: EchoPlanId | null | undefined,
  flags: EchoPublicBadgeAccountFlags,
): EchoPublicBadgeId[] {
  if (flags.isGuest || flags.isDiscordShadow) return [];
  const plan = normalizeEchoPlanId(echoPlan ?? 'free');
  if (plan === 'black') return [BLACK];
  if (plan === 'plus') return [PLUS];
  return [];
}

/**
 * Stable badge order for profile rows: paid tier first, then OG, then awarded.
 */
export function publicBadgesFromAccount(
  signupOrdinal: number | null | undefined,
  flags: EchoPublicBadgeAccountFlags,
  echoPlan?: EchoPlanId | null,
  awardedBadges?: readonly string[] | null,
): EchoPublicBadgeId[] {
  const out: EchoPublicBadgeId[] = [];
  for (const id of publicBadgesFromEchoPlan(echoPlan, flags)) out.push(id);
  for (const id of publicBadgesFromSignupOrdinal(signupOrdinal, flags)) {
    if (!out.includes(id)) out.push(id);
  }
  if (awardedBadges) {
    for (const raw of awardedBadges) {
      if (isEchoPublicBadgeId(raw) && !out.includes(raw)) out.push(raw);
    }
  }
  return out;
}

export function isEchoPublicBadgeId(id: string): id is EchoPublicBadgeId {
  return id === OG || id === PLUS || id === BLACK || id === BUG_HUNTER;
}

/** Short label shown on profile badge pills. */
export function echoPublicBadgeLabel(id: EchoPublicBadgeId): string {
  switch (id) {
    case 'plus':
      return 'Plus';
    case 'black':
      return 'Black';
    case 'og':
      return 'OG';
    case 'bug_hunter':
      return 'Bug Hunter';
    default:
      return id;
  }
}

export function echoPublicBadgeTitle(id: EchoPublicBadgeId): string {
  switch (id) {
    case 'plus':
      return 'Echo+ subscriber';
    case 'black':
      return 'Echo Black subscriber';
    case 'og':
      return `Original Echo member — among the first ${ECHO_OG_BADGE_MAX_SIGNUP_ORDINAL} accounts`;
    case 'bug_hunter':
      return 'Bug Hunter — helped find and report bugs';
    default:
      return id;
  }
}
