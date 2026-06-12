import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectClientEnvironment } from '@/observability/collectClientEnvironment';

describe('collectClientEnvironment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a desktop Chrome UA to coarse enums', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      language: 'en-US',
      maxTouchPoints: 0,
    });
    vi.stubGlobal('window', {
      innerWidth: 1440,
      matchMedia: () => ({ matches: false }),
    });

    const snap = collectClientEnvironment();
    expect(snap.shell).toBe('web');
    expect(snap.osFamily).toBe('windows');
    expect(snap.deviceForm).toBe('desktop');
    expect(snap.browserFamily).toBe('chrome');
    expect(snap.displayMode).toBe('browser');
    expect(snap.viewportBucket).toBe('xl');
    expect(snap.locale).toBe('en-US');
    expect(snap.touch).toBe(false);
  });

  it('maps an iPhone Safari UA to phone + ios', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      language: 'en-GB',
      maxTouchPoints: 5,
    });
    vi.stubGlobal('window', {
      innerWidth: 390,
      matchMedia: () => ({ matches: true }),
    });

    const snap = collectClientEnvironment();
    expect(snap.osFamily).toBe('ios');
    expect(snap.deviceForm).toBe('phone');
    expect(snap.browserFamily).toBe('safari');
    expect(snap.viewportBucket).toBe('xs');
    expect(snap.touch).toBe(true);
  });
});
