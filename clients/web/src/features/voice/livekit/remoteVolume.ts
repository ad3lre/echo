import type { RemoteParticipant, Room as LKRoom } from 'livekit-client';
import { voiceClientDiag } from '@/observability/voiceClientTrace';
import { vcDebugLog } from '@/features/voice/vcDebugLog';
import { setAudioTrackVolumeIfSupported } from '@/features/voice/livekit/livekitTrackAdapter';
import {
  echoPlaybackEnsureAudioContextRunning,
  echoPlaybackEnsureTrackElementsWired,
} from '@/features/voice/livekit/echoRemotePlaybackWebAudio';
import {
  liveKitRemoteParticipantByIdentity,
  resolveLiveKitRemoteParticipantIdentity,
} from '@/features/voice/livekit/liveKitRoomParticipants';
import {
  gainFromVolumePercent,
  persistRemoteParticipantVolumeOverrides,
  sanitizeRemoteParticipantVolumePercent,
} from '@/features/voice/livekit/livekitVoiceRoomHelpers';
import {
  LK_KIND_AUDIO,
  LK_KIND_VIDEO,
  isLikelyMediaStream,
  mediaStreamHasMuxedAudioForRemoteGain,
  type PublicationLike,
  type TrackLike,
} from '@/features/voice/livekit/livekitTrackDuckTypes';
import type { LiveKitVoiceSessionContext } from '@/features/voice/livekit/context';

