import type { LocalParticipant } from 'livekit-client';

export const LK_KIND_AUDIO = 'audio';
export const LK_KIND_VIDEO = 'video';

/** `getTrackPublication` expects `Track.Source` (string enum); derive without importing `Track` value. */
export type LiveKitTrackPublicationSource = Parameters<
  LocalParticipant['getTrackPublication']
>[0];

export const LK_SOURCE_MICROPHONE =
  'microphone' as LiveKitTrackPublicationSource;
export const LK_SOURCE_CAMERA = 'camera' as LiveKitTrackPublicationSource;
export const LK_SOURCE_SCREEN_SHARE =
  'screen_share' as LiveKitTrackPublicationSource;
export const LK_SOURCE_SCREEN_SHARE_AUDIO =
  'screen_share_audio' as LiveKitTrackPublicationSource;

export type TrackLike = {
  kind?: string;
  attach?: () => HTMLMediaElement;
  detach?: () => HTMLMediaElement[];
  mediaStreamTrack?: MediaStreamTrack;
  /** Present on some RemoteVideoTrack wrappers when the publisher muxes audio (e.g. tab capture). */
  mediaStream?: MediaStream;
  sid?: string;
  setVolume?: (g: number) => void;
};

export type PublicationLike = {
  source?: string;
  kind?: string;
  isSubscribed?: boolean;
  isMuted?: boolean;
  trackSid?: string;
  track?: TrackLike | null;
  setSubscribed?: (value: boolean) => void | Promise<void>;
};

/** Tab / screen-share mux: apply gain if the video MediaStream still has usable audio. */
export function mediaStreamHasMuxedAudioForRemoteGain(
  ms: Pick<MediaStream, 'getAudioTracks'>,
): boolean {
  return ms.getAudioTracks().some((t) => t.readyState !== 'ended');
}

export function isLikelyMediaStream(
  ms: unknown,
): ms is Pick<MediaStream, 'getAudioTracks'> {
  return (
    !!ms &&
    typeof (ms as { getAudioTracks?: unknown }).getAudioTracks === 'function'
  );
}
