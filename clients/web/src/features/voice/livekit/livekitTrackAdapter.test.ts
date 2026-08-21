import { describe, expect, it, vi } from 'vitest';
import {
  ECHO_LIVEKIT_AUDIO_ELEMENT_VOLUME_MAX,
  normalizeWebrtcCodecIdRef,
  resolveVoiceCodecDisplayLabel,
  setAudioTrackVolumeIfSupported,
} from './livekitTrackAdapter';

describe('normalizeWebrtcCodecIdRef', () => {
  it('strips sdp fmtp concatenated after codec stats id', () => {
    expect(
      normalizeWebrtcCodecIdRef(
        'COT01_111_minptime=10;usedtx=1;useinbandfec=1',
      ),
    ).toBe('COT01_111');
  });

  it('returns trimmed id when no fmtp junk', () => {
    expect(normalizeWebrtcCodecIdRef('COT01_111')).toBe('COT01_111');
  });
});

describe('resolveVoiceCodecDisplayLabel', () => {
  it('resolves codec stat mimeType to short label', () => {
    const report = new Map([
      [
        'COT01_111',
        {
          type: 'codec',
          id: 'COT01_111',
          mimeType: 'audio/opus',
          payloadType: 111,
        } as unknown as RTCStats,
      ],
    ]) as unknown as RTCStatsReport;

    expect(resolveVoiceCodecDisplayLabel(report, 'COT01_111')).toBe('Opus');
    expect(
      resolveVoiceCodecDisplayLabel(
        report,
        'COT01_111_minptime=10;usedtx=1;useinbandfec=1',
      ),
    ).toBe('Opus');
  });

  it('uses fallback when codec row missing', () => {
    const report = new Map() as unknown as RTCStatsReport;
    expect(resolveVoiceCodecDisplayLabel(report, 'unknown-id')).toBe('Opus');
  });
});

describe('setAudioTrackVolumeIfSupported', () => {
  it('clamps gain to HTMLMediaElement range [0, 1] (avoids IndexSizeError above 1)', () => {
    const setVolume = vi.fn();
    const track = { setVolume };
    setAudioTrackVolumeIfSupported(track, 1.2);
    expect(setVolume).toHaveBeenCalledWith(
      ECHO_LIVEKIT_AUDIO_ELEMENT_VOLUME_MAX,
    );
  });

  it('passes sub-unity gain through unchanged', () => {
    const setVolume = vi.fn();
    const track = { setVolume };
    setAudioTrackVolumeIfSupported(track, 0.35);
    expect(setVolume).toHaveBeenCalledWith(0.35);
  });

  it('clamps excessive gain to 1', () => {
    const setVolume = vi.fn();
    const track = { setVolume };
    setAudioTrackVolumeIfSupported(track, 99);
    expect(setVolume).toHaveBeenCalledWith(
      ECHO_LIVEKIT_AUDIO_ELEMENT_VOLUME_MAX,
    );
  });
});
