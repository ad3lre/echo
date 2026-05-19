import type {
  EchoYoutubeActivityV1,
  EchoYoutubePlaybackSyncV1,
} from '@/audio/voiceEchoLiveKitData';
import type { VcActivityUiState } from '@/features/voice/vcActivityTypes';
import {
  normalizeCodenamesRoomUrlForEmbed,
} from '@/features/voice/vcActivityTypes';

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
  if (msg.activityPhase === 'codenames') {
    const mRaw = (msg.codenamesRoomUrl ?? '').trim();
    const lRaw = (local.codenamesRoomUrl ?? '').trim();
    const m = mRaw ? normalizeCodenamesRoomUrlForEmbed(mRaw) ?? mRaw : '';
    const l = lRaw ? normalizeCodenamesRoomUrlForEmbed(lRaw) ?? lRaw : '';
    return m === l;
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
    ...(opts.ytPlayback !== undefined ? { ytPlayback: opts.ytPlayback } : {}),
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
