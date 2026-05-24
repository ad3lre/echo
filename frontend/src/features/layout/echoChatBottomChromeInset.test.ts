import { describe, expect, it } from 'vitest';
import {
  clearEchoChatBottomChromeOwner,
  createEchoChatBottomChromeOwner,
  echoChatBottomChromeInsetPx,
  setEchoChatBottomChromeInset,
} from './echoChatBottomChromeInset';

describe('echoChatBottomChromeInset', () => {
  it('tracks the maximum inset across reporters', () => {
    const a = createEchoChatBottomChromeOwner();
    const b = createEchoChatBottomChromeOwner();
    setEchoChatBottomChromeInset(a, 72);
    setEchoChatBottomChromeInset(b, 96);
    expect(echoChatBottomChromeInsetPx.value).toBe(96);
    clearEchoChatBottomChromeOwner(b);
    expect(echoChatBottomChromeInsetPx.value).toBe(72);
    clearEchoChatBottomChromeOwner(a);
    expect(echoChatBottomChromeInsetPx.value).toBe(0);
  });
});
