import type { RemoteTrack, RemoteTrackPublication } from 'livekit-client';
import type { RemoteParticipantTrackInfo } from '@/features/voice/livekitVoiceRoom.types';
import {
  LK_SOURCE_CAMERA,
  LK_SOURCE_MICROPHONE,
  LK_SOURCE_SCREEN_SHARE,
  LK_SOURCE_SCREEN_SHARE_AUDIO,
  type PublicationLike,
  type TrackLike,
} from '@/features/voice/livekit/livekitTrackDuckTypes';

type RemoteTrackAccumulator = {
  cameraTrack: RemoteTrack | null;
  screenTrack: RemoteTrack | null;
  screenAudioTrack: RemoteTrack | null;
  hasCameraPublication: boolean;
  hasScreenSharePublication: boolean;
  isMicEnabled: boolean;
};

export function buildRemoteParticipantTrackInfoFromPublications(
  publications: Iterable<RemoteTrackPublication & PublicationLike>,
): RemoteParticipantTrackInfo {
  const isTrackActive = (
    track: RemoteTrack | TrackLike | null | undefined,
  ): boolean => {
    if (!track) return false;
    const mst = (track as TrackLike).mediaStreamTrack;
    if (!mst) return true;
    return mst.readyState !== 'ended';
  };
  const acc: RemoteTrackAccumulator = {
    cameraTrack: null,
    screenTrack: null,
    screenAudioTrack: null,
    hasCameraPublication: false,
    hasScreenSharePublication: false,
    isMicEnabled: false,
  };
  for (const rp of publications) {
    if (rp.source === LK_SOURCE_MICROPHONE) {
      // `track` is null while remote audio is unsubscribed (local deafen). Still read
      // publication mute state so other users do not all appear mic-muted in the UI.
      acc.isMicEnabled = !rp.isMuted;
      continue;
    }
    if (rp.source === LK_SOURCE_CAMERA) {
      acc.hasCameraPublication = true;
      if (rp.track && isTrackActive(rp.track)) {
        acc.cameraTrack = rp.track;
      }
    } else if (rp.source === LK_SOURCE_SCREEN_SHARE) {
      acc.hasScreenSharePublication = true;
      if (rp.track && isTrackActive(rp.track)) {
        acc.screenTrack = rp.track;
      }
    } else if (rp.source === LK_SOURCE_SCREEN_SHARE_AUDIO) {
      acc.screenAudioTrack = rp.track ?? null;
    }
  }
  return {
    // Source publication presence reflects remote intent even when adaptive
    // subscriptions temporarily drop a concrete track object.
    isCameraEnabled: acc.hasCameraPublication,
    isScreenShareEnabled: acc.hasScreenSharePublication,
    isMicEnabled: acc.isMicEnabled,
    cameraTrack: acc.cameraTrack,
    screenTrack: acc.screenTrack,
    screenAudioTrack: acc.screenAudioTrack,
  };
}
