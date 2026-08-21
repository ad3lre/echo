import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ensureKrispNoiseFilterEnabled,
  isKrispNoiseFilterSupportedSafe,
} from './krispNoiseFilter';

const mockIsSupported = vi.fn<() => boolean>();
const mockFactory = vi.fn();

vi.mock('@livekit/krisp-noise-filter', () => ({
  isKrispNoiseFilterSupported: mockIsSupported,
  KrispNoiseFilter: mockFactory,
}));

function makeProcessor(enabled: boolean) {
  return {
    name: 'livekit-noise-filter',
    processedTrack: {} as MediaStreamTrack,
    setEnabled: vi.fn(async () => {
      enabled = true;
      return true;
    }),
    isEnabled: vi.fn(() => enabled),
  };
}

function makeTrack(processor: ReturnType<typeof makeProcessor> | null = null) {
  return {
    getProcessor: vi.fn(() => processor),
    setProcessor: vi.fn(async (nextProcessor) => {
      processor = nextProcessor as ReturnType<typeof makeProcessor>;
    }),
  } as any;
}

describe('krispNoiseFilter', () => {
  beforeEach(() => {
    mockIsSupported.mockReset();
    mockFactory.mockReset();
  });

  it('enables an existing attached Krisp processor', async () => {
    const processor = makeProcessor(false);
    const track = makeTrack(processor);

    const result = await ensureKrispNoiseFilterEnabled(track);

    expect(result.status).toBe('enabled');
    expect(result.reused).toBe(true);
    expect(processor.setEnabled).toHaveBeenCalledWith(true);
    expect(track.setProcessor).not.toHaveBeenCalled();
  });

  it('attaches and enables Krisp when supported', async () => {
    const processor = makeProcessor(false);
    const track = makeTrack();
    mockIsSupported.mockReturnValue(true);
    mockFactory.mockReturnValue(processor);

    const result = await ensureKrispNoiseFilterEnabled(track, {
      useBVC: true,
      quality: 'high',
    });

    expect(result.status).toBe('enabled');
    expect(result.reused).toBe(false);
    expect(mockFactory).toHaveBeenCalledWith({
      useBVC: true,
      quality: 'high',
    });
    expect(track.setProcessor).toHaveBeenCalledWith(processor);
    expect(processor.setEnabled).toHaveBeenCalledWith(true);
  });

  it('returns unsupported without attaching when browser support is missing', async () => {
    const track = makeTrack();
    mockIsSupported.mockReturnValue(false);

    const result = await ensureKrispNoiseFilterEnabled(track);

    expect(result).toEqual({ status: 'unsupported', reused: false });
    expect(track.setProcessor).not.toHaveBeenCalled();
  });

  it('reports support safely from the Krisp module', async () => {
    mockIsSupported.mockReturnValue(true);
    await expect(isKrispNoiseFilterSupportedSafe()).resolves.toBe(true);
  });
});
