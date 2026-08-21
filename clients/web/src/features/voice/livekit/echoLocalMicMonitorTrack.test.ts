import { describe, expect, it } from 'vitest';
import type { LocalAudioTrack } from 'livekit-client';
import { resolveLocalMicMonitorTrack } from '@/features/voice/livekit/echoLocalMicMonitorTrack';

describe('resolveLocalMicMonitorTrack', () => {
  it('prefers the send-gain processor source track over processed mediaStreamTrack', () => {
    const source = { readyState: 'live' } as MediaStreamTrack;
    const processed = { readyState: 'live' } as MediaStreamTrack;
    const localAudio = {
      mediaStreamTrack: processed,
      getProcessor: () => ({
        name: 'echo-mic-send-gain',
        getSourceTrack: () => source,
      }),
    } as unknown as LocalAudioTrack;

    expect(resolveLocalMicMonitorTrack(localAudio)).toBe(source);
  });

  it('falls back to mediaStreamTrack when no processor source exists', () => {
    const processed = { readyState: 'live' } as MediaStreamTrack;
    const localAudio = {
      mediaStreamTrack: processed,
      getProcessor: () => undefined,
    } as unknown as LocalAudioTrack;

    expect(resolveLocalMicMonitorTrack(localAudio)).toBe(processed);
  });

  it('returns null when every candidate track has ended', () => {
    const localAudio = {
      mediaStreamTrack: { readyState: 'ended' } as MediaStreamTrack,
      getProcessor: () => undefined,
    } as unknown as LocalAudioTrack;

    expect(resolveLocalMicMonitorTrack(localAudio)).toBeNull();
  });
});
