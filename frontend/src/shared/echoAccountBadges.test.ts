import { describe, expect, it } from 'vitest';
import {
  publicBadgesFromAccount,
  publicBadgesFromEchoPlan,
  publicBadgesFromSignupOrdinal,
} from '@shared/echoAccountBadges';

describe('publicBadgesFromEchoPlan', () => {
  it('returns plus for Echo+ subscribers', () => {
    expect(publicBadgesFromEchoPlan('plus', {})).toEqual(['plus']);
  });

  it('returns black for Echo Black subscribers', () => {
    expect(publicBadgesFromEchoPlan('black', {})).toEqual(['black']);
  });

  it('skips guests and Discord shadows', () => {
    expect(publicBadgesFromEchoPlan('plus', { isGuest: true })).toEqual([]);
    expect(
      publicBadgesFromEchoPlan('black', { isDiscordShadow: true }),
    ).toEqual([]);
  });
});

describe('publicBadgesFromAccount', () => {
  it('orders subscription badge before OG', () => {
    expect(publicBadgesFromAccount(42, {}, 'plus')).toEqual(['plus', 'og']);
  });

  it('shows only black when on top tier', () => {
    expect(publicBadgesFromAccount(5, {}, 'black')).toEqual(['black', 'og']);
  });

  it('falls back to signup-only badges for free users', () => {
    expect(publicBadgesFromAccount(10, {}, 'free')).toEqual(['og']);
    expect(publicBadgesFromSignupOrdinal(500, {})).toEqual([]);
  });
});
