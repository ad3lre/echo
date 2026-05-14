import type { RemoteParticipant, Room } from 'livekit-client';

/**
 * LiveKit `Room.remoteParticipants` is keyed by participant SID, not JWT `identity`
 * (Echo user id). Use these helpers instead of `remoteParticipants.get(userId)`.
 */
export function liveKitRemoteIdentities(room: Room): string[] {
  const out: string[] = [];
  for (const p of room.remoteParticipants.values()) {
    const id = p.identity;
    if (typeof id === 'string' && id.trim()) out.push(id);
  }
  return out;
}

export function liveKitRemoteParticipantByIdentity(
  room: Room,
  identity: string,
): RemoteParticipant | undefined {
  for (const p of room.remoteParticipants.values()) {
    if (p.identity === identity) return p;
  }
  return undefined;
}

/**
 * Resolves a remote participant key from UI/state to canonical LiveKit identity.
 *
 * Most callers pass Echo user id (`participant.identity`), but some paths can still
 * carry participant SID or whitespace-padded ids; normalize to identity so lookups
 * and per-participant state always apply to the active remote track owner.
 */
export function resolveLiveKitRemoteParticipantIdentity(
  room: Room,
  participantKey: string,
): string | undefined {
  const key = participantKey.trim();
  if (!key) return undefined;
  const bySid = room.remoteParticipants.get(key);
  if (bySid?.identity?.trim()) return bySid.identity;
  const byIdentity = liveKitRemoteParticipantByIdentity(room, key);
  if (byIdentity?.identity?.trim()) return byIdentity.identity;
  for (const p of room.remoteParticipants.values()) {
    if (p.identity?.trim() === key) return p.identity;
  }
  return undefined;
}
