import { computed, unref, type MaybeRef } from 'vue';
import type { RemoteParticipantTrackInfo } from '@/composables/useLiveKitVoiceRoom';
import type { LayoutChatSurfaceContext } from '@/features/layout/layoutInjectionKeys';
import type { StreamVideoTileTrack } from '@/components/streamVideoTileTrack';

export type GuildVoiceStreamGlance = {
  id: string;
  name: string;
  pfp: string;
  isLocal: boolean;
  isScreenShare: boolean;
  track: StreamVideoTileTrack | null;
};

type VoiceParticipantRow = {
  id: string;
  name?: string;
  pfp?: string;
  streaming?: boolean;
  video?: boolean;
  screenTrack?: unknown;
  cameraTrack?: unknown;
};

function remoteTrackInfoFor(
  layout: LayoutChatSurfaceContext,
  userId: string,
): RemoteParticipantTrackInfo | null {
  const m = unref(
    layout.remoteParticipants as MaybeRef<
      Map<string, RemoteParticipantTrackInfo> | null | undefined
    >,
  );
  return m?.get(userId) ?? null;
}

function resolveScreenTrack(
  row: VoiceParticipantRow,
  layout: LayoutChatSurfaceContext,
  selfId: string,
): unknown | null {
  if (row.screenTrack) return row.screenTrack;
  if (row.id === selfId) {
    return (
      unref(
        layout.getLocalScreenTrack as MaybeRef<(() => unknown) | undefined>,
      )?.() ?? null
    );
  }
  return remoteTrackInfoFor(layout, row.id)?.screenTrack ?? null;
}

function resolveCameraTrack(
  row: VoiceParticipantRow,
  layout: LayoutChatSurfaceContext,
  selfId: string,
): unknown | null {
  if (row.cameraTrack) return row.cameraTrack;
  if (row.id === selfId) {
    return (
      unref(
        layout.getLocalCameraTrack as MaybeRef<(() => unknown) | undefined>,
      )?.() ?? null
    );
  }
  return remoteTrackInfoFor(layout, row.id)?.cameraTrack ?? null;
}

/** Pick the best guild VC stream/camera to show in floating PiP while away from the VC surface. */
export function pickGuildVoiceStreamGlance(
  participants: VoiceParticipantRow[],
  layout: LayoutChatSurfaceContext,
  selfId: string,
): GuildVoiceStreamGlance | null {
  void unref(
    layout.remoteParticipants as MaybeRef<
      Map<string, unknown> | null | undefined
    >,
  )?.size;

  const tryScreen = (
    row: VoiceParticipantRow,
  ): GuildVoiceStreamGlance | null => {
    if (!row.streaming) return null;
    const track = resolveScreenTrack(row, layout, selfId);
    if (!track) return null;
    return {
      id: row.id,
      name: row.name?.trim() || 'Streamer',
      pfp: row.pfp ?? '',
      isLocal: row.id === selfId,
      isScreenShare: true,
      track: track as StreamVideoTileTrack,
    };
  };

  const tryCamera = (
    row: VoiceParticipantRow,
  ): GuildVoiceStreamGlance | null => {
    if (!row.video) return null;
    const track = resolveCameraTrack(row, layout, selfId);
    if (!track) return null;
    return {
      id: row.id,
      name: row.name?.trim() || 'Camera',
      pfp: row.pfp ?? '',
      isLocal: row.id === selfId,
      isScreenShare: false,
      track: track as StreamVideoTileTrack,
    };
  };

  for (const row of participants) {
    if (row.id === selfId) continue;
    const screen = tryScreen(row);
    if (screen) return screen;
  }
  for (const row of participants) {
    if (row.id === selfId) continue;
    const cam = tryCamera(row);
    if (cam) return cam;
  }
  const self = participants.find((r) => r.id === selfId);
  if (self) {
    const screen = tryScreen(self);
    if (screen) return screen;
    const cam = tryCamera(self);
    if (cam) return cam;
  }
  return null;
}

export function useGuildVoiceStreamGlance(
  layout: LayoutChatSurfaceContext | null,
) {
  const glance = computed((): GuildVoiceStreamGlance | null => {
    if (!layout) return null;
    const selfId = String(
      unref(
        (layout as { currentUser?: MaybeRef<{ id?: string } | null> })
          .currentUser,
      )?.id ?? '',
    ).trim();
    const participants = (unref(layout.activeVoiceChannelParticipants) ??
      []) as VoiceParticipantRow[];
    if (!participants.length) return null;
    return pickGuildVoiceStreamGlance(participants, layout, selfId);
  });

  const pipVisible = computed(() => {
    if (!layout) return false;
    const voiceId = String(unref(layout.currentVoiceChannelId) ?? '').trim();
    if (!voiceId) return false;
    if (unref(layout.isViewingVoiceChannel)) return false;
    if (unref(layout.fullscreenStreamParticipantId)) return false;
    return glance.value != null;
  });

  return { glance, pipVisible };
}
