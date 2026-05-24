import type { EchoPlanId } from '@shared/echoPlanLimits';
import echoPlusMark from './subscriptions/echo-plus-mark.svg?url';
import echoBlackMark from './subscriptions/echo-black-mark.svg?url';
import echoPlusBadge from './subscriptions/echo-plus-badge.svg?url';
import echoBlackBadge from './subscriptions/echo-black-badge.svg?url';

/** Large tier logos for settings / marketing surfaces. */
export const ECHO_PLAN_MARK_URL: Record<'plus' | 'black', string> = {
  plus: echoPlusMark,
  black: echoBlackMark,
};

/** Compact profile-row badges (Nitro-style gem). */
export const ECHO_PLAN_BADGE_URL: Record<'plus' | 'black', string> = {
  plus: echoPlusBadge,
  black: echoBlackBadge,
};

export function echoPlanMarkUrl(plan: EchoPlanId): string | null {
  if (plan === 'plus' || plan === 'black') return ECHO_PLAN_MARK_URL[plan];
  return null;
}

export function echoPlanBadgeUrl(badgeId: 'plus' | 'black'): string {
  return ECHO_PLAN_BADGE_URL[badgeId];
}
