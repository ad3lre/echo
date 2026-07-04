import { describe, expect, it } from 'vitest';
import {
  CHAT_LEGAL_PATH_RE,
  marketingLegalCanonicalUrl,
  normalizeMarketingCanonicalUrl,
} from './echoMarketingSeo';

describe('normalizeMarketingCanonicalUrl', () => {
  it('uses bare origin for root', () => {
    expect(normalizeMarketingCanonicalUrl('https://app-echo.net', '/')).toBe(
      'https://app-echo.net',
    );
  });

  it('strips trailing slashes on nested paths', () => {
    expect(
      normalizeMarketingCanonicalUrl('https://app-echo.net/', '/privacy/'),
    ).toBe('https://app-echo.net/privacy');
  });
});

describe('marketingLegalCanonicalUrl', () => {
  it('maps chat legal ids to marketing paths', () => {
    expect(marketingLegalCanonicalUrl('privacy')).toBe(
      'https://app-echo.net/privacy',
    );
    expect(marketingLegalCanonicalUrl('community')).toBe(
      'https://app-echo.net/community-guidelines',
    );
  });
});

describe('CHAT_LEGAL_PATH_RE', () => {
  it('matches chat legal paths', () => {
    expect(CHAT_LEGAL_PATH_RE.test('/legal/privacy')).toBe(true);
    expect(CHAT_LEGAL_PATH_RE.test('/legal/terms/')).toBe(true);
    expect(CHAT_LEGAL_PATH_RE.test('/legal/other')).toBe(false);
  });
});
