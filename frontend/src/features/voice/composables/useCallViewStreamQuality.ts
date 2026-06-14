import { inject, ref, watch } from 'vue';
import { CALL_VIEW_FULLSCREEN_STREAM_ID_KEY } from '@/features/layout/layoutInjectionKeys';
import { liveKitRemoteParticipantByIdentity } from '@/services/livekit/liveKitRoomParticipants';
import type {
  CallViewParticipant,
  CallViewProps,
  RemoteParticipantLike,
  RemoteTrackPublicationLike,
  StreamQuality,
} from '@/features/voice/composables/callViewTypes';
import { streamQualityToLiveKitValue } from '@/features/voice/composables/callViewTypes';

export function getParticipantVideoPublication(
  props: CallViewProps,
  p: CallViewParticipant | null | undefined,
): RemoteTrackPublicationLike | null {
  if (!p) return null;
  const room = props.lkRoom as
    | Parameters<typeof liveKitRemoteParticipantByIdentity>[0]
    | null
    | undefined;
  if (!room || p.id === props.currentUserId) return null;
  const participant = liveKitRemoteParticipantByIdentity(room, p.id) as
    | RemoteParticipantLike
    | undefined;
  if (!participant) return null;
  if (p.streaming)
    return participant.getTrackPublication('screen_share') ?? null;
  if (p.video) return participant.getTrackPublication('camera') ?? null;
  return null;
}

export function applyParticipantStreamQuality(
  props: CallViewProps,
  p: CallViewParticipant | null | undefined,
  quality: StreamQuality,
) {
  const publication = getParticipantVideoPublication(props, p);
  if (!publication) return;
  publication.setEnabled(true);
  publication.setVideoQuality(streamQualityToLiveKitValue(quality));
}

function markStreamLayerManual(
  manualByParticipantId: Record<string, true>,
  participantId: string,
): Record<string, true> {
  return { ...manualByParticipantId, [participantId]: true };
}

export function useCallViewStreamQuality(props: CallViewProps) {
  const streamLayerManualByParticipantId = ref<Record<string, true>>({});
  const fullscreenStreamParticipantIdForLayers = inject(
    CALL_VIEW_FULLSCREEN_STREAM_ID_KEY,
    ref<string | null>(null),
  );
  const callMenuStreamQuality = ref<StreamQuality>('high');

  watch(fullscreenStreamParticipantIdForLayers, (next, prev) => {
    if (prev && !next) streamLayerManualByParticipantId.value = {};
  });

  const handleStreamTileAutoQuality = (payload: {
    participantId: string;
    quality: StreamQuality;
  }) => {
    if (streamLayerManualByParticipantId.value[payload.participantId]) return;
    const p =
      props.participants.find((x) => x.id === payload.participantId) ?? null;
    applyParticipantStreamQuality(props, p, payload.quality);
  };

  const handleStreamTileManualQuality = (payload: {
    participantId: string;
    quality: StreamQuality;
  }) => {
    streamLayerManualByParticipantId.value = markStreamLayerManual(
      streamLayerManualByParticipantId.value,
      payload.participantId,
    );
    const p =
      props.participants.find((x) => x.id === payload.participantId) ?? null;
    applyParticipantStreamQuality(props, p, payload.quality);
  };

  const handleRequestFullscreen = (participantId: string) => {
    const participant =
      props.participants.find((candidate) => candidate.id === participantId) ??
      null;
    applyParticipantStreamQuality(props, participant, 'high');
    props.onRequestFullscreenStream?.(participantId);
  };

  return {
    callMenuStreamQuality,
    getParticipantVideoPublication: (p: CallViewParticipant | null) =>
      getParticipantVideoPublication(props, p),
    handleRequestFullscreen,
    handleStreamTileAutoQuality,
    handleStreamTileManualQuality,
    setParticipantStreamQuality: (
      p: CallViewParticipant | null | undefined,
      quality: StreamQuality,
    ) => applyParticipantStreamQuality(props, p, quality),
    streamLayerManualByParticipantId,
  };
}
