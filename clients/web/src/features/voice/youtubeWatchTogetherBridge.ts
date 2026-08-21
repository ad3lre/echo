import type {
  EchoYoutubeActivityV1,
  EchoYoutubePlaybackSyncV1,
} from '@/audio/voiceEchoLiveKitData';
import type { VcActivityUiState } from '@/features/voice/vcActivityTypes';

/** When true, the next `vcActivityUi` deep change should not re-publish to LiveKit. */
let suppressLocalPublish = false;

export function withYoutubeWatchTogetherSuppressPublish<T>(fn: () => T): T {
  suppressLocalPublish = true;
  try {
    return fn();
  } finally {
    queueMicrotask(() => {
      suppressLocalPublish = false;
    });
  }
}

export function shouldPublishYoutubeWatchTogether(): boolean {
  return !suppressLocalPublish;
}

/**
 * True when applying `msg` would be a no-op on the local VC activity UI
 * (ignores playlist title/thumbnail drift; compares YouTube ids + indices).
 */
export function youtubeWatchTogetherPayloadMatchesLocalUi(
  msg: EchoYoutubeActivityV1,
  local: VcActivityUiState,
): boolean {
  if (msg.activityPhase !== local.phase) return false;
  if (msg.activityPhase === 'closed' || msg.activityPhase === 'pick') {
    return true;
  }
  if (msg.activityPhase === 'youtube') {
    if (msg.currentIndex !== local.currentIndex) return false;
    if (msg.youtubeBrowseOpen !== local.youtubeBrowseOpen) return false;
    const pl = msg.playlist;
    const loc = local.playlist;
    if (pl.length !== loc.length) return false;
    for (let i = 0; i < pl.length; i++) {
      if (pl[i]?.id !== loc[i]?.id) return false;
    }
    return true;
  }
  return true;
}

export function buildYoutubeActivityPayload(
  v: VcActivityUiState,
  opts: {
    userId: string;
    name?: string;
    ytPlayback?: EchoYoutubePlaybackSyncV1 | null;
  },
): EchoYoutubeActivityV1 {
  return {
    v: 1,
    t: 'youtube_activity',
    updatedAt: Date.now(),
    fromUserId: opts.userId,
    ...(opts.name?.trim() ? { fromName: opts.name.trim() } : {}),
    activityPhase: v.phase,
    playlist: v.phase === 'youtube' ? [...v.playlist] : [],
    currentIndex: v.phase === 'youtube' ? v.currentIndex : 0,
    youtubeBrowseOpen: v.phase === 'youtube' ? v.youtubeBrowseOpen : false,
    ...(opts.ytPlayback !== undefined ? { ytPlayback: opts.ytPlayback } : {}),
  };
}
