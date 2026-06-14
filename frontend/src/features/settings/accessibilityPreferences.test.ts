// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'echo-accessibility-preferences-v1';

describe('accessibilityPreferences solid glass defaults', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('defaults solidGlassSurfaces on for Brave sync hint', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/120.0',
      brave: { isBrave: async () => true },
    });
    const { loadAccessibilityPreferences } =
      await import('./accessibilityPreferences');
    expect(loadAccessibilityPreferences().solidGlassSurfaces).toBe(true);
  });

  it('defaults solidGlassSurfaces off for non-Brave browsers', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });
    const { loadAccessibilityPreferences } =
      await import('./accessibilityPreferences');
    expect(loadAccessibilityPreferences().solidGlassSurfaces).toBe(false);
  });

  it('honours an explicit stored solidGlassSurfaces choice', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/120.0',
      brave: { isBrave: async () => true },
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ solidGlassSurfaces: false }),
    );
    const { loadAccessibilityPreferences } =
      await import('./accessibilityPreferences');
    expect(loadAccessibilityPreferences().solidGlassSurfaces).toBe(false);
  });
});
