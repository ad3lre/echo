import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  TrackType,
} from 'livekit-server-sdk';
import { config } from '../../config';
import { vcTrace } from '../../observability/voiceTraceLog';

/**
 * Layer 1 room naming convention (§3): `serverId:channelId`.
 * Both Echo id formats (UUID v4 and decimal snowflake) are `:` free,
 * so splitting on the first `:` always recovers both segments.
 */
export function liveKitRoomName(serverId: string, channelId: string): string {
  return `${serverId}:${channelId}`;
}

export function parseLiveKitRoomName(
  roomName: string,
): { serverId: string; channelId: string } | null {
  const idx = roomName.indexOf(':');
  if (idx < 1 || idx >= roomName.length - 1) return null;
  return {
    serverId: roomName.slice(0, idx),
    channelId: roomName.slice(idx + 1),
  };
}

/** Max characters allowed inside `metadata` JSON on join tokens (URLs only via {@link pfpForLiveKitParticipantMetadata}). */
export const LIVEKIT_PARTICIPANT_METADATA_MAX_CHARS = 2048;

/** Hard cap for serialized `metadata` passed to LiveKit (JSON overhead + safety margin). */
const LIVEKIT_METADATA_JSON_HARD_MAX_CHARS = 4096;

/**
 * Optional avatar URL for `RemoteParticipant.metadata` (`{"pfp":"..."}`).
 * **Never** embed `data:` URLs (inline SVG/PNG from mock/offline profiles) — they balloon the JWT,
 * break browser URL limits, and LiveKit validation returns 401 / broken WS auth.
 */
export function pfpForLiveKitParticipantMetadata(
  raw: string,
): string | undefined {
  const pfp = typeof raw === 'string' ? raw.trim() : '';
  if (!pfp) return undefined;
  if (pfp.length > LIVEKIT_PARTICIPANT_METADATA_MAX_CHARS) return undefined;
  const head = pfp.slice(0, 5).toLowerCase();
  if (head.startsWith('data:')) return undefined;
  if (
    pfp.startsWith('https://') ||
    pfp.startsWith('http://') ||
    pfp.startsWith('/')
  ) {
    return pfp;
  }
  return undefined;
}

export async function mintJoinToken(opts: {
  identity: string;
  name: string;
  roomName: string;
  canPublishVideo?: boolean;
  /** When false, microphone is omitted from publish sources (e.g. server mute / deafen). */
  canPublishMicrophone?: boolean;
  /** Shown on `RemoteParticipant.metadata` (e.g. JSON `{"pfp":"..."}` for VC tiles). */
  metadata?: string;
}): Promise<string> {
  let metadata = opts.metadata;
  if (
    metadata != null &&
    metadata.length > LIVEKIT_METADATA_JSON_HARD_MAX_CHARS
  ) {
    vcTrace(undefined, 'mintJoinToken:metadata_stripped_oversized', {
      byteLength: metadata.length,
    });
    metadata = undefined;
  }
  const at = new AccessToken(config.liveKitApiKey, config.liveKitApiSecret, {
    identity: opts.identity,
    name: opts.name,
    ttl: `${config.liveKitJoinTokenTtlSec}s`,
    ...(metadata != null && metadata !== '' ? { metadata } : {}),
  });
  const mic = opts.canPublishMicrophone !== false;
  const video = opts.canPublishVideo !== false;
  const sources: TrackSource[] = [];
  if (mic) sources.push(TrackSource.MICROPHONE);
  if (video) {
    // Screen share with system audio publishes SCREEN_SHARE_AUDIO; grant must allow it or publish fails.
    sources.push(
      TrackSource.CAMERA,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    );
  }
  const canPublish = sources.length > 0;
  at.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish,
    ...(canPublish ? { canPublishSources: sources } : {}),
    canSubscribe: true,
  });
  const jwt = await at.toJwt();
  vcTrace(undefined, 'mintJoinToken', {
    identity: opts.identity,
    roomName: opts.roomName,
    ttlSec: config.liveKitJoinTokenTtlSec,
    canPublishMicrophone: mic,
    canPublishVideo: video,
    canPublish,
    publishSourceCount: sources.length,
  });
  return jwt;
}

/** Room service API expects http(s) host; `LIVEKIT_PUBLIC_URL` is often ws(s). */
export function liveKitServiceHttpUrl(publicUrl: string): string {
  const u = publicUrl.trim();
  if (u.startsWith('ws://')) return `http://${u.slice(5)}`;
  if (u.startsWith('wss://')) return `https://${u.slice(6)}`;
  return u;
}

export function createLiveKitRoomServiceClient(): RoomServiceClient | null {
  if (!config.liveKitEnabled) return null;
  return new RoomServiceClient(
    liveKitServiceHttpUrl(config.liveKitPublicUrl),
    config.liveKitApiKey,
    config.liveKitApiSecret,
  );
}

export async function listLiveKitRooms(): Promise<
  Awaited<ReturnType<RoomServiceClient['listRooms']>>
> {
  const c = createLiveKitRoomServiceClient();
  if (!c) return [];
  return await c.listRooms();
}

