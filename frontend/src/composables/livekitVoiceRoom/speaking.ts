import {
  ParticipantEvent,
  RoomEvent,
  type LocalAudioTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type Room as LKRoom,
} from 'livekit-client';
import { voiceClientDiag } from '@/observability/voiceClientTrace';
import { vcDebugLog } from '@/utils/vcDebugLog';
import {
  LK_KIND_AUDIO,
  LK_SOURCE_MICROPHONE,
  type PublicationLike,
  type TrackLike,
} from '@/services/livekit/livekitTrackDuckTypes';
import {
  createRemoteSpeakingTracker,
  indicatorReleaseRmsFromOn,
  indicatorRmsFromGatePercent,
  mergeSpeakingMapIfChanged,
  SPEAKING_INDICATOR_REMOTE_POLL_MS,
} from '@/composables/voiceGate';
import { useVoiceLevelsStore } from '@/stores/voiceLevels';
import type { ParticipantAudioLevel } from '@/composables/livekitVoiceRoom.types';
import type { LiveKitVoiceSessionContext } from '@/composables/livekitVoiceRoom/context';

const MIC_ATTACH_LOG_MAX = 6;

export function createSpeakingController(ctx: LiveKitVoiceSessionContext) {
  const {
    lkRoom,
    roomState,
    speakingMap,
    localSpeaking,
    localAudioLevel,
    localMicMonitor,
    activeSpeakerCleanup,
    syncSpeakingLevelsFromRoom,
    audioHealthInterval,
    vcDeafenedInternal,
    lastOutputVolumePercent,
    micAttachDiagLogs,
  } = ctx;
  const voiceLevels = useVoiceLevelsStore();

  function teardownSpeakerTracking() {
    activeSpeakerCleanup.value?.();
    activeSpeakerCleanup.value = null;
    syncSpeakingLevelsFromRoom.value = null;
    localMicMonitor.stop();
    speakingMap.value = {};
    localSpeaking.value = false;
    localAudioLevel.value = 0;
  }

  function stopAudioHealthPolling() {
    if (audioHealthInterval.value !== null) {
      clearInterval(audioHealthInterval.value);
      audioHealthInterval.value = null;
    }
  }

  function dumpRemoteAudioTrackState(
    room: LKRoom,
    label: string,
  ): Record<string, unknown>[] {
    const tracks: Record<string, unknown>[] = [];
    for (const rp of room.remoteParticipants.values()) {
      for (const pub of rp.audioTrackPublications.values()) {
        const p = pub as PublicationLike;
        const t = p.track as
          | (RemoteTrack & { mediaStreamTrack?: MediaStreamTrack })
          | undefined;
        const mst = t?.mediaStreamTrack;
        tracks.push({
          identity: rp.identity,
          trackSid: p.trackSid,
          source: String(p.source),
          isSubscribed: p.isSubscribed,
          isMuted: p.isMuted,
          hasTrack: !!t,
          mstReadyState: mst?.readyState ?? 'none',
          mstEnabled: mst?.enabled ?? null,
          mstMuted: mst
            ? (mst as unknown as { muted?: boolean }).muted === true
            : null,
        });
      }
    }
    const canPlaybackAudio = (room as unknown as { canPlaybackAudio?: boolean })
      .canPlaybackAudio;
    vcDebugLog('[Echo:VC:Audio] ' + label, {
      canPlaybackAudio: canPlaybackAudio ?? '(unavailable)',
      deafened: vcDeafenedInternal.value,
      outputVolume: lastOutputVolumePercent.value,
      remoteParticipants: room.remoteParticipants.size,
      audioTracks: tracks.length,
      tracks,
    });
    voiceClientDiag('info', 'voice.client:audio_track_state', {
      label,
      canPlaybackAudio: canPlaybackAudio ?? null,
      deafened: vcDeafenedInternal.value,
      outputVolume: lastOutputVolumePercent.value,
      remoteParticipants: room.remoteParticipants.size,
      audioTracks: tracks.length,
      tracks,
    });
    return tracks;
  }

  function dumpLiveKitDomAudioElements(): void {
    if (typeof document === 'undefined') return;
    const audioEls = Array.from(document.querySelectorAll('audio'));
    const elDetails = audioEls.map((el) => ({
      id: el.id || null,
      src: el.src ? el.src.slice(0, 60) : null,
      hasSrcObject: !!el.srcObject,
      paused: el.paused,
      muted: el.muted,
      volume: el.volume,
      readyState: el.readyState,
      autoplay: el.autoplay,
    }));
    vcDebugLog('[Echo:VC:Audio] dom_audio_elements', {
      count: audioEls.length,
      elements: elDetails,
    });
    voiceClientDiag('info', 'voice.client:dom_audio_elements', {
      count: audioEls.length,
      tracks: elDetails,
    });
  }

  function startAudioHealthPolling(room: LKRoom) {
    stopAudioHealthPolling();
    audioHealthInterval.value = setInterval(() => {
      if (!lkRoom.value || lkRoom.value !== room) {
        stopAudioHealthPolling();
        return;
      }
      dumpRemoteAudioTrackState(room, 'health_poll');
      dumpLiveKitDomAudioElements();
    }, 5000);
  }

  function refreshLocalMicLevelMonitor(room: LKRoom | null) {
    if (!room || lkRoom.value !== room || roomState.value !== 'connected') {
      localMicMonitor.stop();
      return;
    }
    const pub = room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
    const track = pub?.track;
    if (!track || (track as TrackLike).kind !== LK_KIND_AUDIO) {
      localMicMonitor.stop();
      return;
    }
    const lat = track as LocalAudioTrack;
    const mst = lat.mediaStreamTrack;
    if (!mst || mst.readyState === 'ended') {
      localMicMonitor.stop();
      return;
    }
    localMicMonitor.attachStream(new MediaStream([mst]));
    if (micAttachDiagLogs.value < MIC_ATTACH_LOG_MAX) {
      micAttachDiagLogs.value++;
      voiceClientDiag('info', 'voice.client:mic_monitor_attached', {
        roomName: room.name,
        mstReadyState: mst.readyState,
        mstEnabled: mst.enabled,
        mstMuted: mst.muted === true,
        audioCtx: localMicMonitor.audioContextState.value ?? 'unknown',
        audioCtxSampleRate: localMicMonitor.audioContextSampleRate.value ?? 0,
      });
    }
  }

  function setupActiveSpeakerTracking(room: LKRoom) {
    teardownSpeakerTracking();
    const remoteSpeakingUnsubs = new Map<RemoteParticipant, () => void>();
    const remoteSpeakingTracker = createRemoteSpeakingTracker();

    function syncSpeakingMapFromRoom() {
      if (lkRoom.value !== room || roomState.value !== 'connected') return;
      const indicatorOn = indicatorRmsFromGatePercent(
        voiceLevels.voiceActivationThresholdPercent,
      );
      const indicatorOff = indicatorReleaseRmsFromOn(indicatorOn);
      const newMap: Record<string, ParticipantAudioLevel> = {};
      const localId = room.localParticipant.identity;
      for (const p of room.remoteParticipants.values()) {
        const id = p.identity;
        const lvl = p.audioLevel ?? 0;
        const isSpeaking = remoteSpeakingTracker.speakingFor(
          id,
          lvl,
          p.isSpeaking,
          indicatorOn,
          indicatorOff,
        );
        newMap[id] = { level: lvl, speaking: isSpeaking };
      }
      newMap[localId] = {
        level: localAudioLevel.value,
        speaking: localSpeaking.value,
      };
      speakingMap.value = mergeSpeakingMapIfChanged(speakingMap.value, newMap);
    }

    function attachRemoteSpeakingWatch(p: RemoteParticipant) {
      if (remoteSpeakingUnsubs.has(p)) return;
      const onChange = () => syncSpeakingMapFromRoom();
      p.on(ParticipantEvent.IsSpeakingChanged, onChange);
      remoteSpeakingUnsubs.set(p, () => {
        p.off(ParticipantEvent.IsSpeakingChanged, onChange);
      });
    }

    function detachRemoteSpeakingWatch(p: RemoteParticipant) {
      remoteSpeakingUnsubs.get(p)?.();
      remoteSpeakingUnsubs.delete(p);
      remoteSpeakingTracker.remove(p.identity);
    }

    const onActiveSpeakersChanged = () => syncSpeakingMapFromRoom();
    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);

    const onParticipantConnectedSpeaking = (p: RemoteParticipant) => {
      attachRemoteSpeakingWatch(p);
      syncSpeakingMapFromRoom();
    };
    room.on(RoomEvent.ParticipantConnected, onParticipantConnectedSpeaking);

    const onParticipantDisconnectedSpeaking = (p: RemoteParticipant) => {
      detachRemoteSpeakingWatch(p);
      syncSpeakingMapFromRoom();
    };
    room.on(
      RoomEvent.ParticipantDisconnected,
      onParticipantDisconnectedSpeaking,
    );

    for (const p of room.remoteParticipants.values()) {
      attachRemoteSpeakingWatch(p);
    }

    syncSpeakingLevelsFromRoom.value = syncSpeakingMapFromRoom;

    const speakingPoll = setInterval(() => {
      if (lkRoom.value !== room || roomState.value !== 'connected') return;
      syncSpeakingMapFromRoom();
    }, SPEAKING_INDICATOR_REMOTE_POLL_MS);

    activeSpeakerCleanup.value = () => {
      clearInterval(speakingPoll);
      room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnectedSpeaking);
      room.off(
        RoomEvent.ParticipantDisconnected,
        onParticipantDisconnectedSpeaking,
      );
      for (const off of remoteSpeakingUnsubs.values()) {
        off();
      }
      remoteSpeakingUnsubs.clear();
      remoteSpeakingTracker.clear();
      syncSpeakingLevelsFromRoom.value = null;
    };

    syncSpeakingMapFromRoom();
  }

  return {
    teardownSpeakerTracking,
    stopAudioHealthPolling,
    dumpRemoteAudioTrackState,
    dumpLiveKitDomAudioElements,
    startAudioHealthPolling,
    refreshLocalMicLevelMonitor,
    setupActiveSpeakerTracking,
  };
}

export type SpeakingController = ReturnType<typeof createSpeakingController>;
