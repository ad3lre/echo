/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';

const webAudioMocks = vi.hoisted(() => ({
  getEls: vi.fn(() => [] as HTMLMediaElement[]),
  hasWired: vi.fn((_el: HTMLMediaElement) => false),
  setGain: vi.fn((_el: HTMLMediaElement, _g: number) => undefined),
  ensureWired: vi.fn((_track: unknown) => true),
}));

vi.mock('./echoRemotePlaybackWebAudio', () => ({
  echoPlaybackGetTrackMediaElements: (_track: unknown) =>
    webAudioMocks.getEls(),
  echoPlaybackHasWiredElement: (el: HTMLMediaElement) =>
    webAudioMocks.hasWired(el),
  echoPlaybackSetLinearGainOnElement: (el: HTMLMediaElement, g: number) =>
    webAudioMocks.setGain(el, g),
  echoPlaybackEnsureTrackElementsWired: (track: unknown) =>
    webAudioMocks.ensureWired(track),
}));

import { setAudioTrackVolumeIfSupported } from './livekitTrackAdapter';

describe('setAudioTrackVolumeIfSupported (Web Audio path)', () => {
  it('routes gain > 1 to GainNode and keeps LiveKit volume at unity', () => {
    webAudioMocks.getEls.mockReset();
    webAudioMocks.hasWired.mockReset();
    webAudioMocks.setGain.mockReset();
    webAudioMocks.ensureWired.mockReset();

    const el = document.createElement('audio');
    webAudioMocks.getEls.mockReturnValue([el]);
    webAudioMocks.hasWired.mockReturnValue(true);

    const setVolume = vi.fn();
    const track = { setVolume };

    setAudioTrackVolumeIfSupported(track, 2.4);

    expect(webAudioMocks.ensureWired).toHaveBeenCalledWith(track);
    expect(webAudioMocks.setGain).toHaveBeenCalledWith(el, 2.4);
    expect(setVolume).toHaveBeenCalledWith(1);
  });

  it('routes mute to GainNode for wired elements', () => {
    webAudioMocks.getEls.mockReset();
    webAudioMocks.hasWired.mockReset();
    webAudioMocks.setGain.mockReset();
    webAudioMocks.ensureWired.mockReset();

    const el = document.createElement('audio');
    webAudioMocks.getEls.mockReturnValue([el]);
    webAudioMocks.hasWired.mockReturnValue(true);

    const setVolume = vi.fn();
    const track = { setVolume };

    setAudioTrackVolumeIfSupported(track, 0);

    expect(webAudioMocks.ensureWired).toHaveBeenCalledWith(track);
    expect(webAudioMocks.setGain).toHaveBeenCalledWith(el, 0);
    expect(setVolume).toHaveBeenCalledWith(1);
  });

  it('clamps to [0, 1] when no wired elements', () => {
    webAudioMocks.getEls.mockReturnValue([]);
    webAudioMocks.hasWired.mockReturnValue(false);
    webAudioMocks.ensureWired.mockReset();

    const setVolume = vi.fn();
    const track = { setVolume };

    setAudioTrackVolumeIfSupported(track, 1.2);
    expect(webAudioMocks.ensureWired).toHaveBeenCalledWith(track);
    expect(setVolume).toHaveBeenCalledWith(1);
  });
});
