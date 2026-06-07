import type { RemoteTrack } from 'livekit-client';

/** A local LiveKit track exposes its underlying MediaStreamTrack via either field. */
export type LocalTrackLike = {
  mediaStreamTrack?: MediaStreamTrack;
  track?: MediaStreamTrack;
};

/** Track shape accepted by `StreamVideoTile` (remote LiveKit track or a local one). */
export type StreamVideoTileTrack = RemoteTrack | LocalTrackLike;
