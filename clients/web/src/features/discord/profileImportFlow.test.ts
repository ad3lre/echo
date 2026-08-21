import { describe, expect, it } from 'vitest';
import {
  isLikelyEchoDefaultGeneratedPfp,
  shouldOfferDiscordProfileImport,
} from './profileImportFlow';
import type { AuthUserPublic } from '@/api/authClient';

/** Matches backend `generateDefaultAvatarPfp` shape (SVG data URL). */
const SAMPLE_DEFAULT_ECHO_PFP =
  'data:image/svg+xml,' +
  encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="#5865F2"/>
  <text x="64" y="64" dominant-baseline="central" text-anchor="middle" fill="#ffffff"
    font-family="ui-sans-serif, system-ui, Segoe UI, sans-serif" font-size="52" font-weight="600">AB</text>
</svg>`);

function baseUser(patch: Partial<AuthUserPublic> = {}): AuthUserPublic {
  return {
    id: 'u1',
    username: 'alice',
    displayName: 'alice',
    pfp: SAMPLE_DEFAULT_ECHO_PFP,
    status: 'online',
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

describe('discordProfileImportFlow', () => {
  describe('isLikelyEchoDefaultGeneratedPfp', () => {
    it('detects Echo default SVG data URLs', () => {
      expect(isLikelyEchoDefaultGeneratedPfp(SAMPLE_DEFAULT_ECHO_PFP)).toBe(
        true,
      );
    });

    it('returns false for https avatars', () => {
      expect(
        isLikelyEchoDefaultGeneratedPfp(
          'https://cdn.discordapp.com/embed/avatars/0.png',
        ),
      ).toBe(false);
    });
  });

  describe('shouldOfferDiscordProfileImport', () => {
    it('returns false when display name differs from username', () => {
      expect(
        shouldOfferDiscordProfileImport(baseUser({ displayName: 'Alice W.' })),
      ).toBe(false);
    });

    it('returns false when user has a non-default avatar URL', () => {
      expect(
        shouldOfferDiscordProfileImport(
          baseUser({
            pfp: 'https://example.com/a.png',
          }),
        ),
      ).toBe(false);
    });

    it('returns false when bio or status is set', () => {
      expect(
        shouldOfferDiscordProfileImport(baseUser({ customStatus: 'hi' })),
      ).toBe(false);
      expect(
        shouldOfferDiscordProfileImport(baseUser({ bio: 'About me' })),
      ).toBe(false);
    });

    it('returns false when banner is set', () => {
      expect(
        shouldOfferDiscordProfileImport(
          baseUser({ bannerImage: 'https://example.com/b.png' }),
        ),
      ).toBe(false);
    });

    it('returns true for bare username-style profile with default avatar', () => {
      expect(
        shouldOfferDiscordProfileImport(
          baseUser({
            displayName: 'alice',
            pfp: SAMPLE_DEFAULT_ECHO_PFP,
          }),
        ),
      ).toBe(true);
    });
  });
});
