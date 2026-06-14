import { computed, ref } from 'vue';
import type { StreamVideoTileTrack } from '@/features/voice/composables/streamVideoTileTrack';
import type { RemoteParticipantTrackInfo } from '@/composables/useLiveKitVoiceRoom';
import { resolveCallTileAvatarUrl } from '@/utils/avatarDisplay';
import { getPopoutAnchorRect } from '@/utils/memberProfiles';
import { getVoiceChannelUserLimitUi } from '@/features/voice/domain/voiceChannelUserLimit';
import type {
  CallViewParticipant,
  CallViewProps,
  VisualMediaTile,
} from '@/features/voice/composables/callViewTypes';

type MediaTile = {
  id: string;
  name: string;
  pfp: string;
  isLocal: boolean;
  track: unknown | null;
};

function orderFocusedTiles<T extends { id: string }>(
  tiles: T[],
  focusId: string | null,
): T[] {
  if (!focusId) return tiles;
  const idx = tiles.findIndex((t) => t.id === focusId);
  if (idx <= 0) return tiles;
  return [tiles[idx]!, ...tiles.slice(0, idx), ...tiles.slice(idx + 1)];
}

function remoteTrackInfoForParticipant(
  props: CallViewProps,
  participantId: string,
): RemoteParticipantTrackInfo | null {
  const m = props.remoteParticipants as
    | Map<string, RemoteParticipantTrackInfo>
    | undefined
    | null;
  return m?.get(participantId) ?? null;
}

function resolveParticipantScreenShareTrack(
  props: CallViewProps,
  p: CallViewParticipant,
): unknown | null {
  if (p.screenTrack) return p.screenTrack;
  if (p.id === props.currentUserId)
    return props.getLocalScreenTrack?.() ?? null;
  return remoteTrackInfoForParticipant(props, p.id)?.screenTrack ?? null;
}

function resolveParticipantCameraTrack(
  props: CallViewProps,
  p: CallViewParticipant,
): unknown | null {
  if (p.cameraTrack) return p.cameraTrack;
  if (p.id === props.currentUserId)
    return props.getLocalCameraTrack?.() ?? null;
  return remoteTrackInfoForParticipant(props, p.id)?.cameraTrack ?? null;
}

function participantMediaTile(
  props: CallViewProps,
  p: CallViewParticipant,
  track: unknown | null,
): MediaTile {
  return {
    id: p.id,
    name: p.name,
    pfp: p.pfp,
    isLocal: p.id === props.currentUserId,
    track,
  };
}

function visualMediaTilesFrom(
  screenShareTiles: MediaTile[],
  cameraVideoTiles: MediaTile[],
  videoPrimaryDmLayout: boolean | undefined,
): VisualMediaTile[] {
  const screenMapped = screenShareTiles.map((tile) => ({
    tileId: `screen-${tile.id}`,
    mediaKind: 'screen' as const,
    ...tile,
    track: (tile.track as StreamVideoTileTrack | null) ?? null,
  }));
  const cameraMapped = cameraVideoTiles.map((tile) => ({
    tileId: `camera-${tile.id}`,
    mediaKind: 'camera' as const,
    ...tile,
    track: (tile.track as StreamVideoTileTrack | null) ?? null,
  }));
  const cameras = videoPrimaryDmLayout
    ? [...cameraMapped].sort(
        (a, b) => Number(!!a.isLocal) - Number(!!b.isLocal),
      )
    : cameraMapped;
  return [...screenMapped, ...cameras];
}

function openProfileFromTile(
  props: CallViewProps,
  userId: string,
  event: MouseEvent,
) {
  const target = event.currentTarget;
  if (!target || !props.onOpenProfile) return;
  props.onOpenProfile(userId, getPopoutAnchorRect(target, 'generic'));
}

export function useCallViewMediaTiles(props: CallViewProps) {
  const focusedStreamParticipantId = ref<string | null>(null);
  const tileAvatar = (p: { id: string; pfp: string }) =>
    resolveCallTileAvatarUrl(p.pfp, p.id);
  const handleOpenProfile = (userId: string, event: MouseEvent) =>
    openProfileFromTile(props, userId, event);

  const voiceChannelLimitUi = computed(() =>
    getVoiceChannelUserLimitUi(
      props.participants.length,
      props.voiceChannelUserLimit,
    ),
  );
  const screenShareTiles = computed(() =>
    orderFocusedTiles(
      props.participants
        .filter((p) => !!p.streaming)
        .map((p) =>
          participantMediaTile(
            props,
            p,
            resolveParticipantScreenShareTrack(props, p),
          ),
        ),
      focusedStreamParticipantId.value,
    ),
  );
  const cameraVideoTiles = computed(() =>
    orderFocusedTiles(
      props.participants
        .filter((p) => !!p.video)
        .map((p) =>
          participantMediaTile(
            props,
            p,
            resolveParticipantCameraTrack(props, p),
          ),
        ),
      focusedStreamParticipantId.value,
    ),
  );
  const visualMediaTiles = computed(() =>
    visualMediaTilesFrom(
      screenShareTiles.value,
      cameraVideoTiles.value,
      props.videoPrimaryDmLayout,
    ),
  );
  const useMeetStageLayout = computed(() => visualMediaTiles.value.length > 0);
  const prioritizedVisualMediaTiles = computed(() =>
    orderFocusedTiles(visualMediaTiles.value, focusedStreamParticipantId.value),
  );
  const stagePrimaryTile = computed(
    () => prioritizedVisualMediaTiles.value[0] ?? null,
  );
  const sideRailVisualTiles = computed(() =>
    prioritizedVisualMediaTiles.value.slice(1),
  );

  return {
    cameraVideoTiles,
    focusedStreamParticipantId,
    handleOpenProfile,
    screenShareTiles,
    sideRailVisualTiles,
    stagePrimaryTile,
    tileAvatar,
    useMeetStageLayout,
    voiceChannelLimitUi,
  };
}
