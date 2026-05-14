export type VcYoutubePlaybackStatus =
  | 'unstarted'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'ended'
  | 'cued';

export type VcYoutubePlaybackSnapshot = {
  videoId: string | null;
  status: VcYoutubePlaybackStatus;
  positionSec: number;
  playbackRate: number;
  /** Receiver-local wall clock for `positionSec`; do not compare across clients. */
  capturedAt: number;
  /** Monotonic-ish snapshot timestamp used only for newest-wins ordering. */
  updatedAt: number;
};

const MAX_REASONABLE_YOUTUBE_POSITION_SEC = 60 * 60 * 12;
const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 4;
const PLAYING_DRIFT_RECONCILE_SEC = 1.25;
const STATIONARY_DRIFT_RECONCILE_SEC = 0.5;

function finiteNumber(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

export function clampYoutubePositionSec(n: unknown): number {
  return Math.max(
    0,
    Math.min(MAX_REASONABLE_YOUTUBE_POSITION_SEC, finiteNumber(n, 0)),
  );
}

export function clampYoutubePlaybackRate(n: unknown): number {
  return Math.max(
    MIN_PLAYBACK_RATE,
    Math.min(MAX_PLAYBACK_RATE, finiteNumber(n, 1)),
  );
}

export function sanitizeYoutubePlaybackSnapshot(
  raw: VcYoutubePlaybackSnapshot,
): VcYoutubePlaybackSnapshot | null {
  if (
    raw.status !== 'unstarted' &&
    raw.status !== 'playing' &&
    raw.status !== 'paused' &&
    raw.status !== 'buffering' &&
    raw.status !== 'ended' &&
    raw.status !== 'cued'
  ) {
    return null;
  }
  const videoId =
    typeof raw.videoId === 'string' && raw.videoId.trim()
      ? raw.videoId.trim()
      : null;
  return {
    videoId,
    status: raw.status,
    positionSec: clampYoutubePositionSec(raw.positionSec),
    playbackRate: clampYoutubePlaybackRate(raw.playbackRate),
    capturedAt: finiteNumber(raw.capturedAt, Date.now()),
    updatedAt: finiteNumber(raw.updatedAt, Date.now()),
  };
}

export function youtubeEffectivePositionSec(
  snapshot: VcYoutubePlaybackSnapshot,
  nowMs: number,
): number {
  const s = sanitizeYoutubePlaybackSnapshot(snapshot);
  if (!s) return 0;
  if (s.status !== 'playing') return s.positionSec;
  const elapsedSec = Math.max(0, (nowMs - s.capturedAt) / 1000);
  return clampYoutubePositionSec(s.positionSec + elapsedSec * s.playbackRate);
}

export function youtubePlaybackForPublish(
  snapshot: VcYoutubePlaybackSnapshot | null | undefined,
  nowMs: number,
): VcYoutubePlaybackSnapshot | null {
  if (!snapshot) return null;
  const s = sanitizeYoutubePlaybackSnapshot(snapshot);
  if (!s) return null;
  return {
    ...s,
    positionSec: youtubeEffectivePositionSec(s, nowMs),
    capturedAt: nowMs,
  };
}

export function shouldReconcileYoutubePlayer(opts: {
  desired: VcYoutubePlaybackSnapshot;
  actualVideoId: string | null;
  actualStatus: VcYoutubePlaybackStatus;
  actualPositionSec: number;
  actualPlaybackRate: number;
  nowMs: number;
}): boolean {
  const desired = sanitizeYoutubePlaybackSnapshot(opts.desired);
  if (!desired) return false;
  if ((desired.videoId ?? null) !== (opts.actualVideoId ?? null)) return true;
  if (desired.status !== opts.actualStatus) return true;
  if (Math.abs(desired.playbackRate - opts.actualPlaybackRate) > 0.01)
    return true;
  const desiredPosition = youtubeEffectivePositionSec(desired, opts.nowMs);
  const drift = Math.abs(desiredPosition - opts.actualPositionSec);
  const threshold =
    desired.status === 'playing'
      ? PLAYING_DRIFT_RECONCILE_SEC
      : STATIONARY_DRIFT_RECONCILE_SEC;
  return drift > threshold;
}
