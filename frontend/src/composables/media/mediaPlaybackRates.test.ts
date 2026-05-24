import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  formatPlaybackRateLabel,
  normalizePlaybackRate,
  readStoredPlaybackRate,
  writeStoredPlaybackRate,
} from './mediaPlaybackRates';

describe('mediaPlaybackRates', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem(key: string) {
        return store[key] ?? null;
      },
      setItem(key: string, value: string) {
        store[key] = value;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formats rate labels', () => {
    expect(formatPlaybackRateLabel(1)).toBe('1×');
    expect(formatPlaybackRateLabel(1.25)).toBe('1.25×');
    expect(formatPlaybackRateLabel(0.5)).toBe('0.5×');
  });

  it('normalizes to supported rates', () => {
    expect(normalizePlaybackRate(1.3)).toBe(1);
    expect(normalizePlaybackRate(1.5)).toBe(1.5);
  });

  it('persists and reads stored rate', () => {
    writeStoredPlaybackRate(1.75);
    expect(readStoredPlaybackRate()).toBe(1.75);
    store['echo.chatMediaPlaybackRate'] = '9';
    expect(readStoredPlaybackRate()).toBe(1);
  });
});
