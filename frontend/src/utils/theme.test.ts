import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDarkVariantToDocument,
  applyLightVariantToDocument,
  applyVibrantAccentsToDocument,
  resolveCanonicalTheme,
  resolveDarkVariant,
  resolveEffectiveDarkVariant,
  resolveEffectiveLightVariant,
  resolveLightVariant,
} from './theme';

describe('theme canonical + variant resolution', () => {
  it('keeps canonical theme dark/light only', () => {
    expect(resolveCanonicalTheme('Dark')).toBe('dark');
    expect(resolveCanonicalTheme('Light')).toBe('light');
    expect(resolveCanonicalTheme('Amoled')).toBe('dark');
    expect(resolveCanonicalTheme('Sunny')).toBe('light');
  });

  it('derives amoled dark variant from legacy Amoled id', () => {
    expect(resolveDarkVariant('Amoled')).toBe('amoled');
    expect(resolveDarkVariant('Dark')).toBe('default');
    expect(resolveDarkVariant('Light')).toBe('default');
    expect(resolveDarkVariant('Sunny')).toBe('default');
  });

  it('keeps amoled when canonical dark comes from OS sync but user saved Amoled', () => {
    expect(resolveEffectiveDarkVariant('dark', 'Amoled')).toBe('amoled');
    expect(resolveEffectiveDarkVariant('light', 'Amoled')).toBe('default');
    expect(resolveEffectiveDarkVariant('dark', 'Dark')).toBe('default');
  });
});

describe('light variant resolution', () => {
  it('derives sunny light variant from Sunny id', () => {
    expect(resolveLightVariant('Sunny')).toBe('sunny');
    expect(resolveLightVariant('Light')).toBe('default');
    expect(resolveLightVariant('Dark')).toBe('default');
    expect(resolveLightVariant('Amoled')).toBe('default');
  });

  it('keeps sunny when canonical light comes from OS sync but user saved Sunny', () => {
    expect(resolveEffectiveLightVariant('light', 'Sunny')).toBe('sunny');
    expect(resolveEffectiveLightVariant('dark', 'Sunny')).toBe('default');
    expect(resolveEffectiveLightVariant('light', 'Light')).toBe('default');
  });
});

describe('applyLightVariantToDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds sunny modifier only for canonical light', () => {
    vi.stubGlobal('document', {
      documentElement: { dataset: {} as Record<string, string> },
    });

    applyLightVariantToDocument('light', 'sunny');
    expect(document.documentElement.dataset.echoLightVariant).toBe('sunny');

    applyLightVariantToDocument('dark', 'sunny');
    expect(document.documentElement.dataset.echoLightVariant).toBeUndefined();

    applyLightVariantToDocument('light', 'default');
    expect(document.documentElement.dataset.echoLightVariant).toBeUndefined();
  });
});

describe('applyDarkVariantToDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds amoled modifier only for canonical dark', () => {
    vi.stubGlobal('document', {
      documentElement: { dataset: {} as Record<string, string> },
    });

    applyDarkVariantToDocument('dark', 'amoled');
    expect(document.documentElement.dataset.echoDarkVariant).toBe('amoled');

    applyDarkVariantToDocument('light', 'amoled');
    expect(document.documentElement.dataset.echoDarkVariant).toBeUndefined();

    applyDarkVariantToDocument('dark', 'default');
    expect(document.documentElement.dataset.echoDarkVariant).toBeUndefined();
  });
});

describe('applyVibrantAccentsToDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets data-echo-vibrant-accents to on or removes it', () => {
    vi.stubGlobal('document', {
      documentElement: { dataset: {} as Record<string, string> },
    });

    applyVibrantAccentsToDocument(true);
    expect(document.documentElement.dataset.echoVibrantAccents).toBe('on');

    applyVibrantAccentsToDocument(false);
    expect(document.documentElement.dataset.echoVibrantAccents).toBeUndefined();
  });
});
