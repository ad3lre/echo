// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'echo-accessibility-preferences-v1';

function createLocalStorageStub(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, String(value));
    }),
  };
}

describe('accessibilityPreferences solid glass defaults', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createLocalStorageStub());
    localStorage.clear();
  });

  afterEach(() => {
    vi.doUnmock('@/platform/desktopBridge');
    localStorage.clear();
    vi.unstubAllGlobals();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-echo-solid-glass');
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

  it('defaults solidGlassSurfaces on for macOS WKWebView', async () => {
    vi.doMock('@/platform/desktopBridge', () => ({
      isDesktop: () => true,
    }));
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
      vendor: 'Apple Computer, Inc.',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    const { loadAccessibilityPreferences } =
      await import('./accessibilityPreferences');
    expect(loadAccessibilityPreferences().solidGlassSurfaces).toBe(true);
  });

  it('defaults solidGlassSurfaces off for non-weak-compositor browsers', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });
    const { loadAccessibilityPreferences } =
      await import('./accessibilityPreferences');
    expect(loadAccessibilityPreferences().solidGlassSurfaces).toBe(false);
  });

  it('overrides stored solidGlassSurfaces=false on weak compositors', async () => {
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
    expect(loadAccessibilityPreferences().solidGlassSurfaces).toBe(true);
  });

  it('keeps the DOM solid-glass guard on for macOS WebKit even with stored false', async () => {
    vi.doMock('@/platform/desktopBridge', () => ({
      isDesktop: () => true,
    }));
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
      vendor: 'Apple Computer, Inc.',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ solidGlassSurfaces: false }),
    );
    const { applyAccessibilityPreferences } =
      await import('./accessibilityPreferences');

    applyAccessibilityPreferences({
      reducedMotion: false,
      highContrast: false,
      showMessageSpacing: true,
      dyslexiaFriendlyFont: false,
      solidGlassSurfaces: false,
      fontScale: 100,
    });

    expect(document.documentElement.dataset.echoSolidGlass).toBe('1');
  });

  it('honours an explicit stored solidGlassSurfaces choice on strong compositors', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
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
