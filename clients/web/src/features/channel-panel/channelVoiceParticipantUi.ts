/** Per-participant voice indicator state rendered in a channel-panel voice row. */
export type ChannelVoiceParticipantUi = {
  muted: boolean;
  deafened: boolean;
  serverMuted: boolean;
  serverDeafened: boolean;
  streaming: boolean;
  video: boolean;
  speaking?: boolean;
  audioLevel?: number;
};
