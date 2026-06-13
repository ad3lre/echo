import type { EchoWatchTogetherActivityV1 } from '@/audio/voiceData/watchTogetherActivity';
import type { EchoMediaPlaybackSyncV1 } from '@/audio/voiceData/mediaPlaybackSync';
import type { VcActivityUiState } from '@/features/voice/vcActivityTypes';

let suppressLocalPublish = false;

export function withWatchTogetherSuppressPublish<T>(fn: () => T): T {
  suppressLocalPublish = true;
  try {
    return fn();
  } finally {
    queueMicrotask(() => {
      suppressLocalPublish = false;
    });
  }
}

export function shouldPublishWatchTogether(): boolean {
  return !suppressLocalPublish;
}

export function watchTogetherPayloadMatchesLocalUi(
  msg: EchoWatchTogetherActivityV1,
  local: VcActivityUiState,
): boolean {
  if (msg.activityPhase !== local.phase) return false;
  if (msg.activityPhase === 'closed' || msg.activityPhase === 'pick') {
    return true;
  }
  if (msg.activityPhase !== 'watch_together') return true;
  if (msg.sessionStarted !== local.watchTogetherSessionStarted) return false;
  if (msg.currentIndex !== local.watchTogetherCurrentIndex) return false;
  if (msg.browseOpen !== local.watchTogetherBrowseOpen) return false;
  if (msg.sessionId !== (local.watchTogetherSessionId ?? '')) return false;
  const pl = msg.playlist;
  const loc = local.watchTogetherPlaylist;
  if (pl.length !== loc.length) return false;
  for (let i = 0; i < pl.length; i++) {
    if (pl[i]?.id !== loc[i]?.id) return false;
    if (pl[i]?.storageKey !== loc[i]?.storageKey) return false;
    if (pl[i]?.transcodeStatus !== loc[i]?.transcodeStatus) return false;
    if ((pl[i]?.hlsManifestUrl ?? null) !== (loc[i]?.hlsManifestUrl ?? null)) {
      return false;
    }
    if ((pl[i]?.transcodeError ?? null) !== (loc[i]?.transcodeError ?? null)) {
      return false;
    }
  }
  return true;
}

/** Only the session host should publish lobby/queue snapshots (not passive followers). */
export function shouldPublishWatchTogetherActivity(
  v: VcActivityUiState,
  opts: { selfUserId: string; syncKingUserId: string | null },
): boolean {
  if (v.phase !== 'watch_together') return false;
  if (v.watchTogetherLobbyRole !== 'host') return false;
  const king = opts.syncKingUserId?.trim() || null;
  if (king != null && king !== opts.selfUserId.trim()) return false;
  return true;
}

export function buildWatchTogetherActivityPayload(
  v: VcActivityUiState,
  opts: {
    userId: string;
    name?: string;
    wtPlayback?: EchoMediaPlaybackSyncV1 | null;
  },
): EchoWatchTogetherActivityV1 {
  const sessionId = v.watchTogetherSessionId?.trim() ?? '';
  return {
    v: 1,
    t: 'watch_together_activity',
    updatedAt: Date.now(),
    fromUserId: opts.userId,
    ...(opts.name?.trim() ? { fromName: opts.name.trim() } : {}),
    sessionId,
    activityPhase: v.phase,
    sessionStarted: v.watchTogetherSessionStarted,
    playlist: v.phase === 'watch_together' ? [...v.watchTogetherPlaylist] : [],
    currentIndex:
      v.phase === 'watch_together' ? v.watchTogetherCurrentIndex : 0,
    browseOpen:
      v.phase === 'watch_together' ? v.watchTogetherBrowseOpen : false,
    ...(opts.wtPlayback !== undefined ? { wtPlayback: opts.wtPlayback } : {}),
  };
}
