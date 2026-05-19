// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  echoPlaybackDisposeElement,
  echoPlaybackPeekLinearGainForElement,
  echoPlaybackRegisterTrackElement,
} from '@/services/livekit/echoRemotePlaybackWebAudio';
import { setAudioTrackVolumeIfSupported } from '@/services/livekit/livekitTrackAdapter';

const webAudioAvailable =
  typeof globalThis.AudioContext === 'function' ||
  typeof (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext === 'function';

describe('client-side remote playback gain (Web Audio)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.skipIf(!webAudioAvailable)(
    'setAudioTrackVolumeIfSupported sets GainNode on wired video element and mirrors clamped gain onto element.volume + LiveKit setVolume',
    () => {
      const el = document.createElement('video');
      const setVolume = vi.fn();
      const track = { sid: 'integration-test-sid', setVolume };

      expect(echoPlaybackRegisterTrackElement(track, el)).toBe(true);

      setAudioTrackVolumeIfSupported(track, 0.41);

      expect(echoPlaybackPeekLinearGainForElement(el)).toBeCloseTo(0.41, 5);
      // Also mirrored onto the element + LiveKit's setVolume so playback still
      // tracks the slider if Web Audio routing is not actually in effect.
      expect(el.volume).toBeCloseTo(0.41, 5);
      expect(setVolume).toHaveBeenCalledWith(0.41);

      echoPlaybackDisposeElement(el);
      expect(echoPlaybackPeekLinearGainForElement(el)).toBeNull();
    },
  );
});