export async function listLiveKitParticipants(roomName: string) {
  const c = createLiveKitRoomServiceClient();
  if (!c) return [];
  try {
    return await c.listParticipants(roomName);
  } catch (err) {
    vcTrace(undefined, 'listLiveKitParticipants:error', {
      roomName,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function removeLiveKitParticipant(
  roomName: string,
  identity: string,
): Promise<void> {
  const c = createLiveKitRoomServiceClient();
  if (!c) return;
  vcTrace(undefined, 'removeLiveKitParticipant:before', { roomName, identity });
  try {
    await c.removeParticipant(roomName, identity);
    vcTrace(undefined, 'removeLiveKitParticipant:ok', { roomName, identity });
  } catch (err) {
    vcTrace(undefined, 'removeLiveKitParticipant:error', {
      roomName,
      identity,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function muteLiveKitParticipantTrack(opts: {
  roomName: string;
  identity: string;
  trackSid: string;
  muted: boolean;
}): Promise<void> {
  const c = createLiveKitRoomServiceClient();
  if (!c) return;
  vcTrace(undefined, 'mutePublishedTrack:before', {
    roomName: opts.roomName,
    identity: opts.identity,
    trackSid: opts.trackSid,
    muted: opts.muted,
  });
  try {
    await c.mutePublishedTrack(
      opts.roomName,
      opts.identity,
      opts.trackSid,
      opts.muted,
    );
    vcTrace(undefined, 'mutePublishedTrack:ok', {
      roomName: opts.roomName,
      identity: opts.identity,
      trackSid: opts.trackSid,
    });
  } catch (err) {
    vcTrace(undefined, 'mutePublishedTrack:error', {
      roomName: opts.roomName,
      identity: opts.identity,
      trackSid: opts.trackSid,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Mute or unmute the participant's published microphone track (if any). */
export async function setLiveKitParticipantMicrophoneMuted(opts: {
  roomName: string;
  identity: string;
  muted: boolean;
}): Promise<void> {
  const c = createLiveKitRoomServiceClient();
  if (!c) return;
  vcTrace(undefined, 'setLiveKitParticipantMicrophoneMuted:start', {
    roomName: opts.roomName,
    identity: opts.identity,
    muted: opts.muted,
  });
  let participants: Awaited<ReturnType<RoomServiceClient['listParticipants']>>;
  try {
    participants = await c.listParticipants(opts.roomName);
  } catch (err) {
    vcTrace(
      undefined,
      'setLiveKitParticipantMicrophoneMuted:listParticipants_failed',
      {
        roomName: opts.roomName,
        err: err instanceof Error ? err.message : String(err),
      },
    );
    return;
  }
  vcTrace(undefined, 'setLiveKitParticipantMicrophoneMuted:listParticipants', {
    roomName: opts.roomName,
    participantCount: participants.length,
    identities: participants.map((x) => x.identity),
  });
  const p = participants.find((x) => x.identity === opts.identity);
  if (!p?.tracks?.length) {
    vcTrace(undefined, 'setLiveKitParticipantMicrophoneMuted:no_tracks', {
      roomName: opts.roomName,
      identity: opts.identity,
      foundParticipant: !!p,
    });
    return;
  }
  for (const t of p.tracks) {
    if (t.type === TrackType.AUDIO && t.source === TrackSource.MICROPHONE) {
      vcTrace(undefined, 'setLiveKitParticipantMicrophoneMuted:mic_track', {
        trackSid: t.sid,
        muted: opts.muted,
      });
      await muteLiveKitParticipantTrack({
        roomName: opts.roomName,
        identity: opts.identity,
        trackSid: t.sid,
        muted: opts.muted,
      });
      return;
    }
  }
  vcTrace(undefined, 'setLiveKitParticipantMicrophoneMuted:no_mic_track', {
    roomName: opts.roomName,
    identity: opts.identity,
    trackSources: p.tracks.map((t) => ({ type: t.type, source: t.source })),
  });
}

/** Mute published tracks for the given sources (camera / screen share). Returns count muted. */
export async function muteLiveKitParticipantPublishedSources(opts: {
  roomName: string;
  identity: string;
  sources: TrackSource[];
}): Promise<number> {
  const c = createLiveKitRoomServiceClient();
  if (!c || opts.sources.length === 0) return 0;
  const sourceSet = new Set(opts.sources);
  vcTrace(undefined, 'muteLiveKitParticipantPublishedSources:start', {
    roomName: opts.roomName,
    identity: opts.identity,
    sources: opts.sources,
  });
  let participants: Awaited<ReturnType<RoomServiceClient['listParticipants']>>;
  try {
    participants = await c.listParticipants(opts.roomName);
  } catch (err) {
    vcTrace(undefined, 'muteLiveKitParticipantPublishedSources:list_failed', {
      roomName: opts.roomName,
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
  const p = participants.find((x) => x.identity === opts.identity);
  if (!p?.tracks?.length) return 0;
  let muted = 0;
  for (const t of p.tracks) {
    if (t.source == null || !sourceSet.has(t.source)) continue;
    await muteLiveKitParticipantTrack({
      roomName: opts.roomName,
      identity: opts.identity,
      trackSid: t.sid,
      muted: true,
    });
    muted += 1;
  }
  vcTrace(undefined, 'muteLiveKitParticipantPublishedSources:ok', {
    roomName: opts.roomName,
    identity: opts.identity,
    muted,
  });
  return muted;
}

export async function stopLiveKitParticipantCamera(opts: {
  roomName: string;
  identity: string;
}): Promise<number> {
  return muteLiveKitParticipantPublishedSources({
    roomName: opts.roomName,
    identity: opts.identity,
    sources: [TrackSource.CAMERA],
  });
}

export async function stopLiveKitParticipantScreenShare(opts: {
  roomName: string;
  identity: string;
}): Promise<number> {
  return muteLiveKitParticipantPublishedSources({
    roomName: opts.roomName,
    identity: opts.identity,
    sources: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
  });
}

export async function deleteLiveKitRoom(roomName: string): Promise<void> {
  const c = createLiveKitRoomServiceClient();
  if (!c) return;
  vcTrace(undefined, 'deleteLiveKitRoom:before', { roomName });
  try {
    await c.deleteRoom(roomName);
    vcTrace(undefined, 'deleteLiveKitRoom:ok', { roomName });
  } catch (err) {
    vcTrace(undefined, 'deleteLiveKitRoom:error', {
      roomName,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
