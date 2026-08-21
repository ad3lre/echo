export type LiveKitWebhookEventName =
  | 'participant_joined'
  | 'participant_left'
  | 'track_published'
  | 'track_unpublished'
  | 'active_speakers_changed'
  | string;

export type LiveKitWebhookEnvelope = {
  event?: LiveKitWebhookEventName;
  room?: { name?: string };
  participant?: { identity?: string };
  track?: { sid?: string; source?: string; type?: string };
};

export type RoomSnapshot = {
  roomName: string;
  participantIdentities: string[];
  updatedAtMs: number;
};

export type DesiredRoomControl = {
  roomName: string;
};

export type AppliedRoomControl = {
  roomName: string;
  appliedAtMs: number;
};

export type ControlDiff = {
  roomName: string;
  mutations: Array<{ kind: string; payload: Record<string, unknown> }>;
};
