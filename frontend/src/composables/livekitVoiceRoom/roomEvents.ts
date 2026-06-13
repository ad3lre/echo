import {
  ConnectionState,
  DisconnectReason,
  RoomEvent,
  type LocalTrackPublication,
  type RemoteParticipant,
  type Room as LKRoom,
} from 'livekit-client';
import {
  voiceClientDiag,
  voiceClientTrace,
} from '@/observability/voiceClientTrace';
import { vcDebugLog } from '@/utils/vcDebugLog';
import {
  decodeEchoVcData,
  decodeEchoVcPrivateViewer,
} from '@/audio/voiceEchoLiveKitData';
import {
  announceVoiceChannelPublic,
  playEchoSound,
} from '@/composables/useEchoSounds';
import {
  echoPlaybackCleanupForRemoteTrack,
  echoPlaybackEnsureAudioContextRunning,
  echoPlaybackRegisterTrackElement,
} from '@/services/livekit/echoRemotePlaybackWebAudio';
import { liveKitRemoteParticipantByIdentity } from '@/services/livekit/liveKitRoomParticipants';
import { routeVoiceDataReceived } from '@/services/livekit/livekitVoiceDataChannel';
import { VIEWER_LEAVE_SOUND_DEDUP_MS } from '@/services/livekit/livekitVoiceRoomHelpers';
import {
  LK_KIND_AUDIO,
  LK_KIND_VIDEO,
  LK_SOURCE_CAMERA,
  LK_SOURCE_MICROPHONE,
  LK_SOURCE_SCREEN_SHARE,
  type PublicationLike,
  type TrackLike,
} from '@/services/livekit/livekitTrackDuckTypes';
import type { LiveKitVoiceSessionContext } from '@/composables/livekitVoiceRoom/context';

