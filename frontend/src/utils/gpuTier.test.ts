import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectGpuTier } from './gpuTier';

describe('detectGpuTier', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not treat missing deviceMemory as 4GB (desktop Chrome usually has no deviceMemory)', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
      hardwareConcurrency: 8,
    } as unknown as Navigator);
    expect(detectGpuTier()).toBe('full');
  });

  it('still downgrades when deviceMemory is reported at 4GB', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      hardwareConcurrency: 8,
      deviceMemory: 4,
    } as unknown as Navigator);
    expect(detectGpuTier()).toBe('reduced');
  });

  it('does not downgrade on spoofed/low hardwareConcurrency alone (Brave Shields, etc.)', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
      hardwareConcurrency: 2,
    } as unknown as Navigator);
    expect(detectGpuTier()).toBe('full');
  });
});
