import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBraveBrowser, isBraveBrowserSyncHint } from './browserCompatibility';

describe('isBraveBrowserSyncHint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when navigator.brave.isBrave is present', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/120.0',
      brave: { isBrave: async () => true },
    });
    expect(isBraveBrowserSyncHint()).toBe(true);
  });

  it('returns true for legacy Brave user agents', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Brave Chrome/120.0',
    });
    expect(isBraveBrowserSyncHint()).toBe(true);
  });

  it('returns false for Chrome without Brave signals', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });
    expect(isBraveBrowserSyncHint()).toBe(false);
  });
});

describe('isBraveBrowser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves true when navigator.brave.isBrave resolves true', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/120.0',
      brave: { isBrave: async () => true },
    });
    await expect(isBraveBrowser()).resolves.toBe(true);
  });

  it('resolves false when navigator.brave.isBrave resolves false', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/120.0',
      brave: { isBrave: async () => false },
    });
    await expect(isBraveBrowser()).resolves.toBe(false);
  });
});
