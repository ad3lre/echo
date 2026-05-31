import type {
  LocalParticipant,
  RemoteTrack,
  RemoteTrackPublication,
} from 'livekit-client';
import type { RemoteParticipantTrackInfo } from '@/composables/livekitVoiceRoom.types';

/** `getTrackPublication` expects `Track.Source` (string enum); derive without importing `Track` value. */
type LiveKitTrackPublicationSource = Parameters<
  LocalParticipant['getTrackPublication']
>[0];

const LK_SOURCE_MICROPHONE = 'microphone' as LiveKitTrackPublicationSource;
const LK_SOURCE_CAMERA = 'camera' as LiveKitTrackPublicationSource;
const LK_SOURCE_SCREEN_SHARE = 'screen_share' as LiveKitTrackPublicationSource;
const LK_SOURCE_SCREEN_SHARE_AUDIO =
  'screen_share_audio' as LiveKitTrackPublicationSource;

type TrackLike = {
  kind?: string;
  attach?: () => HTMLMediaElement;
  detach?: () => HTMLMediaElement[];
  mediaStreamTrack?: MediaStreamTrack;
  /** Present on some RemoteVideoTrack wrappers when the publisher muxes audio (e.g. tab capture). */
  mediaStream?: MediaStream;
  sid?: string;
  setVolume?: (g: number) => void;
};

type PublicationLike = {
  source?: string;
  kind?: string;
  isSubscribed?: boolean;
  isMuted?: boolean;
  trackSid?: string;
  track?: TrackLike | null;
  setSubscribed?: (value: boolean) => void | Promise<void>;
};

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
