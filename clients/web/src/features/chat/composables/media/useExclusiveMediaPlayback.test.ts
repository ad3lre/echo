import { describe, expect, it, vi } from 'vitest';
import {
  claimExclusiveMediaPlayback,
  registerExclusiveMediaPlayback,
} from './useExclusiveMediaPlayback';

describe('useExclusiveMediaPlayback', () => {
  it('pauses other registered elements when one plays', () => {
    const a = { pause: vi.fn(), paused: true } as unknown as HTMLMediaElement;
    const b = { pause: vi.fn(), paused: true } as unknown as HTMLMediaElement;
    registerExclusiveMediaPlayback(a);
    registerExclusiveMediaPlayback(b);
    claimExclusiveMediaPlayback(a);
    expect(b.pause).not.toHaveBeenCalled();
    Object.defineProperty(a, 'paused', { value: false, configurable: true });
    claimExclusiveMediaPlayback(b);
    expect(a.pause).toHaveBeenCalled();
  });
});
