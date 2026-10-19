/**
 * Guild voice roster / mute maps live outside `categoriesByServer` so
 * `voice_roster_delta` does not rewrite the structural channel tree every tick.
 */
import type { ChannelSummary } from '@shared/types';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';

export type VoiceChannelEphemeral = {
  participantIds: string[];
  serverMuteByUserId?: Record<string, boolean>;
  serverDeafenByUserId?: Record<string, boolean>;
  stageSpeakerByUserId?: Record<string, boolean>;
};

export type VoiceEphemeralByChannelId = ReadonlyMap<
  string,
  VoiceChannelEphemeral
>;

export type VoiceRosterDelta = NonNullable<
  import('@shared/types/socket').EchoWorkspaceEvent['voiceRosterDelta']
>;

const VOICE_FIELD_KEYS = [
  'voiceParticipantIds',
  'voiceServerMuteByUserId',
  'voiceServerDeafenByUserId',
  'voiceStageSpeakerByUserId',
] as const;

export function emptyVoiceEphemeralMap(): Map<string, VoiceChannelEphemeral> {
  return new Map();
}

function cloneEphemeral(row: VoiceChannelEphemeral): VoiceChannelEphemeral {
  return {
    participantIds: [...row.participantIds],
    ...(row.serverMuteByUserId
      ? { serverMuteByUserId: { ...row.serverMuteByUserId } }
      : {}),
    ...(row.serverDeafenByUserId
      ? { serverDeafenByUserId: { ...row.serverDeafenByUserId } }
      : {}),
    ...(row.stageSpeakerByUserId
      ? { stageSpeakerByUserId: { ...row.stageSpeakerByUserId } }
      : {}),
  };
}

function rowFromChannel(ch: ChannelSummary): VoiceChannelEphemeral | null {
  if (ch.type !== 'voice' && ch.type !== 'stage') return null;
  const participantIds = ch.voiceParticipantIds ?? [];
  const serverMuteByUserId = ch.voiceServerMuteByUserId;
  const serverDeafenByUserId = ch.voiceServerDeafenByUserId;
  const stageSpeakerByUserId = ch.voiceStageSpeakerByUserId;
  if (
    participantIds.length === 0 &&
    !serverMuteByUserId &&
    !serverDeafenByUserId &&
    !stageSpeakerByUserId
  ) {
    return { participantIds: [] };
  }
  return {
    participantIds: [...participantIds],
    ...(serverMuteByUserId
      ? { serverMuteByUserId: { ...serverMuteByUserId } }
      : {}),
    ...(serverDeafenByUserId
      ? { serverDeafenByUserId: { ...serverDeafenByUserId } }
      : {}),
    ...(stageSpeakerByUserId
      ? { stageSpeakerByUserId: { ...stageSpeakerByUserId } }
      : {}),
  };
}

export function ingestVoiceEphemeralFromCategories(
  categoriesByServer: Record<string, ChannelCategory[]>,
): Map<string, VoiceChannelEphemeral> {
  const out = emptyVoiceEphemeralMap();
  for (const cats of Object.values(categoriesByServer)) {
    if (!Array.isArray(cats)) continue;
    for (const cat of cats) {
      for (const ch of cat.channels ?? []) {
        const row = rowFromChannel(ch);
        if (row) out.set(ch.id, row);
      }
    }
  }
  return out;
}

function stripVoiceFieldsFromChannel(ch: ChannelSummary): ChannelSummary {
  if (ch.type !== 'voice' && ch.type !== 'stage') return ch;
  let changed = false;
  const copy = { ...ch } as ChannelSummary & Record<string, unknown>;
  for (const key of VOICE_FIELD_KEYS) {
    if (key in copy) {
      delete copy[key];
      changed = true;
    }
  }
  return changed ? copy : ch;
}

/** Drop voice fields from the structural tree (in-memory after snapshot ingest). */
export function stripVoiceFieldsFromCategories(
  categoriesByServer: Record<string, ChannelCategory[]>,
): Record<string, ChannelCategory[]> {
  const next: Record<string, ChannelCategory[]> = {};
  for (const [sid, cats] of Object.entries(categoriesByServer)) {
    if (!Array.isArray(cats)) {
      next[sid] = cats;
      continue;
    }
    next[sid] = cats.map((cat) => ({
      ...cat,
      channels: (cat.channels ?? []).map(stripVoiceFieldsFromChannel),
    }));
  }
  return next;
}

