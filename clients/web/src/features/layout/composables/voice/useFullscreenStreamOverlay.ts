import { computed, onScopeDispose, watch, type Ref } from 'vue';
import type { RemoteTrack } from 'livekit-client';

type LocalTrackLike = {
  mediaStreamTrack?: MediaStreamTrack;
  track?: MediaStreamTrack;
};

type StreamTrack = RemoteTrack | LocalTrackLike | null;

type FullscreenStreamParticipant = {
  id?: string;
  name?: string | null;
  pfp?: string | null;
  screenTrack?: unknown;
  cameraTrack?: unknown;
  screenAudioTrack?: unknown;
};

const FULLSCREEN_STREAM_LOST_CLEAR_MS = 160;

/**
 * View model for the fullscreen stream overlay: resolves the active participant's
 * video/audio track, name, avatar, and screen-share flag from the current voice /
 * DM-call participants, and debounces clearing the overlay when the media track
 * briefly drops (avoids flicker on quick track swaps).
 *
 * `fullscreenStreamParticipantId` is owned by the caller (provided via
 * CALL_VIEW_FULLSCREEN_STREAM_ID_KEY and set from rail / menu actions); this
 * controller only reads it and nulls it when the stream is lost. Owns its own
 * debounce timer, cleared on scope dispose.
 */
export function useFullscreenStreamOverlay(deps: {
  fullscreenStreamParticipantId: Ref<string | null>;
  callOverlay: Readonly<Ref<{ type: string }>>;
  dmCallWithUserId: Readonly<Ref<string | null | undefined>>;
  dmCallCallViewParticipants: Readonly<
    Ref<readonly FullscreenStreamParticipant[] | null | undefined>
  >;
  activeVoiceChannelParticipants: Readonly<
    Ref<readonly FullscreenStreamParticipant[] | null | undefined>
  >;
  currentUser: Readonly<
    Ref<{ id: string; name?: string; pfp?: string } | null | undefined>
  >;
  getLocalScreenTrack: () => unknown;
  getLocalCameraTrack: () => unknown;
}) {
  const {
    fullscreenStreamParticipantId,
    callOverlay,
    dmCallWithUserId,
    dmCallCallViewParticipants,
    activeVoiceChannelParticipants,
    currentUser,
    getLocalScreenTrack,
    getLocalCameraTrack,
  } = deps;

  const voiceParticipantsForFullscreenStream = computed(() => {
    if (callOverlay.value.type === 'dmCall' && dmCallWithUserId.value?.trim()) {
      return dmCallCallViewParticipants.value;
    }
    return activeVoiceChannelParticipants.value ?? [];
  });

  const fullscreenStreamTrack = computed((): StreamTrack => {
    const pid = fullscreenStreamParticipantId.value;
    if (!pid) return null;
    if (pid === currentUser.value?.id) {
      const screen = getLocalScreenTrack();
      if (screen) return screen as StreamTrack;
      return getLocalCameraTrack() as StreamTrack;
    }
    const p = voiceParticipantsForFullscreenStream.value?.find(
      (participant) => participant.id === pid,
    );
    return (p?.screenTrack ?? p?.cameraTrack ?? null) as StreamTrack;
  });

  const fullscreenStreamAudioTrack = computed((): RemoteTrack | null => {
    const pid = fullscreenStreamParticipantId.value;
    if (!pid || pid === currentUser.value?.id) return null;
    const p = voiceParticipantsForFullscreenStream.value?.find(
      (participant) => participant.id === pid,
    );
    return (p?.screenAudioTrack ?? null) as RemoteTrack | null;
  });

  const fullscreenStreamName = computed(() => {
    const pid = fullscreenStreamParticipantId.value;
    if (!pid) return '';
    if (pid === currentUser.value?.id) return currentUser.value?.name ?? 'You';
    const p = voiceParticipantsForFullscreenStream.value?.find(
      (participant: { id?: string }) => participant.id === pid,
    );
    return p?.name ?? '';
  });

  const fullscreenStreamPfp = computed(() => {
    const pid = fullscreenStreamParticipantId.value;
    if (!pid) return '';
    if (pid === currentUser.value?.id) return currentUser.value?.pfp ?? '';
    const p = voiceParticipantsForFullscreenStream.value?.find(
      (participant: { id?: string }) => participant.id === pid,
    );
    return p?.pfp ?? '';
  });

  const fullscreenStreamIsScreenShare = computed(() => {
    const pid = fullscreenStreamParticipantId.value;
    if (!pid) return false;
    if (pid === currentUser.value?.id) return !!getLocalScreenTrack();
    const p = voiceParticipantsForFullscreenStream.value?.find(
      (participant: { id?: string }) => participant.id === pid,
    );
    return !!(p as { screenTrack?: unknown } | undefined)?.screenTrack;
  });

  let fullscreenStreamLostDefer: ReturnType<typeof setTimeout> | null = null;

  // Debounce closing fullscreen when the media track drops (avoid flicker on quick swaps).
  watch(
    fullscreenStreamTrack,
    (track) => {
      if (fullscreenStreamLostDefer != null) {
        clearTimeout(fullscreenStreamLostDefer);
        fullscreenStreamLostDefer = null;
      }
      if (!fullscreenStreamParticipantId.value) return;
      if (track) return;
      fullscreenStreamLostDefer = setTimeout(() => {
        fullscreenStreamLostDefer = null;
        if (
          fullscreenStreamParticipantId.value &&
          !fullscreenStreamTrack.value
        ) {
          fullscreenStreamParticipantId.value = null;
        }
      }, FULLSCREEN_STREAM_LOST_CLEAR_MS);
    },
    { flush: 'post' },
  );

  onScopeDispose(() => {
    if (fullscreenStreamLostDefer != null) {
      clearTimeout(fullscreenStreamLostDefer);
      fullscreenStreamLostDefer = null;
    }
  });

  return {
    fullscreenStreamTrack,
    fullscreenStreamAudioTrack,
    fullscreenStreamName,
    fullscreenStreamPfp,
    fullscreenStreamIsScreenShare,
  };
}
