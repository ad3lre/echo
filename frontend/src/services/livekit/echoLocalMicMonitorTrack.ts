import type { LocalAudioTrack } from 'livekit-client';
import { getEchoMicSendProcessorSourceTrack } from '@/services/livekit/echoLocalMicSendGain';

/**
 * Track for the local speaking ring / gate meter.
 * Prefer the raw capture track from the send-gain processor — Web Audio often reads
 * silence from Krisp/processed `mediaStreamTrack` on WebKit even when publish works.
 */
export function resolveLocalMicMonitorTrack(
  localAudio: LocalAudioTrack,
): MediaStreamTrack | null {
  const fromProcessor = getEchoMicSendProcessorSourceTrack(localAudio);
  if (fromProcessor && fromProcessor.readyState !== 'ended') {
    return fromProcessor;
  }
  const mst = localAudio.mediaStreamTrack;
  if (mst && mst.readyState !== 'ended') {
    return mst;
  }
  return null;
}