export function mergeVoiceEphemeralIntoCategories(
  categories: ChannelCategory[],
  ephemeral: VoiceEphemeralByChannelId,
): ChannelCategory[] {
  if (ephemeral.size === 0) return categories;
  return categories.map((cat) => {
    let catChanged = false;
    const channels = (cat.channels ?? []).map((ch) => {
      if (ch.type !== 'voice' && ch.type !== 'stage') return ch;
      const row = ephemeral.get(ch.id);
      if (!row) return ch;
      catChanged = true;
      return {
        ...ch,
        voiceParticipantIds: row.participantIds,
        ...(row.serverMuteByUserId
          ? { voiceServerMuteByUserId: row.serverMuteByUserId }
          : {}),
        ...(row.serverDeafenByUserId
          ? { voiceServerDeafenByUserId: row.serverDeafenByUserId }
          : {}),
        ...(row.stageSpeakerByUserId
          ? { voiceStageSpeakerByUserId: row.stageSpeakerByUserId }
          : {}),
      };
    });
    return catChanged ? { ...cat, channels } : cat;
  });
}

/** Merge ephemeral voice into every server’s category tree (activity / presence scans). */
export function mergeVoiceEphemeralIntoCategoriesByServer(
  categoriesByServer: Record<string, ChannelCategory[]>,
  ephemeral: VoiceEphemeralByChannelId,
): Record<string, ChannelCategory[]> {
  if (ephemeral.size === 0) return categoriesByServer;
  const out: Record<string, ChannelCategory[]> = {};
  for (const [sid, cats] of Object.entries(categoriesByServer)) {
    out[sid] = mergeVoiceEphemeralIntoCategories(cats ?? [], ephemeral);
  }
  return out;
}

function ensureRow(
  map: Map<string, VoiceChannelEphemeral>,
  channelId: string,
): VoiceChannelEphemeral {
  const existing = map.get(channelId);
  if (existing) return cloneEphemeral(existing);
  return { participantIds: [] };
}

function removeUserFromAllVoiceChannels(
  map: Map<string, VoiceChannelEphemeral>,
  voiceChannelIds: Iterable<string>,
  userId: string,
): boolean {
  let changed = false;
  for (const channelId of voiceChannelIds) {
    const row = map.get(channelId);
    if (!row) continue;
    const hasId = row.participantIds.includes(userId);
    const hasMute = row.serverMuteByUserId?.[userId];
    const hasDeaf = row.serverDeafenByUserId?.[userId];
    const hasSpeaker = row.stageSpeakerByUserId?.[userId];
    if (!hasId && !hasMute && !hasDeaf && !hasSpeaker) continue;
    const next = cloneEphemeral(row);
    if (hasId)
      next.participantIds = next.participantIds.filter((id) => id !== userId);
    if (hasMute && next.serverMuteByUserId)
      delete next.serverMuteByUserId[userId];
    if (hasDeaf && next.serverDeafenByUserId)
      delete next.serverDeafenByUserId[userId];
    if (hasSpeaker && next.stageSpeakerByUserId)
      delete next.stageSpeakerByUserId[userId];
    map.set(channelId, next);
    changed = true;
  }
  return changed;
}

/** Voice/stage channel ids for one server from the structural tree. */
export function listVoiceChannelIdsForServer(
  categoriesByServer: Record<string, ChannelCategory[]>,
  serverId: string,
): string[] {
  const cats = categoriesByServer[serverId];
  if (!Array.isArray(cats)) return [];
  const out: string[] = [];
  for (const cat of cats) {
    for (const ch of cat.channels ?? []) {
      if (ch.type === 'voice' || ch.type === 'stage') out.push(ch.id);
    }
  }
  return out;
}

export function isStageChannelInServer(
  categoriesByServer: Record<string, ChannelCategory[]>,
  serverId: string,
  channelId: string,
): boolean {
  const cats = categoriesByServer[serverId];
  if (!Array.isArray(cats)) return false;
  for (const cat of cats) {
    for (const ch of cat.channels ?? []) {
      if (ch.id === channelId) return ch.type === 'stage';
    }
  }
  return false;
}

/**
 * Apply a roster delta into `map` (mutates). Returns true when something changed.
 */
