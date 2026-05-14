import type { EchoYoutubeActivityV1 } from '@/audio/voiceEchoLiveKitData';
import type { VcActivityUiState } from '@/features/voice/vcActivityTypes';
import { normalizeCodenamesRoomUrlForEmbed } from '@/features/voice/vcActivityTypes';

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
 * When LiveKit delivers `youtube_activity` out of order, a joiner can apply a
 * newer snapshot with `codenamesRoomUrl: null` and then ignore an older message
 * that still carries the real room URL. Accept that late URL when it is the
 * only way to recover Codenames for this client.
 */
export function shouldAcceptStaleYoutubeActivityForCodenamesRoomUrl(opts: {
  msgUpdatedAt: number;
  lastAppliedUpdatedAt: number;
  msg: {
    activityPhase: string;
    codenamesRoomUrl?: string | null;
  };
  local: { phase: string; codenamesRoomUrl: string | null | undefined };
}): boolean {
  if (opts.msgUpdatedAt > opts.lastAppliedUpdatedAt) return false;
  if (opts.local.phase !== 'codenames') return false;
  if (opts.msg.activityPhase !== 'codenames') return false;
  const url = opts.msg.codenamesRoomUrl?.trim();
  if (!url) return false;
  if (opts.local.codenamesRoomUrl?.trim()) return false;
  return true;
}

export function buildYoutubeActivityPayload(
  v: VcActivityUiState,
  opts: { userId: string; name?: string },
): EchoYoutubeActivityV1 {
  const base: EchoYoutubeActivityV1 = {
    v: 1,
    t: 'youtube_activity',
    updatedAt: Date.now(),
    fromUserId: opts.userId,
    ...(opts.name?.trim() ? { fromName: opts.name.trim() } : {}),
    activityPhase: v.phase,
    playlist: v.phase === 'youtube' ? [...v.playlist] : [],
    currentIndex: v.phase === 'youtube' ? v.currentIndex : 0,
    youtubeBrowseOpen: v.phase === 'youtube' ? v.youtubeBrowseOpen : false,
  };
  if (v.phase !== 'codenames') return base;
  const u = v.codenamesRoomUrl?.trim() ?? '';
  return {
    ...base,
    codenamesRoomUrl: u
      ? (normalizeCodenamesRoomUrlForEmbed(u) ?? undefined)
      : null,
  };
}
