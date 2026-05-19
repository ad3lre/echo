import type { RemoteParticipantTrackInfo } from '@/composables/useLiveKitVoiceRoom';

/**
 * Echo `voiceParticipantIds` can lag behind LiveKit after someone disconnects (SFU is
 * immediate; workspace snapshot may update later). Intersect with LiveKit identities
 * (plus the local user id, which is never in `remoteParticipants`) to drop ghosts.
 */
export function filterVoiceParticipantIdsByLiveKitPresence(
  echoIds: string[],
  opts: {
    remoteIdentities: Iterable<string>;
    currentUserId: string | undefined;
  },
): string[] {
  const lk = new Set<string>(opts.remoteIdentities);
  if (opts.currentUserId) lk.add(opts.currentUserId);
  return echoIds.filter((id) => lk.has(id));
}

/**
 * After intersecting Echo ids with LiveKit, the list can be empty when Echo never
 * listed the local user but the client is still connected (stale peer-only ids).
 * Keep the current user visible in the call UI and channel list when Echo ids are peer-only.
 */
export function recoverVoiceParticipantIdsWhenLiveKitAlone(
  ids: string[],
  opts: {
    liveKitConnected: boolean;
    channelMatches: boolean;
    currentUserId: string | undefined;
  },
): string[] {
  const uid = opts.currentUserId?.trim();
  if (
    !uid ||
    ids.length > 0 ||
    !opts.liveKitConnected ||
    !opts.channelMatches
  ) {
    return ids;
  }
  return [uid];
}

/**
 * Echo `voiceParticipantIds` is the membership authority for the workspace snapshot.
 * When connected to the matching voice room, keep that roster intact and add any
 * LiveKit-only remotes so the channel list and CallView stay aligned during snapshot /
 * webhook lag (no “self-only VC” while Echo and LiveKit are still converging).
 *
 * LiveKit remains the authority for media state/tracks, so Echo-only rows render as
 * avatar-only placeholders until their remote participant info arrives.
 */
export function canonicalVoiceParticipantIdsForLiveKitRoom(
  echoIds: string[],
  opts: {
    remoteIdentities: Iterable<string>;
    currentUserId: string | undefined;
    liveKitConnected: boolean;
    channelMatches: boolean;
  },
): string[] {
  if (!opts.liveKitConnected || !opts.channelMatches) {
    return echoIds;
  }
  const out: string[] = [...echoIds];
  const seen = new Set(out);
  for (const id of opts.remoteIdentities) {
    if (!seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  return recoverVoiceParticipantIdsWhenLiveKitAlone(out, {
    liveKitConnected: opts.liveKitConnected,
    channelMatches: opts.channelMatches,
    currentUserId: opts.currentUserId,
  });
}

/** Merge client workspace moderation overlay with channel snapshot maps (Echo is authoritative). */
export function mergeVoiceModerationMaps(
  channelId: string,
  vcServerMuteByChannel: Record<string, Record<string, boolean>>,
  vcServerDeafenByChannel: Record<string, Record<string, boolean>>,
  voiceServerMuteByUserId: Record<string, boolean> | undefined,
  voiceServerDeafenByUserId: Record<string, boolean> | undefined,
): { muteMap: Record<string, boolean>; deafMap: Record<string, boolean> } {
  const mockMute = vcServerMuteByChannel[channelId] ?? {};
  const mockDeaf = vcServerDeafenByChannel[channelId] ?? {};
  const echoMute = voiceServerMuteByUserId ?? {};
  const echoDeaf = voiceServerDeafenByUserId ?? {};
  const muteMap: Record<string, boolean> = { ...mockMute };
  const deafMap: Record<string, boolean> = { ...mockDeaf };
  for (const [k, v] of Object.entries(echoMute)) {
    if (v) muteMap[k] = true;
  }
  for (const [k, v] of Object.entries(echoDeaf)) {
    if (v) deafMap[k] = true;
  }
  return { muteMap, deafMap };
}

export type VoiceParticipantMediaState = {
  video: boolean;
  streaming: boolean;
  simMuted: boolean;
  simDeafened: boolean;
  cameraTrack?: unknown;
  screenTrack?: unknown;
  screenAudioTrack?: unknown;
};

/**
 * LiveKit-backed row, local user with room, or neutral fallback when workspace lists a user
 * before `remoteParticipants` has an entry (no index-based placeholders).
 */
export function buildVoiceParticipantMediaState(opts: {
  isCurrentUser: boolean;
  remoteInfo: RemoteParticipantTrackInfo | undefined;
  /** When set, local user connected to LiveKit - use LiveKit flags, not stale refs. */
  lkLocalCameraScreen: { camera: boolean; screen: boolean } | null;
  /** Fallback for local user when lk room not wired (edge). */
  vcVideo: boolean;
  vcScreenshare: boolean;
}): VoiceParticipantMediaState {
  const {
    isCurrentUser,
    remoteInfo,
    lkLocalCameraScreen,
    vcVideo,
    vcScreenshare,
  } = opts;

  if (remoteInfo) {
    const hasScreenTrack = !!remoteInfo.screenTrack;
    return {
      video: remoteInfo.isCameraEnabled,
      // Drive stream layout from real media availability so stale SFU flags
      // do not leave CallView in focused-stream mode after sharing ends.
      streaming: remoteInfo.isScreenShareEnabled && hasScreenTrack,
      simMuted: !remoteInfo.isMicEnabled,
      simDeafened: false,
      cameraTrack: remoteInfo.cameraTrack,
      screenTrack: remoteInfo.screenTrack,
      screenAudioTrack: remoteInfo.screenAudioTrack,
    };
  }

  if (isCurrentUser && lkLocalCameraScreen) {
    // Require both LiveKit state and UI intent so turning camera off updates the tile
    // immediately; `isCameraEnabled` can lag behind `setCameraEnabled(false)` until unpublish.
    return {
      video: vcVideo && lkLocalCameraScreen.camera,
      streaming: vcScreenshare && lkLocalCameraScreen.screen,
      simMuted: false,
      simDeafened: false,
    };
  }

  if (isCurrentUser) {
    return {
      video: vcVideo,
      streaming: vcScreenshare,
      simMuted: false,
      simDeafened: false,
    };
  }

  return {
    video: false,
    streaming: false,
    simMuted: false,
    simDeafened: false,
  };
}
