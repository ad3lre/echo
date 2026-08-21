import { describe, expect, it } from 'vitest';
import {
  isSafeProfileBannerColor,
  normalizeProfileBannerColor,
} from '@shared/profileBannerColor';
import {
  DEFAULT_PROFILE_BANNER_SOLID_HEX,
  normalizeBannerColorForForm,
  profileBannerRefractionBackdropStyle,
} from './profileBannerGradientFromImage';

describe('profile banner color safety', () => {
  it('keeps hex colors and simple hex-only gradients', () => {
    expect(normalizeProfileBannerColor('#ABC')).toBe('#aabbcc');
    expect(
      normalizeProfileBannerColor('linear-gradient(135deg, #7c3aed, #2563eb)'),
    ).toBe('linear-gradient(135deg, #7c3aed, #2563eb)');
  });

  it('rejects CSS URL/function injection in stored banner colors', () => {
    expect(isSafeProfileBannerColor('url(https://attacker.test/pixel)')).toBe(
      false,
    );
    expect(
      isSafeProfileBannerColor(
        'linear-gradient(90deg, #ffffff, url(https://attacker.test/pixel))',
      ),
    ).toBe(false);
    expect(normalizeBannerColorForForm('var(--banner-bg)')).toBe(
      DEFAULT_PROFILE_BANNER_SOLID_HEX,
    );
  });

  it('falls back before rendering unsafe refraction background CSS', () => {
    expect(
      profileBannerRefractionBackdropStyle('url(https://attacker.test/pixel)'),
    ).toEqual({ backgroundColor: DEFAULT_PROFILE_BANNER_SOLID_HEX });
  });
});
