export type LiveKitTrackKind = 'audio' | 'video' | 'unknown';
export type LiveKitTrackSource = 'microphone' | 'camera' | 'screen' | 'unknown';

export type LiveKitTrack = {
  sid: string;
  kind: LiveKitTrackKind;
  source: LiveKitTrackSource;
  muted: boolean;
};

export type LiveKitParticipant = {
  identity: string;
  name?: string;
  tracks: LiveKitTrack[];
};

export type LiveKitRoom = {
  name: string;
};