export function createRoomEventsController(ctx: LiveKitVoiceSessionContext) {
  const {
    roomState,
    isCameraEnabled,
    isScreenShareEnabled,
    vcDeafenedInternal,
    lastOutputVolumePercent,
    viewerLeaveSoundAt,
    dataHandlers,
    opts,
    actions,
  } = ctx;
  const onRemoteParticipantDisconnected = opts.onRemoteParticipantDisconnected;

  function shouldPlayViewerLeaveSound(identity: string): boolean {
    const now = Date.now();
    const last = viewerLeaveSoundAt.get(identity);
    if (last != null && now - last < VIEWER_LEAVE_SOUND_DEDUP_MS) return false;
    viewerLeaveSoundAt.set(identity, now);
    return true;
  }

  function attachRoomEventHandlers(room: LKRoom) {
    room.on(RoomEvent.Reconnecting, () => {
      voiceClientTrace('voice.client:lk_room_reconnecting', {});
      voiceClientDiag('info', 'voice.client:room_reconnecting', {});
      actions.stopStatsPolling();
      roomState.value = 'connecting';
    });

    room.on(RoomEvent.Reconnected, () => {
      voiceClientTrace('voice.client:lk_room_reconnected', {});
      voiceClientDiag('info', 'voice.client:room_reconnected', {});
      roomState.value = 'connected';
      actions.startStatsPolling();
      actions.reapplyRemotePlaybackGains(room);
      void actions.attachMicSendProcessorIfNeeded(room).then(() => {
        actions.refreshLocalMicLevelMonitor(room);
      });
    });

    room.on(RoomEvent.Connected, () => {
      voiceClientTrace('voice.client:lk_room_connected_event', {});
      voiceClientDiag('info', 'voice.client:room_connected_event', {});
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      voiceClientTrace('voice.client:lk_room_disconnected', {
        reason: String(reason),
      });
      voiceClientDiag('info', 'voice.client:room_disconnected', {
        reason: String(reason),
      });
      const clientInitiated =
        DisconnectReason != null &&
        reason === DisconnectReason.CLIENT_INITIATED;
      actions.teardownRoomSession(reason, !clientInitiated);
    });

    room.on(RoomEvent.DataReceived, (payload, participant) => {
      if (!participant?.identity) return;
      if (participant.identity === room.localParticipant.identity) return;

      const msg = decodeEchoVcData(payload);
      if (msg) {
        const label =
          msg.name?.trim() || participant.name?.trim() || participant.identity;
        switch (msg.kind) {
          case 'stream_start':
            announceVoiceChannelPublic({
              title: `${label} started streaming`,
              sound: 'streamStart',
            });
            break;
          case 'stream_end':
            announceVoiceChannelPublic({
              title: `${label} stopped streaming`,
              sound: 'streamEnd',
            });
            break;
          case 'video_start':
            announceVoiceChannelPublic({
              title: `${label} turned on their camera`,
              sound: 'videoStart',
            });
            break;
          case 'video_end':
            announceVoiceChannelPublic({
              title: `${label} turned off their camera`,
              sound: 'videoEnd',
            });
            break;
        }
        return;
      }

      routeVoiceDataReceived(payload, participant.identity, dataHandlers);

      const priv = decodeEchoVcPrivateViewer(payload);
      if (priv?.kind === 'viewer_left_stream') {
        if (priv.viewerId !== participant.identity) return;
        if (!isScreenShareEnabled.value) return;
        if (shouldPlayViewerLeaveSound(priv.viewerId)) {
          playEchoSound('streamViewerLeave');
        }
      }
    });

    room.on(RoomEvent.ParticipantConnected, (p) => {
      voiceClientTrace('voice.client:lk_participant_connected', {
        identity: p.identity,
      });
      voiceClientDiag('info', 'voice.client:participant_joined', {
        identity: p.identity,
      });
      actions.onParticipantConnectedWhileDeafened(p);
      if (isScreenShareEnabled.value) {
        playEchoSound('streamViewerArrive');
      } else {
        playEchoSound('joinVoiceChannel');
      }
      actions.syncRemoteParticipants(room);
    });

    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      voiceClientTrace('voice.client:lk_participant_disconnected', {
        identity: p.identity,
      });
      voiceClientDiag('info', 'voice.client:participant_left', {
        identity: p.identity,
      });
      if (isScreenShareEnabled.value) {
        if (shouldPlayViewerLeaveSound(p.identity)) {
          playEchoSound('streamViewerLeave');
        }
      } else {
        playEchoSound('leaveVc');
      }
      onRemoteParticipantDisconnected?.(p.identity);
      actions.syncRemoteParticipants(room);
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (
        !participant.isLocal &&
        (publication as PublicationLike).source === LK_SOURCE_SCREEN_SHARE &&
        (track as TrackLike).kind === LK_KIND_VIDEO
      ) {
        playEchoSound('streamJoinSelf');
      }
      if (!participant.isLocal && (track as TrackLike).kind === LK_KIND_AUDIO) {
        const mst = (
          track as unknown as { mediaStreamTrack?: MediaStreamTrack }
        ).mediaStreamTrack;
        const canPlaybackAudio = (
          room as unknown as { canPlaybackAudio?: boolean }
        ).canPlaybackAudio;
        const detail = {
          identity: participant.identity,
          trackSid: (publication as PublicationLike).trackSid,
          source: String((publication as PublicationLike).source),
          isSubscribed: (publication as PublicationLike).isSubscribed,
          isMuted: (publication as PublicationLike).isMuted,
          deafened: vcDeafenedInternal.value,
          hasMediaStreamTrack: !!mst,
          mstReadyState: mst?.readyState ?? 'none',
          mstEnabled: mst?.enabled ?? null,
          mstMuted: mst
            ? (mst as unknown as { muted?: boolean }).muted === true
            : null,
          canPlaybackAudio: canPlaybackAudio ?? null,
          outputVolume: lastOutputVolumePercent.value,
        };
        vcDebugLog('[Echo:VC:Audio] remote_audio_track_subscribed', detail);
        voiceClientDiag(
          'info',
          'voice.client:remote_audio_track_subscribed',
          detail,
        );

        if (mst) {
          mst.onmute = () => {
            const canPlay = (room as unknown as { canPlaybackAudio?: boolean })
              .canPlaybackAudio;
            voiceClientDiag('warn', 'voice.client:mst_mute_event', {
              identity: participant.identity,
              trackSid: (publication as PublicationLike).trackSid,
              mstReadyState: mst.readyState,
              canPlaybackAudio: canPlay ?? null,
            });
          };
          mst.onunmute = () => {
            const canPlay = (room as unknown as { canPlaybackAudio?: boolean })
              .canPlaybackAudio;
            voiceClientDiag('info', 'voice.client:mst_unmute_event', {
              identity: participant.identity,
              trackSid: (publication as PublicationLike).trackSid,
              mstReadyState: mst.readyState,
              canPlaybackAudio: canPlay ?? null,
            });
          };
        }
      }
      if (
        vcDeafenedInternal.value &&
        !participant.isLocal &&
        (track as TrackLike).kind === LK_KIND_AUDIO
      ) {
        void (publication as PublicationLike).setSubscribed?.(false);
      }
      if (!participant.isLocal && (track as TrackLike).kind === LK_KIND_AUDIO) {
        const audioEl = (track as TrackLike).attach?.();
        if (!audioEl) {
          actions.syncRemoteParticipants(room);
          return;
        }
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        void echoPlaybackEnsureAudioContextRunning();
        echoPlaybackRegisterTrackElement(track, audioEl);
        actions.applyRemoteOutputGainToTrack(track, participant.identity);
        queueMicrotask(() => actions.dumpLiveKitDomAudioElements());
      }
      actions.syncRemoteParticipants(room);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (
        !participant?.isLocal &&
        (track as TrackLike).kind === LK_KIND_AUDIO
      ) {
        const detached = (track as TrackLike).detach?.() ?? [];
        echoPlaybackCleanupForRemoteTrack(track, detached);
        detached.forEach((el: HTMLMediaElement) => el.remove());
      }
      if (
        participant &&
        !participant.isLocal &&
        (publication as PublicationLike).source === LK_SOURCE_SCREEN_SHARE &&
        (track as TrackLike).kind === LK_KIND_VIDEO
      ) {
        const streamerIdentity = participant.identity;
        const trackSid = (publication as PublicationLike).trackSid ?? '';
        queueMicrotask(() => {
          if (room.state !== ConnectionState.Connected) return;
          const remote = liveKitRemoteParticipantByIdentity(
            room,
            streamerIdentity,
          );
          if (!remote) return;
          const pubStill = remote.getTrackPublicationBySid(trackSid);
          if (!pubStill) {
            return;
          }
          actions.notifyStreamerViewerLeftStream(room, streamerIdentity);
        });
      }
      actions.syncRemoteParticipants(room);
    });

    room.on(RoomEvent.TrackPublished, (_publication, participant) => {
      if (!participant?.isLocal) {
        actions.syncRemoteParticipants(room);
      }
    });

    room.on(RoomEvent.TrackUnpublished, (_publication, participant) => {
      if (!participant?.isLocal) {
        actions.syncRemoteParticipants(room);
      }
    });

    room.on(RoomEvent.TrackMuted, (pub, participant) => {
      if (
        !participant?.isLocal &&
        (pub as PublicationLike).kind === LK_KIND_AUDIO
      ) {
        voiceClientDiag('warn', 'voice.client:track_muted_event', {
          identity: participant?.identity ?? null,
          trackSid: pub.trackSid,
        });
      }
      actions.syncRemoteParticipants(room);
    });

    room.on(RoomEvent.TrackUnmuted, (pub, participant) => {
      if (
        !participant?.isLocal &&
        (pub as PublicationLike).kind === LK_KIND_AUDIO
      ) {
        voiceClientDiag('info', 'voice.client:track_unmuted_event', {
          identity: participant?.identity ?? null,
          trackSid: pub.trackSid,
        });
      }
      actions.syncRemoteParticipants(room);
    });

    if (RoomEvent.AudioPlaybackStatusChanged) {
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        const canPlay = (room as unknown as { canPlaybackAudio?: boolean })
          .canPlaybackAudio;
        voiceClientDiag('info', 'voice.client:audio_playback_status_changed', {
          canPlaybackAudio: canPlay ?? null,
        });
        actions.reapplyRemotePlaybackGains(room);
      });
    }

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      const canPlay = (room as unknown as { canPlaybackAudio?: boolean })
        .canPlaybackAudio;
      voiceClientDiag('info', 'voice.client:connection_state_changed', {
        connectionState: String(state),
        canPlaybackAudio: canPlay ?? null,
      });
    });

    room.on(RoomEvent.LocalTrackPublished, (pub) => {
      const p = pub as LocalTrackPublication & PublicationLike;
      if (p.source === LK_SOURCE_CAMERA) {
        isCameraEnabled.value = true;
        if (p.kind === LK_KIND_VIDEO) {
          actions.announceLocalVcPublic(room, 'video_start');
        }
      } else if (p.source === LK_SOURCE_SCREEN_SHARE) {
        isScreenShareEnabled.value = true;
        if (p.kind === LK_KIND_VIDEO) {
          actions.announceLocalVcPublic(room, 'stream_start');
        }
      } else if (p.source === LK_SOURCE_MICROPHONE) {
        actions.refreshLocalMicLevelMonitor(room);
        actions.applyLocalMicGain(room);
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
      const p = pub as LocalTrackPublication & PublicationLike;
      if (p.source === LK_SOURCE_CAMERA) {
        isCameraEnabled.value = false;
        if (p.kind === LK_KIND_VIDEO) {
          actions.announceLocalVcPublic(room, 'video_end');
        }
      } else if (p.source === LK_SOURCE_SCREEN_SHARE) {
        isScreenShareEnabled.value = false;
        if (p.kind === LK_KIND_VIDEO) {
          actions.announceLocalVcPublic(room, 'stream_end');
        }
      } else if (p.source === LK_SOURCE_MICROPHONE) {
        actions.refreshLocalMicLevelMonitor(room);
      }
    });

    actions.setupActiveSpeakerTracking(room);
  }

  return { attachRoomEventHandlers, shouldPlayViewerLeaveSound };
}

export type RoomEventsController = ReturnType<
  typeof createRoomEventsController
>;
