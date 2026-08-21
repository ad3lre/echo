import type { LocalAudioTrack, Room as LKRoom } from 'livekit-client';
import { voiceClientDiag } from '@/observability/voiceClientTrace';
import { isSafariLikeBrowser } from '@/platform/browserCompatibility';
import {
  ensureEchoMicSendProcessorAudioContextRunning,
  getEchoMicSendProcessor,
} from '@/features/voice/livekit/echoLocalMicSendGain';
import { echoPlaybackEnsureAudioContextRunning } from '@/features/voice/livekit/echoRemotePlaybackWebAudio';
import {
  LK_KIND_AUDIO,
  LK_SOURCE_MICROPHONE,
} from '@/features/voice/livekit/livekitTrackDuckTypes';

/** Whether the local mic is published and unmuted in LiveKit (what remotes observe). */
export function isLocalMicPublicationLive(room: LKRoom): boolean {
  const pub = room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
  if (!pub) return false;
  return !pub.isMuted;
}

export function getLocalMicAudioTrack(room: LKRoom): LocalAudioTrack | null {
  const pub = room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
  const track = pub?.track;
  if (!track || (track as { kind?: string }).kind !== LK_KIND_AUDIO)
    return null;
  return track as LocalAudioTrack;
}

/**
 * Resume Web Audio graphs used for outgoing mic processing (WebKit/Safari desktop).
 * Returns false when a send processor exists but its AudioContext is not running.
 */
export async function ensureLocalMicSendPathReady(
  room: LKRoom,
): Promise<boolean> {
  void echoPlaybackEnsureAudioContextRunning();
  const track = getLocalMicAudioTrack(room);
  if (!track) return false;

  const processor = getEchoMicSendProcessor(track);
  if (!processor) return true;

  const running = await ensureEchoMicSendProcessorAudioContextRunning(track);
  if (!running && isSafariLikeBrowser()) {
    voiceClientDiag('warn', 'voice.client:mic_send_audio_ctx_not_running', {
      roomName: room.name,
    });
  }
  return running;
}
