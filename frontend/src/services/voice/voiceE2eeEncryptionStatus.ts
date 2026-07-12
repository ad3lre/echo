import { shallowRef } from 'vue';

export type VoiceParticipantE2eeStatus = {
  encrypted: boolean;
  updatedAt: number;
};

/**
 * LiveKit {@link RoomEvent.ParticipantEncryptionStatusChanged} snapshot for the
 * active voice session. Kept in a tiny module so UI badges stay reactive without
 * importing the full livekit-client graph on first paint.
 */
export const voiceParticipantE2eeStatus = shallowRef<
  ReadonlyMap<string, VoiceParticipantE2eeStatus>
>(new Map());

export function setVoiceParticipantE2eeStatus(
  identity: string,
  encrypted: boolean,
): void {
  const id = identity.trim();
  if (!id) return;
  const next = new Map(voiceParticipantE2eeStatus.value);
  next.set(id, { encrypted, updatedAt: Date.now() });
  voiceParticipantE2eeStatus.value = next;
}

export function clearVoiceParticipantE2eeStatus(): void {
  voiceParticipantE2eeStatus.value = new Map();
}