export function createRemoteVolumeController(ctx: LiveKitVoiceSessionContext) {
  const { lkRoom, lastOutputVolumePercent, remoteParticipantOutputVolume } =
    ctx;

  function remoteParticipantVolumeMultiplier(identity: string): number {
    const pct = remoteParticipantOutputVolume.value.get(identity) ?? 100;
    return Math.max(0, Math.min(2, pct / 100));
  }

  function applyRemoteOutputGainToTrack(
    track: object,
    participantIdentity: string,
  ) {
    const base = gainFromVolumePercent(lastOutputVolumePercent.value);
    const gain = base * remoteParticipantVolumeMultiplier(participantIdentity);
    const t = track as TrackLike;
    const hasSetVolume = typeof t.setVolume === 'function';
    voiceClientDiag('info', 'voice.client:apply_remote_gain', {
      trackSid: t.sid ?? 'unknown',
      gain,
      hasSetVolume,
    });
    setAudioTrackVolumeIfSupported(track, gain);
  }

  function applyRemoteOutputGainToParticipantTracks(
    p: RemoteParticipant,
    gain: number,
  ) {
    vcDebugLog(
      '[Echo:VC:Volume] applyRemoteOutputGainToParticipantTracks called',
      {
        identity: p.identity,
        gain,
        audioTrackCount: p.audioTrackPublications.size,
      },
    );
    for (const pub of p.audioTrackPublications.values()) {
      const t = pub.track;
      const trackSid =
        (t as TrackLike | null)?.sid ?? pub.trackSid ?? 'unknown';
      vcDebugLog('[Echo:VC:Volume] processing audio publication', {
        identity: p.identity,
        trackSid,
        hasTrack: !!t,
        pubTrackSid: pub.trackSid,
        isMuted: pub.isMuted,
        isSubscribed: pub.isSubscribed,
      });
      if (t) {
        echoPlaybackEnsureTrackElementsWired(t);
        setAudioTrackVolumeIfSupported(t, gain);
      }
    }
    const allPubs = p.trackPublications;
    if (allPubs) {
      for (const pub of allPubs.values()) {
        const pl = pub as PublicationLike;
        if (pl.kind !== LK_KIND_VIDEO) continue;
        const t = pl.track;
        if (!t) continue;
        const ms = (t as TrackLike).mediaStream;
        if (!isLikelyMediaStream(ms)) continue;
        if (!mediaStreamHasMuxedAudioForRemoteGain(ms)) continue;
        echoPlaybackEnsureTrackElementsWired(t);
        setAudioTrackVolumeIfSupported(t, gain);
      }
    }
  }

  function applyRemoteOutputGainToRoom(room: LKRoom) {
    const base = gainFromVolumePercent(lastOutputVolumePercent.value);
    for (const p of room.remoteParticipants.values()) {
      const mul = remoteParticipantVolumeMultiplier(p.identity);
      const g = base * mul;
      applyRemoteOutputGainToParticipantTracks(p, g);
    }
  }

  function applyRemoteOutputGainToParticipant(
    room: LKRoom,
    participantKey: string,
  ) {
    const resolvedIdentity =
      resolveLiveKitRemoteParticipantIdentity(room, participantKey) ??
      participantKey.trim();
    const p = liveKitRemoteParticipantByIdentity(room, resolvedIdentity);

    vcDebugLog('[Echo:VC:Volume] applyRemoteOutputGainToParticipant', {
      participantKey,
      resolvedIdentity,
      participantFound: !!p,
      baseVolume: lastOutputVolumePercent.value,
      participantMultiplier:
        remoteParticipantVolumeMultiplier(resolvedIdentity),
    });

    if (!p) {
      vcDebugLog('[Echo:VC:Volume] PARTICIPANT NOT FOUND', {
        participantKey,
        resolvedIdentity,
        remoteParticipants: Array.from(room.remoteParticipants.values()).map(
          (rp) => ({
            identity: rp.identity,
            sid: rp.sid,
          }),
        ),
      });
      return;
    }
    const base = gainFromVolumePercent(lastOutputVolumePercent.value);
    const g = base * remoteParticipantVolumeMultiplier(resolvedIdentity);
    applyRemoteOutputGainToParticipantTracks(p, g);
  }

  function reapplyRemotePlaybackGains(room: LKRoom) {
    void echoPlaybackEnsureAudioContextRunning();
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) {
        const pl = pub as unknown as PublicationLike;
        if (pl.kind !== LK_KIND_AUDIO) continue;
        const t = pub.track;
        if (t) echoPlaybackEnsureTrackElementsWired(t);
      }
      if (p.trackPublications) {
        for (const pub of p.trackPublications.values()) {
          const pl = pub as PublicationLike;
          if (pl.kind !== LK_KIND_VIDEO) continue;
          const t = pl.track;
          if (!t) continue;
          const ms = (t as TrackLike).mediaStream;
          if (!isLikelyMediaStream(ms)) continue;
          if (!mediaStreamHasMuxedAudioForRemoteGain(ms)) continue;
          echoPlaybackEnsureTrackElementsWired(t);
        }
      }
    }
    applyRemoteOutputGainToRoom(room);
  }

  function getRemoteParticipantVolume(userId: string): number {
    const key = userId.trim();
    if (!key) return 100;
    const room = lkRoom.value;
    const resolvedIdentity = room
      ? resolveLiveKitRemoteParticipantIdentity(room, key)
      : undefined;
    return (
      remoteParticipantOutputVolume.value.get(resolvedIdentity ?? key) ?? 100
    );
  }

  function setRemoteParticipantVolume(userId: string, volumePercent: number) {
    const key = userId.trim();
    if (!key) return;
    const v = Math.max(0, Math.min(200, Math.round(volumePercent)));
    const next = new Map(remoteParticipantOutputVolume.value);
    const room = lkRoom.value;
    const resolvedIdentity = room
      ? resolveLiveKitRemoteParticipantIdentity(room, key)
      : undefined;
    const identity = resolvedIdentity ?? key;

    vcDebugLog('[Echo:VC:Volume] setRemoteParticipantVolume called', {
      userId,
      volumePercent,
      key,
      resolvedIdentity,
      identity,
      hasRoom: !!room,
      remoteParticipantCount: room?.remoteParticipants.size ?? 0,
    });

    if (identity !== key) {
      next.delete(key);
    }
    const persisted = sanitizeRemoteParticipantVolumePercent(v);
    if (persisted == null) {
      next.delete(identity);
    } else {
      next.set(identity, persisted);
    }
    remoteParticipantOutputVolume.value = next;
    persistRemoteParticipantVolumeOverrides(next);
    if (room) applyRemoteOutputGainToParticipant(room, identity);
  }

  return {
    applyRemoteOutputGainToTrack,
    applyRemoteOutputGainToParticipantTracks,
    applyRemoteOutputGainToRoom,
    applyRemoteOutputGainToParticipant,
    reapplyRemotePlaybackGains,
    getRemoteParticipantVolume,
    setRemoteParticipantVolume,
  };
}

export type RemoteVolumeController = ReturnType<
  typeof createRemoteVolumeController
>;
