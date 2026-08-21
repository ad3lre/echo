import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  audioOutputDeviceLimitedReason,
  defaultAudioOutputDeviceLabel,
  isAudioOutputDeviceSelectionAvailable,
  isBraveBrowser,
  isBraveBrowserSyncHint,
  isWebKitDesktop,
} from './browserCompatibility';

vi.mock('@/platform/desktopBridge', () => ({
  isDesktop: vi.fn(() => false),
}));

import { isDesktop } from '@/platform/desktopBridge';

describe('audioOutputDeviceLimitedReason', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(isDesktop).mockReturnValue(false);
  });

  it('returns ios on iPad Safari', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      vendor: 'Apple Computer, Inc.',
      platform: 'iPad',
      maxTouchPoints: 5,
    });
    expect(audioOutputDeviceLimitedReason()).toBe('ios');
    expect(isAudioOutputDeviceSelectionAvailable()).toBe(false);
    expect(defaultAudioOutputDeviceLabel()).toBe('System speaker');
  });

  it('returns mac-desktop for Tauri macOS WebKit', () => {
    vi.mocked(isDesktop).mockReturnValue(true);
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      vendor: 'Apple Computer, Inc.',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(audioOutputDeviceLimitedReason()).toBe('mac-desktop');
    expect(defaultAudioOutputDeviceLabel()).toBe('System output');
  });
});

describe('isWebKitDesktop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(isDesktop).mockReturnValue(false);
  });

  it('returns true for Tauri macOS WebKit user agent', () => {
    vi.mocked(isDesktop).mockReturnValue(true);
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      vendor: 'Apple Computer, Inc.',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(isWebKitDesktop()).toBe(true);
  });

  it('returns true for WKWebView UA without Safari token', () => {
    vi.mocked(isDesktop).mockReturnValue(true);
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
      vendor: 'Apple Computer, Inc.',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(isWebKitDesktop()).toBe(true);
  });

  it('returns false when not desktop even on Safari UA', () => {
    vi.mocked(isDesktop).mockReturnValue(false);
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      vendor: 'Apple Computer, Inc.',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(isWebKitDesktop()).toBe(false);
  });

  it('returns false for desktop Chrome on macOS', () => {
    vi.mocked(isDesktop).mockReturnValue(true);
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      vendor: 'Google Inc.',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(isWebKitDesktop()).toBe(false);
  });
});

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