export function applyVoiceRosterDeltaToEphemeralMap(
  map: Map<string, VoiceChannelEphemeral>,
  delta: VoiceRosterDelta,
  voiceChannelIdsForServer: readonly string[],
  targetIsStage: boolean,
): boolean {
  const { channelId, userId, action } = delta;
  if (!channelId || !userId) return false;
  const stageSpeakerHint = delta.stageSpeaker;

  if (action === 'join') {
    const next = ensureRow(map, channelId);
    if (!next.participantIds.includes(userId)) {
      next.participantIds = [...next.participantIds, userId];
    }
    if (targetIsStage && stageSpeakerHint !== undefined) {
      const spk = { ...(next.stageSpeakerByUserId ?? {}) };
      if (stageSpeakerHint) spk[userId] = true;
      else delete spk[userId];
      next.stageSpeakerByUserId = spk;
    }
    map.set(channelId, next);
    return true;
  }

  if (action === 'leave' || action === 'disconnect') {
    return removeUserFromAllVoiceChannels(
      map,
      voiceChannelIdsForServer,
      userId,
    );
  }

  if (action === 'move') {
    let changed = removeUserFromAllVoiceChannels(
      map,
      voiceChannelIdsForServer,
      userId,
    );
    const next = ensureRow(map, channelId);
    if (!next.participantIds.includes(userId)) {
      next.participantIds = [...next.participantIds, userId];
      changed = true;
    }
    if (targetIsStage && stageSpeakerHint !== undefined) {
      const spk = { ...(next.stageSpeakerByUserId ?? {}) };
      if (stageSpeakerHint) spk[userId] = true;
      else delete spk[userId];
      next.stageSpeakerByUserId = spk;
      changed = true;
    }
    map.set(channelId, next);
    return changed;
  }

  if (action === 'mute' || action === 'unmute') {
    const muted = action === 'mute';
    const next = ensureRow(map, channelId);
    const cur = next.serverMuteByUserId ?? {};
    if (muted === (cur[userId] === true)) return false;
    const mute = { ...cur };
    if (muted) mute[userId] = true;
    else delete mute[userId];
    next.serverMuteByUserId = mute;
    map.set(channelId, next);
    return true;
  }

  if (action === 'deafen' || action === 'undeafen') {
    const deafened = action === 'deafen';
    const next = ensureRow(map, channelId);
    const cur = next.serverDeafenByUserId ?? {};
    if (deafened === (cur[userId] === true)) return false;
    const deaf = { ...cur };
    if (deafened) deaf[userId] = true;
    else delete deaf[userId];
    next.serverDeafenByUserId = deaf;
    map.set(channelId, next);
    return true;
  }

  if (action === 'promote_speaker' || action === 'demote_speaker') {
    if (!targetIsStage) return false;
    const isSpeaker = action === 'promote_speaker';
    const next = ensureRow(map, channelId);
    const spk = { ...(next.stageSpeakerByUserId ?? {}) };
    if (isSpeaker) spk[userId] = true;
    else delete spk[userId];
    next.stageSpeakerByUserId = spk;
    map.set(channelId, next);
    return true;
  }

  return false;
}

export function findVoiceChannelIdContainingUser(
  ephemeral: VoiceEphemeralByChannelId,
  voiceChannelIds: Iterable<string>,
  userId: string,
): string | null {
  const uid = userId.trim();
  if (!uid) return null;
  for (const channelId of voiceChannelIds) {
    const row = ephemeral.get(channelId);
    if (row?.participantIds.includes(uid)) return channelId;
  }
  return null;
}

export function patchEphemeralRemoveUserFromChannel(
  map: Map<string, VoiceChannelEphemeral>,
  channelId: string,
  userId: string,
): boolean {
  const row = map.get(channelId);
  if (!row?.participantIds.includes(userId)) return false;
  const next = cloneEphemeral(row);
  next.participantIds = next.participantIds.filter((id) => id !== userId);
  map.set(channelId, next);
  return true;
}

export function patchEphemeralMoveUserBetweenChannels(
  map: Map<string, VoiceChannelEphemeral>,
  fromChannelId: string,
  toChannelId: string,
  userId: string,
): boolean {
  if (fromChannelId === toChannelId) return true;
  const from = map.get(fromChannelId);
  if (!from?.participantIds.includes(userId)) return false;
  const changedFrom = patchEphemeralRemoveUserFromChannel(
    map,
    fromChannelId,
    userId,
  );
  const to = ensureRow(map, toChannelId);
  if (!to.participantIds.includes(userId)) {
    to.participantIds = [...to.participantIds, userId];
  }
  map.set(toChannelId, to);
  return changedFrom;
}
